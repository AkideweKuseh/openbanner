# Architecture

This document describes how OpenBanner fits together end-to-end: the topology, the
request lifecycle, the render pipeline, the browser pool, image resolution, and the
security model. It's aimed at contributors who want to understand the whole system
before changing it.

> For getting a local environment running, see [`DEVELOPMENT.md`](./DEVELOPMENT.md).
> For deployment, see [`../DEPLOY.md`](../DEPLOY.md).

---

## 1. High-level topology

```
            ┌───────────────────────────────────────────────────────────────┐
            │                          One host                              │
            │                                                               │
  Internet  │  HOST nginx ──TLS (certbot)──▶  127.0.0.1:8080                │
  ───443──▶ │                                       │  (Docker compose)      │
            │                                       ▼                         │
            │                       Docker nginx (HTTP, same origin)         │
            │                          /            │          /v1/*         │
            │                          ▼            ▼            │           │
            │                   Designer UI   Render API ◀────────┘          │
            │                  (static files)  (Express + Puppeteer)         │
            │                                        │                       │
            │                                        ▼                       │
            │                                    MinIO (S3)                  │
            │                              (uploaded source images)          │
            └───────────────────────────────────────────────────────────────┘
```

Three services run in Docker — **nginx** (serves the static UI + reverse-proxies the API),
the **Render API** (Node + headless Chromium), and **MinIO** (object storage). They share a
single origin, which is why there's **no CORS in production**: the UI and the API live
behind the same hostname. `n8n` is **not** part of this stack; it runs anywhere and calls
the API server-to-server with `X-API-Key`.

In **dev** (`docker-compose.dev.yml`) there's just one nginx, so `TRUST_PROXY=1`; in
**prod** (host nginx + Docker nginx) there are two hops, so `TRUST_PROXY=2`. The proxy hop
count must be correct for `express-rate-limit` to see real client IPs.

## 2. The Render API request lifecycle

All `/v1/*` routes are mounted by `api/src/app.js` and protected by the `requireApiKey`
middleware (`api/src/auth.js`), except `GET /v1/images/:key`, which is public so rendered
images can be embedded anywhere.

A `POST /v1/templates/:id/render` request flows like this:

1. **Auth** — `requireApiKey` compares the `X-API-Key` header to `API_SECRET_TOKEN`.
2. **Rate limiting** — `express-rate-limit` using `RATE_MAX` / `RATE_WINDOW_MS`.
3. **Body parsing** — limited by `BODY_LIMIT` (must be large enough to hold a base64 image:
   ~1.34× `MAX_IMAGE_BYTES`).
4. **Validation** — the body is parsed by a **Zod** schema (`api/src/schema.js`). Unknown
   fields are stripped; invalid ones return `400`.
5. **Template merge** (`routes/templates.js` → `template-store.js`) — the stored template's
   `slot`s are filled from `mergeVars`, producing a full `{width,height,elements,...}` doc.
6. **Render** (`render.js`, see below) → a PNG/JPEG/WebP buffer.
7. **Response** — streamed back with the right `Content-Type`.

A `POST /v1/render` skips step 5: the caller supplies the full inline design.

## 3. The render pipeline (`api/src/render.js`)

The renderer never interprets user input as code — it turns validated elements into plain
HTML/CSS, then screenshots it. Per element type:

- **`text`** → an absolutely-positioned `<div>`. Alignment anchors the box: `center` applies
  `translateX(-50%)`, `right` applies `translateX(-100%)`, so variable-length merge values
  don't drift. Effects (`gradient`, `neon`) are pure CSS. The text is HTML-escaped.
- **`rect`** → an absolutely-positioned colored `<div>` with `border-radius`.
- **`image`** → an `<img>` whose `src` is resolved to an inline **data URI** (see §5).

The fragments are wrapped in a sized document, and a Puppeteer page is acquired from the
pool. Crucially, the page is locked down before content loads:

```js
await page.setJavaScriptEnabled(false);          // JS never runs
await page.setRequestInterception(true);
page.on('request', (req) => {
  // Only inline content is allowed; every network request is aborted.
  if (url.startsWith('data:') || url.startsWith('about:') || url.startsWith('blob:'))
    req.continue();
  else
    req.abort();
});
```

Then `page.setViewport()` + `page.setContent()` + `page.screenshot({ type, quality })`.
The element → HTML logic **deliberately mirrors the designer's preview**
(`ui/js/designer/canvas.js`), so what you place in the UI is exactly what you get back.

## 4. The browser pool (`api/src/browser-pool.js`)

- One **lazy singleton** Chromium process (`getBrowser()`), relaunched automatically on
  disconnect.
- Each render runs in its own **isolated browser context** (`createBrowserContext()`),
  which is closed when the render finishes — so renders can't leak state, cookies, or
  storage to each other.
- Concurrency is bounded *above* the pool by `render-queue.js` (a `p-queue` with
  `RENDER_CONCURRENCY` workers and a `RENDER_QUEUE_MAX` backlog). When the backlog is full,
  new renders get `503` immediately rather than queueing forever.
- `isReady()` backs the `/readyz` probe (a connected browser = ready to render).

The Chromium container itself is hardened — non-root, `cap_drop ALL`, `--read-only`,
`--no-new-privileges`, `tmpfs` `/tmp` — which is why Chromium's own sandbox is disabled via
`CHROME_NO_SANDBOX=true` (see [`../SECURITY.md`](../SECURITY.md)).

## 5. Image resolution & SSRF guarding (`api/src/image-fetch.js`)

An `image` element's `src` is resolved to an inline data URI by `resolveImageSrc(src)`:

| `src` form | Resolution |
|------------|------------|
| `ob-image:<key>` | An uploaded image. Fetched from MinIO over the internal network with **scoped credentials** (`MINIO_APP_*`). Bypasses the SSRF allow-list. |
| `data:image/*;base64,...` | An inline upload from the designer. Validated (mime + size ≤ `MAX_IMAGE_BYTES`) and passed through. |
| `http(s)://...` | **Off by default.** Only allowed when the host is in `ALLOWED_IMAGE_HOSTS`, and only after passing the SSRF checks below. |

For remote fetches, the guard works in layers:

1. **Host allow-list** — if `ALLOWED_IMAGE_HOSTS` is empty, remote fetch is entirely disabled.
   Otherwise the host must be on the list.
2. **Private-address check** — DNS is resolved for *all* addresses; if any is private/loopback
   (`isPrivateIp` covers RFC 1918, loopback, link-local, ULA, multicast, IPv4-mapped IPv6,
   documentation ranges, broadcast, and "unknown → block"), it's rejected.
3. **IP pinning (anti-rebinding)** — the HTTP(S) request uses a custom `lookup` pinned to the
   already-validated IP, closing the TOCTOU window where a malicious authorized host could
   rebind to a private address between the check and the connect.
4. **No redirects** — 3xx responses are rejected, so a fetch can't bounce to an internal target.
5. **Type + size enforcement** — `Content-Type` must start with `image/`; the body is streamed
   under a hard `MAX_IMAGE_BYTES` cap (both the declared `Content-Length` and the actual bytes).

## 6. Template storage

Templates are JSON documents persisted one-per-file in the `templates-data` volume
(`api/src/template-store.js`, path from `TEMPLATES_DIR`). Each template declares its
**slots** — the named text fields that `mergeVars` fills at render time — plus the element
layout. This keeps the API stateless and the storage swappable (a volume today; a DB
tomorrow would only change this module).

## 7. Observability

- **Structured logs** — `pino` / `pino-http`, level via `LOG_LEVEL`.
- **Metrics** — `prom-client` exposes `/metrics` (Prometheus). nginx blocks this from the
  public internet.
- **Probes** — `/healthz` (process alive) and `/readyz` (Chromium connected). Used by
  Docker healthchecks and the deploy readiness wait.

## 8. Security model summary

The system is built around the assumption that **everything in a render body is
untrusted**. Defense in depth:

- JS is disabled in Chromium; all non-inline requests are aborted at interception.
- Remote images are off by default and triple-guarded when on.
- Auth is a single shared secret on every mutating/read route; the only public route serves
  already-rendered/output images.
- Concurrency, queue depth, timeouts, body size, image size, and request rate are all
  bounded to resist resource exhaustion.
- The stack is never directly internet-facing — only `127.0.0.1:8080`, fronted by a TLS
  terminating nginx.

See [`../SECURITY.md`](../SECURITY.md) for the supported-version policy and how to report
issues.

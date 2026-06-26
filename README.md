<div align="center">

# OpenBanner

Self-hosted, API-driven banner/image generation.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/docker-compose-2496ED?logo=docker&logoColor=white)](./docker-compose.yml)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

</div>

Design a template in the browser, name its text **slots**, publish it, then render variations
by ID via a simple HTTP API — inject text + format, get a PNG/JPEG/WebP back. Uploaded images
are stored in object storage; rendering is done by a hardened, headless Chromium.

```text
Designer UI (vanilla JS)  ──┐
                            ├──► nginx ──► Render API (Express + Puppeteer/Chromium)
External n8n / scripts  ────┘                    │
   POST /v1/.../render  (X-API-Key)              └──► MinIO (uploaded source images)
```

---

## Why OpenBanner?

- **Self-hosted.** Your images, your templates, and your API key never leave your server. No
  third-party rendering SaaS in the loop.
- **Template + slots, not "prompt an image."** You lay out real elements (text, rectangles,
  images) on a canvas and expose named text **slots**. Rendering is deterministic — inject
  `{ "headline": "Hello" }`, get exactly the banner you designed, every time.
- **Render by ID over HTTP.** Publish once, then call `POST /v1/templates/:id/render` from
  n8n, a cron job, a script, or your app. One shared-secret API key, no CORS in production.
- **Hardened by default.** API-key auth on every route, no CORS, remote image fetching off,
  SSRF-guarded when on, and a locked-down Chromium (JS disabled, all network requests aborted).
- **One-command deploy.** A single `deploy.sh` provisions TLS (Let's Encrypt) and brings up
  the whole stack.

## Screenshots

<!-- Drop your screenshots into docs/img/ and replace the placeholders below. Recommended:
     a designer-canvas shot and a rendered output example. -->

<!--
<p align="center">
  <img src="docs/img/designer.png" alt="OpenBanner designer canvas" width="720">
</p>
<p align="center">
  <img src="docs/img/output.png" alt="Rendered banner output" width="360">
</p>
-->

> _Screenshots coming soon._ See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for how it
> works in the meantime.

---

## Tech stack

| Layer | What |
|-------|------|
| **API** | Node 24, Express 5, Puppeteer (headless Chromium), Zod, pino, prom-client, p-queue, MinIO SDK |
| **UI** | Vanilla ES modules (no framework/build step) — designer canvas + dashboard |
| **Infra** | nginx (TLS, reverse proxy, static UI), MinIO (S3-compatible object storage), Docker Compose |

n8n is **not** part of this stack — any external n8n instance calls the API server-to-server.

---

## Quick start (local development)

Requires Docker + Docker Compose.

```bash
cp .env.example .env          # the dev defaults work as-is for localhost
docker compose -f docker-compose.dev.yml up -d --build
# open http://localhost:8080
```

The dev stack runs the **render API + Chromium + MinIO** plus one nginx that serves the UI
and reverse-proxies the API on the **same origin** (`http://localhost:8080`) — no CORS, no TLS.

In the app: sign in (mock auth — any email + 4+ char password), open **API Settings** (gear),
set the API URL to `http://localhost:8080` and the API key to `API_SECRET_TOKEN` from `.env`.

> If you recreate only the API container, reload nginx so it re-resolves the upstream:
> `docker exec ob-dev-nginx nginx -s reload`

For running the API bare, tests, and Chromium debugging tips, see
[`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md).

---

## Project structure

```text
api/
  src/
    app.js            Express app: middleware, routes, error handling
    server.js         HTTP server + graceful shutdown
    config.js         Env-driven config (single source of truth)
    auth.js           X-API-Key check + requireApiKey middleware
    cors.js           Env-gated CORS (+ OPTIONS preflight)
    schema.js         Zod schemas: elements, render + template bodies
    render.js         Element → HTML → Chromium screenshot
    browser-pool.js   Puppeteer page pool + readiness
    render-queue.js   Bounded concurrency queue (p-queue)
    image-fetch.js    Resolve image src: ob-image: | data: | http(s) (SSRF-guarded)
    storage.js        MinIO client: put/get uploaded images
    template-store.js Template persistence (JSON files on a volume)
    routes/           render.js · templates.js · images.js · health.js
ui/
  index.html
  js/
    api.js            API client (fetch wrapper, image URL resolver)
    auth.js           Mock client-side session
    designer/         canvas · elements · properties · toolbar · templates · history · presets
    dashboard/        health · metrics · renders
nginx/                nginx.dev.conf · nginx.conf.template (prod, rendered by deploy.sh)
docker-compose.dev.yml   local dev (UI+API+MinIO, same origin)
docker-compose.yml       production (nginx TLS + API + MinIO)
deploy.sh                one-command production deploy
DEPLOY.md                deployment guide
docs/                    ARCHITECTURE.md · DEVELOPMENT.md
```

---

## API reference

All `/v1/*` routes require an `X-API-Key` header, **except** `GET /v1/images/:key` (public).

| Method & path | Purpose |
|---|---|
| `POST /v1/render` | Render a full inline design (`{width,height,elements,...}`) → image |
| `POST /v1/templates` | Create a reusable template; returns `{id, slots, ...}` |
| `GET /v1/templates` | List template summaries |
| `GET /v1/templates/:id` | Get one template |
| `PUT /v1/templates/:id` | Update a template's layout/slots |
| `DELETE /v1/templates/:id` | Delete a template |
| `POST /v1/templates/:id/render` | Render a template: `{format, mergeVars:{slot:text}}` → image |
| `POST /v1/images` | Upload a source image (raw `image/*` body) → `{key, ref, url}` |
| `GET /v1/images/:key` | **Public** — serve an uploaded image (proxied from MinIO) |
| `GET /healthz` · `GET /readyz` | Liveness / readiness (Chromium connected) |
| `GET /metrics` | Prometheus metrics (blocked from the internet at nginx) |

Example — render a template by ID:

```bash
curl -X POST https://api.<domain>/v1/templates/<id>/render \
  -H "X-API-Key: $API_SECRET_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"format":"png","mergeVars":{"headline":"Hello"}}' \
  -o banner.png
```

### Elements & image sources

Templates are an ordered list of `text`, `rect`, and `image` elements (see `schema.js`).
- **Text** has an `align` (`left`/`center`/`right`) that anchors it on its X so variable-length
  merge values don't drift.
- **Image `src`** may be an `ob-image:<key>` reference (uploaded → MinIO), an inline
  `data:image/...` URI, or a remote `http(s)` URL (only if its host is in `ALLOWED_IMAGE_HOSTS`;
  remote fetches are SSRF-guarded). Uploaded/data images are unaffected by the allow-list.

---

## Configuration

Set via `.env` (see `.env.example` for the annotated full list). Key vars:

| Var | Default | Notes |
|-----|---------|-------|
| `API_SECRET_TOKEN` | — (required) | clients send it as `X-API-Key` |
| `BODY_LIMIT` | `12mb` | must hold a base64 image (~1.34× `MAX_IMAGE_BYTES`) |
| `MAX_IMAGE_BYTES` | `5242880` | per-image cap (upload + render) |
| `ALLOWED_IMAGE_HOSTS` | empty | remote image hosts; empty = remote fetch disabled |
| `MINIO_ENDPOINT` | `minio` | unset = uploads disabled (UI falls back to data URIs) |
| `MINIO_APP_USER/PASSWORD`, `MINIO_BUCKET_NAME` | — | scoped storage creds |
| `CORS_ALLOWED_ORIGINS` | empty | `*` for local dev only; leave unset in prod |
| `RENDER_CONCURRENCY` / `RENDER_QUEUE_MAX` | `3` / `50` | render throughput / backpressure |

---

## Deployment

Production is a single command — see **[DEPLOY.md](./DEPLOY.md)**:

```bash
cp .env.example .env && nano .env   # set DOMAIN, API_SECRET_TOKEN, secrets
./deploy.sh                          # --gen-secrets to auto-fill, --self-signed for test certs
```

`deploy.sh` renders the nginx config from `nginx/nginx.conf.template`, provisions certs,
builds, launches (`app.`/`api.`/`minio.<domain>`), and waits for the API to be ready.

---

## Documentation

- **[Architecture](./docs/ARCHITECTURE.md)** — topology, request lifecycle, render pipeline,
  browser pool, SSRF guarding, security model.
- **[Development](./docs/DEVELOPMENT.md)** — local dev with/without Docker, tests, debugging.
- **[Deployment](./DEPLOY.md)** — production setup, TLS, updates.
- **[Security policy](./SECURITY.md)** — supported versions, security model, reporting.

## Contributing

Contributions are welcome! Please read **[CONTRIBUTING.md](./CONTRIBUTING.md)** for the dev
setup, branching/commit conventions, and the PR process. By contributing, you agree your
contributions are licensed under the MIT License. This project follows the
[Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md).

See the [changelog](./CHANGELOG.md) for release history.

## License

Released under the **MIT License** — see [LICENSE](./LICENSE).

```
Copyright (c) 2026 Akidewe Kuseh
```

---

Made by [@AkideweKuseh](https://github.com/AkideweKuseh) · 🇬🇭 Ghana

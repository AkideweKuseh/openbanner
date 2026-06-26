# Development guide

This guide covers running OpenBanner locally, with and without Docker, running the tests,
and a few debugging tips for the headless-Chromium render path.

> If you just want to *use* the stack, the
> [Quick start](../README.md#quick-start-local-development) in the README is enough.
> This doc is for people hacking on the code.

---

## Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| **Docker + Docker Compose v2** | any recent | The recommended local stack (`docker compose`) |
| **Node.js** | 22+ (`>=22`, tested on 22/24) | Only needed if you run the API **outside** Docker |
| **Chromium deps** | n/a | Handled by the `api/Dockerfile`; if you run bare, see below |
| **`openssl`** | any | To mint a local `API_SECRET_TOKEN` |

## Option A — Docker dev stack (recommended)

This runs everything (UI + API + Chromium + MinIO) on one origin at `http://localhost:8080`,
no TLS, no CORS:

```bash
cp .env.example .env          # the dev defaults work as-is for localhost
docker compose -f docker-compose.dev.yml up -d --build
# open http://localhost:8080
```

Sign in (mock auth — any email + 4+ char password), open **API Settings** (gear), and set the
API URL to `http://localhost:8080` and the API key to `API_SECRET_TOKEN` from `.env`.

Tear it down (keeping data):

```bash
docker compose -f docker-compose.dev.yml down
```

Wipe data too (templates + uploads): add `-v`.

> **Gotcha:** if you recreate only the API container, nginx may have cached the old upstream.
> Force a re-resolve: `docker exec ob-dev-nginx nginx -s reload`.

Useful dev-only `.env` overrides:

```bash
CORS_ALLOWED_ORIGINS=*        # allow a browser from another origin (DEV ONLY)
ALLOWED_IMAGE_HOSTS=example.com,images.example.com   # enable remote image fetch
LOG_LEVEL=debug
```

## Option B — bare Node API (UI + API from source)

Useful for fast iteration on server code with hot `node` restarts. You still get the UI via
the dev nginx, or you can open the UI files directly.

```bash
cd api
npm install
# Chromium: puppeteer downloads its own build, but on a bare Linux host you may need
# system deps (libnss3, libatk1.0, libxkbcommon0, fonts-liberation, ...). The
# api/Dockerfile lists the exact set — copy from there if apt-get complains.
cp ../.env.example ../.env    # then edit API_SECRET_TOKEN, MINIO_* (or skip MinIO)
API_SECRET_TOKEN=$(openssl rand -base64 36) PORT=3000 npm start
```

Without `MINIO_ENDPOINT` set, uploads are disabled and the designer falls back to inline
`data:` URIs — that's fine for most local work.

For the UI, either run the dev nginx (Option A) or serve `ui/` with any static server, e.g.
`npx serve ui` (then point the gear-modal API URL at your bare API on `:3000`; set
`CORS_ALLOWED_ORIGINS` to the UI origin accordingly).

## Running the tests

The API uses Node's built-in test runner:

```bash
cd api
npm test
```

There's no UI test suite today; verify UI changes by hand in the designer + dashboard.

## Debugging a render

Renders that look wrong are almost always a mismatch between the **designer preview** and the
**renderer**. The renderer (`api/src/render.js`) is deliberately written to mirror
`ui/js/designer/canvas.js` — when you change one, check the other.

To see exactly what Chromium is given:

1. Temporarily log the generated HTML in `renderImage()` (`api/src/render.js`):
   ```js
   const html = wrapDocument(doc, fragments.join(''));
   logger.debug({ html }, 'render doc');   // add this
   ```
2. Save it to a `.html` file and open it in a real browser — it'll render identically to
   what Chromium screenshots (same zeroed-out reset CSS, same sized `<body>`).
3. For element positioning issues, remember the alignment anchor rule: `center` →
   `translateX(-50%)`, `right` → `translateX(-100%)`. If text "drifts" with variable content,
   you've probably got the wrong `align` for the anchor you want.

## Debugging headless Chromium

- **Crashes / "No usable sandbox":** the container disables Chromium's own sandbox because the
  container *is* the sandbox (non-root, `cap_drop ALL`, read-only). Don't flip
  `CHROME_NO_SANDBOX=false` unless you supply a seccomp/AppArmor profile.
- **Shared-memory exhaustion on renders:** the `--disable-dev-shm-usage` flag handles this;
  keep it.
- **Fonts missing / wrong glyphs:** add the font to the container (the Dockerfile installs a
  base font set) or embed a webfont in the template.
- **Hangs:** check `RENDER_TIMEOUT_MS` (per-render) vs `IMAGE_FETCH_TIMEOUT_MS` (per remote
  image) — a render that seems to hang is usually a remote-image fetch that's slow/timing out.

## Project layout reminder

```
api/      Express render API + Puppeteer/Chromium + MinIO client  (this is where most logic lives)
ui/       Designer canvas + dashboard                             (vanilla JS, no build step)
nginx/    Reverse proxy configs (dev + prod template)
docs/     This file + ARCHITECTURE.md
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for how requests flow through these pieces, and
[`../CONTRIBUTING.md`](../CONTRIBUTING.md) for how to propose a change.

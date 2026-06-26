# Changelog

All notable changes to **OpenBanner** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- MIT `LICENSE` and open-source community files (`CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, issue/PR templates).
- `docs/ARCHITECTURE.md` and `docs/DEVELOPMENT.md` deep-dives.

## [1.0.0] — 2026-06-18

First production release.

### Added
- **Render API** (Express 5 + Puppeteer/headless Chromium) with element-based rendering
  (`text`, `rect`, `image`), bounded concurrency queue, and graceful shutdown.
- **Template store** — create, list, get, update, delete templates; render by ID with
  `mergeVars` slot injection. Templates persist as JSON on a volume.
- **Image handling** — upload source images to MinIO (S3-compatible) object storage and
  reference them via `ob-image:<key>`; inline `data:` URIs; remote `http(s)` fetches gated
  behind `ALLOWED_IMAGE_HOSTS` and SSRF-guarded.
- **Designer UI** — vanilla-JS canvas, element inspector, typography controls, layer panel
  with drag-to-reorder, undo/redo history, and presets.
- **Dashboard UI** — health, Prometheus metrics, and render history views.
- **Auth** — `X-API-Key` middleware; `GET /v1/images/:key` is the only public route.
- **Infra** — Docker Compose for prod (host nginx TLS + Docker nginx + API + MinIO) and dev
  (single origin, no TLS), plus a one-command `deploy.sh` with `--gen-secrets`,
  `--le-staging`, and `--no-tls` flags.
- **Security hardening** — non-root read-only Chromium container with `cap_drop ALL` and
  `no-new-privileges`, rate limiting, body/image size caps, `helmet`, and CORS locked down
  by default.
- **Observability** — `pino` structured logging, Prometheus `/metrics`, and
  `/healthz` · `/readyz` probes.

[Unreleased]: https://github.com/AkideweKuseh/openbanner/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/AkideweKuseh/openbanner/releases/tag/v1.0.0

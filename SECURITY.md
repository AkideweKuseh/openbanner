# Security Policy

OpenBanner is a self-hosted service that accepts untrusted input (template JSON,
uploaded images, remote image URLs) and renders it with headless Chromium. That
makes security a first-class concern. This document covers **supported versions**,
the project's **security model**, and **how to report a vulnerability**.

## Supported versions

Only the latest release on `main` is actively supported. Security fixes go to `main`
first and are included in the next deploy.

| Version | Supported |
|---------|-----------|
| `main` (latest) | ✅ |
| Older tags | ❌ — update to the latest release |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Instead, report privately using one of:

- **GitHub Security Advisories** (preferred): go to
  [Report a vulnerability](https://github.com/AkideweKuseh/openbanner/security/advisories/new)
  and submit a draft advisory, or
- **Email** the maintainer at **kuseh@smartinnovationsgh.com**.

Please include:

- A description of the issue and its impact.
- Steps to reproduce, including the exact request body / config if relevant.
- The version or commit you tested against.

You will get an acknowledgement within **5 business days**. We will coordinate a fix and
disclosure timeline with you, and credit you in the advisory unless you'd prefer to remain
anonymous.

## Security model (what we already harden against)

When deploying and extending OpenBanner, keep these design assumptions in mind:

- **Auth by API key.** Every `/v1/*` route except `GET /v1/images/:key` requires an
  `X-API-Key` header matching `API_SECRET_TOKEN`. Generate it with
  `openssl rand -base64 36` (or `deploy.sh --gen-secrets`). Never commit it.
- **No CORS by default in production.** `CORS_ALLOWED_ORIGINS` is unset → the API sends no
  CORS headers. The UI is served on the **same origin** as the API, so it doesn't need CORS.
  Use `*` only for local dev.
- **Remote image fetching is off by default.** `ALLOWED_IMAGE_HOSTS` is empty → remote
  `http(s)` image sources are refused. Uploaded images (`ob-image:`) and inline `data:`
  URIs are unaffected. When enabled, remote fetches are **SSRF-guarded** (private/loopback
  ranges blocked) and size-capped by `MAX_IMAGE_BYTES`.
- **Hardened Chromium container.** Runs non-root with `cap_drop ALL`, `--read-only`,
  `--no-new-privileges`, and a `tmpfs` for `/tmp`. Chromium's own sandbox is therefore
  disabled via `CHROME_NO_SANDBOX=true` (the container *is* the sandbox). Do **not** set
  this to false unless you supply a proper seccomp/AppArmor profile.
- **Bounded concurrency & timeouts.** `RENDER_CONCURRENCY`, `RENDER_QUEUE_MAX`,
  `RENDER_TIMEOUT_MS`, `IMAGE_FETCH_TIMEOUT_MS`, `MAX_IMAGE_BYTES`, `BODY_LIMIT`, and
  rate limiting (`RATE_MAX` / `RATE_WINDOW_MS`) all protect against resource exhaustion.
- **Not directly internet-facing.** The Docker stack publishes only `127.0.0.1:8080`; a
  host nginx terminates TLS and reverse-proxies. `/metrics` is blocked from the public
  internet at nginx.

## Deployment checklist

Before exposing an instance to the internet:

- [ ] `API_SECRET_TOKEN`, `MINIO_ROOT_PASSWORD`, `MINIO_APP_PASSWORD` are real secrets (not
      `__CHANGE_ME__`).
- [ ] `CORS_ALLOWED_ORIGINS` is **unset** (same-origin).
- [ ] `ALLOWED_IMAGE_HOSTS` is empty unless you specifically need remote images.
- [ ] TLS is terminated by the host nginx (certbot/Let's Encrypt), and `/metrics` stays
      internal.
- [ ] `TRUST_PROXY` reflects your real proxy hop count (prod = 2, local dev = 1).
- [ ] `.env` is **never** committed (it's git-ignored — keep it that way).

## Dependency security

Dependencies are pinned in [`api/package.json`](./api/package.json). If you find a
vulnerable dependency, please report it via the channels above. A GitHub-hosted
`Dependabot` configuration may be added in future.

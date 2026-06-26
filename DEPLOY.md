# Deploying OpenBanner

One script does the whole setup: runs the app in Docker on `127.0.0.1:8080`, points your
**host nginx** at it, and gets a TLS cert via the host's **certbot** (`certbot --nginx`,
which also auto-renews).

This stack hosts the **designer UI + render API + MinIO**, all on **one host** (UI at `/`,
API at `/v1/*`, same origin → no CORS). n8n is **not** included — run it wherever you like
and have it call `https://<domain>/v1/...` with your `X-API-Key`.

```
Internet ──443──▶ HOST nginx (TLS, certbot --nginx, auto-renew)
                      │ proxy_pass
                      ▼
              127.0.0.1:8080  ──▶ Docker nginx (HTTP) ──▶ UI /  +  API /v1/*  +  MinIO
```

## Prerequisites on the VPS
- Docker + Docker Compose v2 (`docker compose`), `openssl`
- **Host nginx + certbot** already installed (with the nginx plugin: `python3-certbot-nginx`).
- DNS: one A/AAAA record pointing `<domain>` at the server **before** you run the script
  (Let's Encrypt validates over port 80).
- Ports 80 and 443 open to the host nginx.

## Steps

```bash
git clone https://github.com/AkideweKuseh/openbanner.git && cd openbanner

cp .env.example .env
nano .env                 # set DOMAIN, LETSENCRYPT_EMAIL, MINIO_ROOT_USER

chmod +x deploy.sh        # first run only
./deploy.sh --gen-secrets # add --le-staging to test TLS without hitting rate limits
```

(If the exec bit didn't survive cloning, `bash deploy.sh` works too.)

The script prints the URLs and your API key at the end.

### Flags
- `--gen-secrets` — auto-fill any blank/`__CHANGE_ME__` secret (API token, MinIO
  passwords) with `openssl rand`, writing them back into `.env`.
- `--le-staging` — use Let's Encrypt **staging** (for testing; avoids the prod rate limit).
- `--no-tls` — skip the host-nginx + certbot step (the app stays on `127.0.0.1:8080` and
  you wire up your own proxy/cert).

## What you must set in `.env`
| Key | What |
|-----|------|
| `DOMAIN` | the host, e.g. `banner.smartinnovationsgh.com` (no scheme, no trailing slash) |
| `LETSENCRYPT_EMAIL` | your email (Let's Encrypt expiry notices) |
| `MINIO_ROOT_USER` | a MinIO admin name (e.g. `obadmin`) — not auto-generated |
| `API_SECRET_TOKEN`, `MINIO_ROOT_PASSWORD`, `MINIO_APP_PASSWORD` | secrets (or use `--gen-secrets`) |

Leave `CORS_ALLOWED_ORIGINS` **unset** (same origin), and keep `MINIO_ENDPOINT=minio`,
`BODY_LIMIT=12mb`, `TRUST_PROXY=2`.

## After deploy
1. Open `https://<domain>`, sign in, open **API Settings** (gear) and set the API URL to
   `https://<domain>` (same host) and the API key to your `API_SECRET_TOKEN`.
2. Design a template, upload an image (stored in MinIO), publish, render.

## Calling the API from n8n (separate instance)
Use an **HTTP Request** node — it's a server-to-server call, no CORS:
```
POST https://<domain>/v1/templates/<template-id>/render
Header: X-API-Key: <your API_SECRET_TOKEN>
Body (JSON): {"format":"png","mergeVars":{"headline":"Hello"}}
```
The response is the rendered image. (`/v1/render` accepts a full inline design too.)

## TLS & renewal
`certbot --nginx` installs the cert into your **host** nginx and registers a renewal timer
(`systemctl list-timers | grep certbot`), so renewal is automatic — nothing to schedule.
The host nginx site config lives at `/etc/nginx/conf.d/openbanner-<domain>.conf`; to change
the proxy settings, edit it (or delete it and re-run `./deploy.sh`).

## Updating (already deployed)
For everyday updates use the dedicated script — it skips the one-time setup (no certbot,
no secret-gen, no host-nginx rewrite) and reloads the internal nginx so it re-resolves the
recreated `rendering-api` upstream (which otherwise returns 502 after every API rebuild):
```bash
./redeploy.sh          # git pull → build → up → reload nginx → wait
./redeploy.sh --no-pull  # deploy the current checkout as-is
```

`./deploy.sh` still works and is idempotent, but it re-runs the certbot/TLS step each time,
so prefer `./redeploy.sh` for routine updates. Use `./deploy.sh` only for first-time
install or when you actually need to re-provision TLS/host-nginx.

## Notes
- `nginx/nginx.generated.conf` is the internal (HTTP) Docker config, produced from
  `nginx/nginx.conf.template` and git-ignored — edit the **template**, not the generated file.
- Templates persist in the `templates-data` volume; uploaded images in `minio-data`.
- The Docker stack publishes **only** `127.0.0.1:8080` — it's never directly internet-facing.

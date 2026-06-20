# Deploying OpenBanner

One script does the whole setup: renders the nginx config + TLS hostnames from your domain,
builds, launches, and waits for the API to be ready.

This stack hosts the **designer UI + render API + MinIO**. n8n is **not** included — run it
wherever you like and have it call `https://api.<domain>` with your `X-API-Key`.

## Prerequisites on the VPS
- Docker + Docker Compose v2 (`docker compose`), `openssl`
- DNS: point these A/AAAA records at the server —
  `app.<domain>`, `api.<domain>`, `minio.<domain>`
- TLS certs (recommended): a wildcard or SAN cert for the subdomains at
  `certs/fullchain.pem` and `certs/privkey.pem` (e.g. from certbot). For a quick test
  without real certs, pass `--self-signed`.

## Steps

```bash
git clone <repo> && cd open-banner-stack

cp .env.example .env
nano .env                 # set DOMAIN, API_SECRET_TOKEN, and the secrets

chmod +x deploy.sh        # first run only
./deploy.sh               # or: ./deploy.sh --gen-secrets --self-signed
```

(If the exec bit didn't survive cloning, `bash deploy.sh` works too.)

That's it. The script prints the URLs and your API key at the end.

### Flags
- `--gen-secrets` — auto-fill any blank/`__CHANGE_ME__` secret (API token, MinIO
  passwords) with `openssl rand`, writing them back into `.env`.
- `--self-signed` — generate a throwaway self-signed cert for the subdomains so the
  stack boots without real certs (browsers will warn; replace before going live).

## What you must set in `.env`
| Key | What |
|-----|------|
| `DOMAIN` | your base domain (subdomains are derived) |
| `API_SECRET_TOKEN` | the `X-API-Key` clients / your n8n instance send |
| `MINIO_ROOT_USER/PASSWORD`, `MINIO_APP_USER/PASSWORD`, `MINIO_BUCKET_NAME` | object storage |

Leave `CORS_ALLOWED_ORIGINS` **unset** (nginx adds CORS in prod), keep `MINIO_ENDPOINT=minio`
and `BODY_LIMIT=12mb`.

## After deploy
1. Open `https://app.<domain>`, sign in, open **API Settings** (gear) and set the API URL to
   `https://api.<domain>` and the API key to your `API_SECRET_TOKEN`.
2. Design a template, upload an image (stored in MinIO), publish, render.

## Calling the API from n8n (separate instance)
Use an **HTTP Request** node — it's a server-to-server call, no CORS:
```
POST https://api.<domain>/v1/templates/<template-id>/render
Header: X-API-Key: <your API_SECRET_TOKEN>
Body (JSON): {"format":"png","mergeVars":{"headline":"Hello"}}
```
The response is the rendered image. (`/v1/render` accepts a full inline design too.)

## Updating
```bash
git pull && ./deploy.sh
```
Re-running is safe and idempotent. If you recreate only `rendering-api`, also run
`docker compose exec nginx nginx -s reload` so nginx re-resolves the upstream.

## Notes
- `nginx/nginx.generated.conf` is produced by the script from `nginx/nginx.conf.template`
  and is git-ignored — edit the **template**, not the generated file.
- Templates persist in the `templates-data` volume; uploaded images in `minio-data`.
- Real TLS via certbot (example): obtain a cert for the subdomains, then copy/symlink the
  fullchain + privkey into `certs/` and re-run `./deploy.sh`.

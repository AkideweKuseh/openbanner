#!/usr/bin/env bash
#
# OpenBanner one-command deploy (single host, behind the VPS's existing nginx).
#
#   1) cp .env.example .env  &&  edit .env   (DOMAIN, LETSENCRYPT_EMAIL, secrets)
#   2) ./deploy.sh --gen-secrets
#
# What it does: runs the app (UI + render API + MinIO) as Docker containers published
# only on 127.0.0.1:8080, then points the HOST nginx at it and obtains a TLS cert with
# the host's certbot (`certbot --nginx`, which also sets up automatic renewal).
#
#   Flags:
#     --gen-secrets   fill blank/__CHANGE_ME__ secrets with openssl rand
#     --le-staging    use Let's Encrypt staging (testing; avoids rate limits)
#     --no-tls        skip the host-nginx + certbot step (manage TLS yourself)
#
set -euo pipefail
cd "$(dirname "$0")"

# ── pretty logging ───────────────────────────────────────────────────────────
c_reset=$'\033[0m'; c_blue=$'\033[34m'; c_green=$'\033[32m'; c_yellow=$'\033[33m'; c_red=$'\033[31m'
log()  { printf '%s==>%s %s\n' "$c_blue" "$c_reset" "$*"; }
ok()   { printf '%s ✓ %s%s\n' "$c_green" "$*" "$c_reset"; }
warn() { printf '%s ! %s%s\n' "$c_yellow" "$*" "$c_reset"; }
die()  { printf '%s ✗ %s%s\n' "$c_red" "$*" "$c_reset" >&2; exit 1; }

GEN_SECRETS=false; LE_STAGING=""; NO_TLS=false
for arg in "$@"; do
  case "$arg" in
    --gen-secrets) GEN_SECRETS=true ;;
    --le-staging)  LE_STAGING="--staging" ;;
    --no-tls)      NO_TLS=true ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown option: $arg" ;;
  esac
done

SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"

# ── 0. prerequisites ─────────────────────────────────────────────────────────
log "Checking prerequisites"
command -v docker >/dev/null  || die "docker is not installed"
command -v openssl >/dev/null || die "openssl is not installed"
if docker compose version >/dev/null 2>&1; then COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then COMPOSE=(docker-compose)
else die "docker compose (v2) or docker-compose (v1) is required"; fi
COMPOSE+=(-f docker-compose.yml)
if ! $NO_TLS; then
  command -v nginx   >/dev/null || die "host nginx not found — install it, or pass --no-tls to manage TLS yourself"
  command -v certbot >/dev/null || die "certbot not found — install certbot + the nginx plugin, or pass --no-tls"
fi
ok "prerequisites present"

# ── 1. .env ──────────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env 2>/dev/null || true
  die ".env created from .env.example — fill in DOMAIN, LETSENCRYPT_EMAIL and the secrets, then re-run."
fi
chmod 600 .env 2>/dev/null || true   # .env holds secrets — keep it owner-only

set_env() {
  local key="$1" val="$2"
  if grep -qE "^${key}=" .env; then sed -i "s|^${key}=.*|${key}=${val}|" .env
  else printf '%s=%s\n' "$key" "$val" >> .env; fi
}

# ── 2. optional secret generation ────────────────────────────────────────────
load_env() { set -a; # shellcheck disable=SC1091
  source ./.env; set +a; }
load_env

if $GEN_SECRETS; then
  log "Generating any blank/placeholder secrets"
  gen() { local k="$1" n="${2:-24}" cur="${!1:-}"
    if [ -z "$cur" ] || [ "$cur" = "__CHANGE_ME__" ]; then set_env "$k" "$(openssl rand -base64 "$n")"; ok "generated $k"; fi; }
  gen API_SECRET_TOKEN 36
  gen MINIO_ROOT_PASSWORD 24
  gen MINIO_APP_PASSWORD 24
  load_env
fi

# ── 3. validate required values ──────────────────────────────────────────────
log "Validating .env"
required=(DOMAIN API_SECRET_TOKEN MINIO_ROOT_USER MINIO_ROOT_PASSWORD \
          MINIO_APP_USER MINIO_APP_PASSWORD MINIO_BUCKET_NAME)
$NO_TLS || required+=(LETSENCRYPT_EMAIL)
missing=()
for k in "${required[@]}"; do
  v="${!k:-}"
  if [ -z "$v" ] || [ "$v" = "__CHANGE_ME__" ] || [[ "$v" == *your-domain.com* ]] || [[ "$v" == *you@example.com* ]]; then missing+=("$k"); fi
done
[ ${#missing[@]} -eq 0 ] || die "These .env values still need to be set: ${missing[*]}  (tip: --gen-secrets auto-fills secrets)"

# Guardrails that silently break prod if wrong:
[ -z "${CORS_ALLOWED_ORIGINS:-}" ] || warn "CORS_ALLOWED_ORIGINS is set ('$CORS_ALLOWED_ORIGINS'); single-host serving is same-origin, so leave it UNSET."
[ "${MINIO_ENDPOINT:-}" = "minio" ] || warn "MINIO_ENDPOINT is '${MINIO_ENDPOINT:-<unset>}' (expected 'minio'); image uploads will be disabled and the designer will fall back to inline data URIs."
case "${BODY_LIMIT:-}" in ""|512kb) warn "BODY_LIMIT is '${BODY_LIMIT:-<unset>}'; set it to 12mb or publishing image templates will 413." ;; esac
[ "${TRUST_PROXY:-}" = "2" ] || warn "TRUST_PROXY is '${TRUST_PROXY:-<unset>}'; set it to 2 (host nginx + docker nginx) for correct per-client rate limiting."
ok "required values present (domain: $DOMAIN)"

# ── 4. render the internal (Docker) nginx config ─────────────────────────────
log "Rendering internal nginx config"
sed "s|__DOMAIN__|${DOMAIN}|g" nginx/nginx.conf.template > nginx/nginx.generated.conf
ok "wrote nginx/nginx.generated.conf"

# ── 5. build + launch (published on 127.0.0.1:8080) ──────────────────────────
log "Building images (first run can take a few minutes)"
"${COMPOSE[@]}" build
log "Starting the app stack"
"${COMPOSE[@]}" up -d
"${COMPOSE[@]}" logs minio-init 2>/dev/null | tail -n 3 || true

# ── 6. wait for the render API to be ready ───────────────────────────────────
log "Waiting for the render API (Chromium warm-up)…"
ready=false
for _ in $(seq 1 45); do
  if "${COMPOSE[@]}" exec -T rendering-api node -e \
      "fetch('http://127.0.0.1:3000/readyz').then(r=>r.json()).then(j=>process.exit(j.status==='ready'?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    ready=true; break
  fi
  sleep 2
done
$ready && ok "render API is ready (http://127.0.0.1:8080)" || warn "render API not ready yet — check: ${COMPOSE[*]} logs rendering-api"

# ── 7. host nginx reverse proxy + TLS via certbot ────────────────────────────
if $NO_TLS; then
  warn "Skipping host nginx + TLS (--no-tls). App is on http://127.0.0.1:8080 — wire up your own proxy + cert."
else
  log "Configuring host nginx reverse proxy for $DOMAIN"
  host_conf="$(cat <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name __DOMAIN__;

    client_max_body_size 13m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX
)"
  host_conf="${host_conf//__DOMAIN__/$DOMAIN}"
  conf_path="/etc/nginx/conf.d/openbanner-$DOMAIN.conf"
  if [ -f "$conf_path" ]; then
    ok "host nginx site already present ($conf_path) — leaving it (certbot manages TLS there)"
  else
    printf '%s\n' "$host_conf" | $SUDO tee "$conf_path" >/dev/null
    ok "wrote $conf_path"
  fi
  $SUDO nginx -t || die "host nginx config test failed — fix the error above and re-run"
  $SUDO systemctl reload nginx 2>/dev/null || $SUDO nginx -s reload || true

  log "Obtaining/installing the TLS certificate via certbot (nginx plugin)"
  warn "Requires: $DOMAIN already resolves to this server and ports 80/443 are open."
  $SUDO certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
    -m "$LETSENCRYPT_EMAIL" --redirect $LE_STAGING \
    || die "certbot failed — verify DNS for $DOMAIN points here, ports 80/443 are reachable, and Let's Encrypt rate limits."
  ok "TLS active on https://$DOMAIN (certbot auto-renews via its systemd timer)"
fi

# ── 8. summary ───────────────────────────────────────────────────────────────
# Only reveal the API key on an interactive terminal so it can't leak into captured logs.
if [ -t 1 ]; then api_key_display="$API_SECRET_TOKEN"
else api_key_display="(hidden — run: grep ^API_SECRET_TOKEN= .env)"; fi

cat <<EOF

$c_green──────────────────────────────────────────────────────────────$c_reset
$c_green OpenBanner is deployed$c_reset

  App + API     https://$DOMAIN          (open this; use the same URL as the API URL in the gear modal)
  Local (proxy) http://127.0.0.1:8080    (Docker; the host nginx sits in front)

  API key (X-API-Key):  $api_key_display

  Call from any n8n instance (server-to-server, no CORS):
    POST https://$DOMAIN/v1/templates/<id>/render
    header  X-API-Key: <the key above>
    body    {"format":"png","mergeVars":{"headline":"..."}}

  TLS:    host nginx + certbot (automatic renewal via certbot.timer)
  DNS:    point $DOMAIN at this server (one A/AAAA record)
  Update: git pull && ./deploy.sh        Logs: ${COMPOSE[*]} logs -f rendering-api
$c_green──────────────────────────────────────────────────────────────$c_reset
EOF

#!/usr/bin/env bash
#
# OpenBanner one-command deploy (single-host topology).
#
#   1) cp .env.example .env   &&   edit .env   (set DOMAIN, API_SECRET_TOKEN, secrets)
#   2) ./deploy.sh            (add --gen-secrets to auto-fill blank secrets,
#                              --self-signed to make a throwaway TLS cert for testing)
#
# Serves the UI + render API from ONE origin (https://$DOMAIN). Idempotent: re-run any
# time to apply .env / code changes. Renders the nginx config from
# nginx/nginx.conf.template, builds, launches, and waits for the API to report ready.
#
set -euo pipefail
cd "$(dirname "$0")"

# ── pretty logging ───────────────────────────────────────────────────────────
c_reset=$'\033[0m'; c_blue=$'\033[34m'; c_green=$'\033[32m'; c_yellow=$'\033[33m'; c_red=$'\033[31m'
log()  { printf '%s==>%s %s\n' "$c_blue" "$c_reset" "$*"; }
ok()   { printf '%s ✓ %s%s\n' "$c_green" "$*" "$c_reset"; }
warn() { printf '%s ! %s%s\n' "$c_yellow" "$*" "$c_reset"; }
die()  { printf '%s ✗ %s%s\n' "$c_red" "$*" "$c_reset" >&2; exit 1; }

GEN_SECRETS=false; SELF_SIGNED=false
for arg in "$@"; do
  case "$arg" in
    --gen-secrets) GEN_SECRETS=true ;;
    --self-signed) SELF_SIGNED=true ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown option: $arg" ;;
  esac
done

# ── 0. prerequisites ─────────────────────────────────────────────────────────
log "Checking prerequisites"
command -v docker >/dev/null  || die "docker is not installed"
command -v openssl >/dev/null || die "openssl is not installed"
if docker compose version >/dev/null 2>&1; then COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then COMPOSE=(docker-compose)
else die "docker compose (v2) or docker-compose (v1) is required"; fi
COMPOSE+=(-f docker-compose.yml)
ok "docker + compose present"

# ── 1. .env ──────────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env 2>/dev/null || true
  die ".env created from .env.example — fill in DOMAIN, API_SECRET_TOKEN and the secrets, then re-run."
fi
# .env holds secrets — keep it owner-only readable.
chmod 600 .env 2>/dev/null || true

# helper: set/replace KEY=value in .env (| delimiter is safe for base64 values)
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
missing=()
for k in "${required[@]}"; do
  v="${!k:-}"
  if [ -z "$v" ] || [ "$v" = "__CHANGE_ME__" ] || [[ "$v" == *your-domain.com* ]]; then missing+=("$k"); fi
done
[ ${#missing[@]} -eq 0 ] || die "These .env values still need to be set: ${missing[*]}  (tip: run with --gen-secrets to auto-fill secrets)"

# Guardrails that silently break prod if wrong:
[ -z "${CORS_ALLOWED_ORIGINS:-}" ] || warn "CORS_ALLOWED_ORIGINS is set ('$CORS_ALLOWED_ORIGINS'); single-host serving is same-origin, so leave it UNSET."
[ "${MINIO_ENDPOINT:-}" = "minio" ] || warn "MINIO_ENDPOINT is '${MINIO_ENDPOINT:-<unset>}' (expected 'minio'); image uploads will be disabled and the designer will fall back to inline data URIs."
case "${BODY_LIMIT:-}" in ""|512kb) warn "BODY_LIMIT is '${BODY_LIMIT:-<unset>}'; set it to 12mb or publishing image templates will 413." ;; esac
ok "required values present (domain: $DOMAIN)"

# ── 4. render nginx config from template ─────────────────────────────────────
log "Rendering nginx config for $DOMAIN"
sed "s|__DOMAIN__|${DOMAIN}|g" nginx/nginx.conf.template > nginx/nginx.generated.conf
ok "wrote nginx/nginx.generated.conf"

# ── 5. TLS certificates ──────────────────────────────────────────────────────
mkdir -p certs
if [ -f certs/fullchain.pem ] && [ -f certs/privkey.pem ]; then
  ok "TLS certs present in ./certs"
elif $SELF_SIGNED; then
  log "Generating self-signed TLS cert (testing only)"
  ( umask 077; openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
    -keyout certs/privkey.pem -out certs/fullchain.pem \
    -subj "/CN=${DOMAIN}" \
    -addext "subjectAltName=DNS:${DOMAIN}" >/dev/null 2>&1 )
  chmod 600 certs/privkey.pem 2>/dev/null || true
  warn "Self-signed cert created — browsers will warn. Replace certs/{fullchain,privkey}.pem with real certs (e.g. certbot) for production."
else
  die "No TLS certs in ./certs (need fullchain.pem + privkey.pem). Use real certs (certbot/Let's Encrypt for ${DOMAIN}) or re-run with --self-signed for testing."
fi

# ── 6. build + launch ────────────────────────────────────────────────────────
log "Building images (this can take a few minutes on first run)"
"${COMPOSE[@]}" build
log "Starting the stack"
"${COMPOSE[@]}" up -d
"${COMPOSE[@]}" logs minio-init 2>/dev/null | tail -n 3 || true

# ── 7. wait for the render API to be ready ───────────────────────────────────
log "Waiting for the render API (Chromium warm-up)…"
ready=false
for _ in $(seq 1 45); do
  if "${COMPOSE[@]}" exec -T rendering-api node -e \
      "fetch('http://127.0.0.1:3000/readyz').then(r=>r.json()).then(j=>process.exit(j.status==='ready'?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    ready=true; break
  fi
  sleep 2
done
$ready && ok "render API is ready" || warn "render API not ready yet — check: ${COMPOSE[*]} logs rendering-api"

# ── 8. summary ───────────────────────────────────────────────────────────────
# Only reveal the API key on an interactive terminal so it can't leak into captured
# or redirected logs (CI, ./deploy.sh > deploy.log, etc.).
if [ -t 1 ]; then api_key_display="$API_SECRET_TOKEN"
else api_key_display="(hidden — run: grep ^API_SECRET_TOKEN= .env)"; fi
cat <<EOF

$c_green──────────────────────────────────────────────────────────────$c_reset
$c_green OpenBanner is deployed$c_reset

  App + API     https://$DOMAIN        (open this; use the same URL as the API URL in the gear modal)
  Health        https://$DOMAIN/readyz

  API key (X-API-Key):  $api_key_display

  Call from any n8n instance (server-to-server, no CORS):
    POST https://$DOMAIN/v1/templates/<id>/render
    header  X-API-Key: <the key above>
    body    {"format":"png","mergeVars":{"headline":"..."}}

  DNS: point $DOMAIN at this server (one A/AAAA record).
  Update: git pull && ./deploy.sh      Logs: ${COMPOSE[*]} logs -f rendering-api
$c_green──────────────────────────────────────────────────────────────$c_reset
EOF

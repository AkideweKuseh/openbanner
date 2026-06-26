#!/usr/bin/env bash
#
# OpenBanner redeploy — fast, idempotent update for an ALREADY-DEPLOYED host.
#
# Use this instead of ./deploy.sh for everyday updates. It skips the one-time setup
# (secret generation, host-nginx site, certbot/TLS) and just:
#   git pull → rebuild the API image → recreate changed containers → reload the internal
#   nginx (re-resolves the recreated rendering-api upstream, which prevents the 502) → wait.
#
#   ./redeploy.sh            # pull + build + up + reload + wait
#   ./redeploy.sh --no-pull  # deploy the current checkout as-is
#
# First-time install / TLS still uses ./deploy.sh — that's the only place certbot runs.
#
set -euo pipefail
cd "$(dirname "$0")"

# ── pretty logging ───────────────────────────────────────────────────────────
c_reset=$'\033[0m'; c_blue=$'\033[0;34m'; c_green=$'\033[0;32m'; c_yellow=$'\033[0;33m'; c_red=$'\033[0;31m'
log()  { printf '%s==>%s %s\n' "$c_blue" "$c_reset" "$*"; }
ok()   { printf '%s ✓ %s%s\n' "$c_green" "$*" "$c_reset"; }
warn() { printf '%s ! %s%s\n' "$c_yellow" "$*" "$c_reset"; }
die()  { printf '%s ✗ %s%s\n' "$c_red" "$*" "$c_reset" >&2; exit 1; }

NO_PULL=false
for arg in "$@"; do
  case "$arg" in
    --no-pull) NO_PULL=true ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown option: $arg (try --help)" ;;
  esac
done

# ── 0. prerequisites (docker only — no nginx/certbot/openssl needed here) ─────
log "Checking prerequisites"
command -v docker >/dev/null || die "docker is not installed"
if docker compose version >/dev/null 2>&1; then COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then COMPOSE=(docker-compose)
else die "docker compose (v2) or docker-compose (v1) is required"; fi
COMPOSE+=(-f docker-compose.yml)
[ -f .env ] || die ".env not found — this host isn't set up yet. Run ./deploy.sh first (one-time install)."
ok "prerequisites present"

# ── 1. pull latest code ──────────────────────────────────────────────────────
if $NO_PULL; then
  log "Skipping git pull (--no-pull)"
else
  log "Pulling latest code"
  # Snapshot this script: if the pull updates redeploy.sh itself, re-exec the new version
  # so the change takes effect this run (not the next). --no-pull breaks the cycle.
  before="$(sha256sum redeploy.sh 2>/dev/null || echo none)"
  git pull --ff-only || die "git pull failed — merge the PR on GitHub / resolve local changes, then re-run (or pass --no-pull)"
  after="$(sha256sum redeploy.sh 2>/dev/null || echo none)"
  if [ "$before" != "$after" ]; then
    warn "redeploy.sh was updated by the pull — re-launching the new version"
    exec ./redeploy.sh --no-pull
  fi
fi

# ── 2. re-render the internal (Docker) nginx config (keeps it in sync) ────────
# shellcheck disable=SC1091
set -a; source ./.env; set +a
if [ -f nginx/nginx.conf.template ]; then
  sed "s|__DOMAIN__|${DOMAIN:-}|g" nginx/nginx.conf.template > nginx/nginx.generated.conf
  ok "refreshed nginx/nginx.generated.conf"
fi

# ── 3. rebuild + relaunch ────────────────────────────────────────────────────
log "Building images (API code changes are picked up here)"
"${COMPOSE[@]}" build
log "Recreating changed containers"
"${COMPOSE[@]}" up -d

# ── 4. reload the internal nginx so it re-resolves the recreated rendering-api ─
# The nginx container is volume-mounted (stock nginx image) and is NEVER recreated by an
# update, so without this reload it keeps the OLD rendering-api address cached and returns
# 502 after every API rebuild. This is the step ./deploy.sh was missing for updates.
log "Reloading internal nginx (re-resolve rendering-api upstream)"
if "${COMPOSE[@]}" exec -T nginx nginx -s reload 2>/dev/null; then
  ok "nginx reloaded"
else
  warn "nginx reload failed — restarting the nginx container as a fallback"
  "${COMPOSE[@]}" restart nginx
fi

# ── 5. wait for the render API to be ready (Chromium warm-up) ─────────────────
log "Waiting for the render API…"
ready=false
for _ in $(seq 1 45); do
  if "${COMPOSE[@]}" exec -T rendering-api node -e \
      "fetch('http://127.0.0.1:3000/readyz').then(r=>r.json()).then(j=>process.exit(j.status==='ready'?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    ready=true; break
  fi
  sleep 2
done
$ready && ok "render API is ready" || warn "render API not ready yet — check: ${COMPOSE[*]} logs rendering-api"

# ── 6. smoke test ────────────────────────────────────────────────────────────
code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8080/healthz 2>/dev/null || echo ERR)"
if [ "$code" = "200" ]; then ok "healthz -> 200 (http://127.0.0.1:8080)"
else warn "healthz returned $code through the Docker nginx — check: ${COMPOSE[*]} logs nginx"; fi

cat <<EOF

$c_green──────────────────────────────────────────────────────────────$c_reset
$c_green OpenBanner redeployed$c_reset
  Logs:          ${COMPOSE[*]} logs -f rendering-api
  Update again:  ./redeploy.sh
  First-time setup / TLS: ./deploy.sh   (certbot runs only there)
$c_green──────────────────────────────────────────────────────────────$c_reset
EOF

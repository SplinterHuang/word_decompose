#!/usr/bin/env bash
# Start web (:3000) + api (:4000) from production build (vite preview + node dist).
# Not vite dev / tsx watch — intended for public soft preview and deploy scripts.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
resolve_env "${1:-}"
load_dotenv
ensure_pnpm
ensure_prod_build

echo "starting word_decompose (${APP_ENV}) [production serve]"
echo "  api: http://${API_HOST}:${API_PORT}"
echo "  web: http://${WEB_HOST}:${WEB_PORT}"

api_pid="$(read_pid "$API_PID_FILE" || true)"
web_pid="$(read_pid "$WEB_PID_FILE" || true)"

if pid_alive "${api_pid:-}" || pid_alive "${web_pid:-}"; then
  echo "error: already running for env=${APP_ENV} (api_pid=${api_pid:-none} web_pid=${web_pid:-none})" >&2
  echo "       run: ./scripts/status.sh ${APP_ENV}  or  ./scripts/stop.sh ${APP_ENV}" >&2
  exit 1
fi

if port_in_use "$API_HOST" "$API_PORT"; then
  echo "error: API port ${API_HOST}:${API_PORT} already in use" >&2
  exit 1
fi
if port_in_use "$WEB_HOST" "$WEB_PORT"; then
  echo "error: WEB port ${WEB_HOST}:${WEB_PORT} already in use" >&2
  exit 1
fi

rm -f "$API_PID_FILE" "$WEB_PID_FILE"
: >"$API_LOG_FILE"
: >"$WEB_LOG_FILE"

export HOST="$API_HOST"
export PORT="$API_PORT"
export API_HOST API_PORT WEB_HOST WEB_PORT APP_ENV
export NODE_ENV="${NODE_ENV:-production}"

# setsid: new session so stop can tear down the process tree reliably
(
  cd "$ROOT_DIR"
  setsid pnpm --filter @word-decompose/api start \
    >>"$API_LOG_FILE" 2>&1 &
  echo $! >"$API_PID_FILE"
)

(
  cd "$ROOT_DIR"
  setsid pnpm --filter @word-decompose/web exec vite preview \
    --host "$WEB_HOST" \
    --port "$WEB_PORT" \
    --strictPort \
    >>"$WEB_LOG_FILE" 2>&1 &
  echo $! >"$WEB_PID_FILE"
)

api_pid="$(read_pid "$API_PID_FILE")"
web_pid="$(read_pid "$WEB_PID_FILE")"
echo "api pid=${api_pid}  log=${API_LOG_FILE}"
echo "web pid=${web_pid}  log=${WEB_LOG_FILE}"

if ! wait_for_http "http://${API_HOST}:${API_PORT}/api/health" "api"; then
  echo "----- api log (tail) -----" >&2
  tail -n 40 "$API_LOG_FILE" >&2 || true
  exit 1
fi

if ! wait_for_http "http://${WEB_HOST}:${WEB_PORT}/" "web"; then
  echo "----- web log (tail) -----" >&2
  tail -n 40 "$WEB_LOG_FILE" >&2 || true
  exit 1
fi

if curl -fsS --max-time 2 "http://${WEB_HOST}:${WEB_PORT}/api/health" >/dev/null 2>&1; then
  echo "ok: web proxy /api/health"
else
  echo "warn: web is up but /api/health proxy check failed" >&2
fi

echo "started (${APP_ENV})"

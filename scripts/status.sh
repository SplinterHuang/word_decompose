#!/usr/bin/env bash
# Report process + port + health status for APP_ENV=dev|test
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
resolve_env "${1:-}"
load_dotenv

report_proc() {
  local name="$1"
  local pid_file="$2"
  local pid
  pid="$(read_pid "$pid_file" || true)"
  if [[ -z "${pid:-}" ]]; then
    echo "${name}: not tracked (no pid file)"
    return 1
  fi
  if pid_alive "$pid"; then
    echo "${name}: running pid=${pid}"
    return 0
  fi
  echo "${name}: stale pid file (pid=${pid})"
  return 1
}

echo "status word_decompose (${APP_ENV})"
echo "  api target: http://${API_HOST}:${API_PORT}/api/health"
echo "  web target: http://${WEB_HOST}:${WEB_PORT}/"

report_proc "api" "$API_PID_FILE" || true
report_proc "web" "$WEB_PID_FILE" || true

if port_in_use "$API_HOST" "$API_PORT"; then
  echo "api port: LISTEN ${API_HOST}:${API_PORT}"
else
  echo "api port: free ${API_HOST}:${API_PORT}"
fi
if port_in_use "$WEB_HOST" "$WEB_PORT"; then
  echo "web port: LISTEN ${WEB_HOST}:${WEB_PORT}"
else
  echo "web port: free ${WEB_HOST}:${WEB_PORT}"
fi

api_health="down"
if api_body="$(curl -fsS --max-time 2 "http://${API_HOST}:${API_PORT}/api/health" 2>/dev/null)"; then
  api_health="up ${api_body}"
fi
echo "api health: ${api_health}"

web_health="down"
if curl -fsS --max-time 2 "http://${WEB_HOST}:${WEB_PORT}/" >/dev/null 2>&1; then
  web_health="up"
fi
echo "web health: ${web_health}"

proxy_health="down"
if proxy_body="$(curl -fsS --max-time 2 "http://${WEB_HOST}:${WEB_PORT}/api/health" 2>/dev/null)"; then
  proxy_health="up ${proxy_body}"
fi
echo "web→api proxy: ${proxy_health}"

if [[ "$api_health" == up* && "$web_health" == up ]]; then
  echo "overall: healthy"
  exit 0
fi

echo "overall: unhealthy"
exit 1

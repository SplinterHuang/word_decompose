#!/usr/bin/env bash
# Shared helpers for word_decompose deploy scripts.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

resolve_env() {
  local arg="${1:-}"
  if [[ "$arg" == "dev" || "$arg" == "test" ]]; then
    APP_ENV="$arg"
  else
    APP_ENV="${APP_ENV:-test}"
  fi
  case "$APP_ENV" in
    dev|test) ;;
    *)
      echo "error: APP_ENV must be 'dev' or 'test' (got: $APP_ENV)" >&2
      exit 1
      ;;
  esac

  RUN_DIR="${ROOT_DIR}/logs/${APP_ENV}"
  PID_DIR="${RUN_DIR}/pids"
  LOG_DIR="${RUN_DIR}"
  mkdir -p "$PID_DIR"

  API_PID_FILE="${PID_DIR}/api.pid"
  WEB_PID_FILE="${PID_DIR}/web.pid"
  API_LOG_FILE="${LOG_DIR}/api.log"
  WEB_LOG_FILE="${LOG_DIR}/web.log"
}

# Defaults for local bind (tunnel forwards to web :3000 later)
WEB_HOST="${WEB_HOST:-127.0.0.1}"
WEB_PORT="${WEB_PORT:-3000}"
API_HOST="${API_HOST:-127.0.0.1}"
API_PORT="${API_PORT:-4000}"
NODE_ENV="${NODE_ENV:-development}"

load_dotenv() {
  local env_file="${ROOT_DIR}/.env"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi
  WEB_HOST="${WEB_HOST:-127.0.0.1}"
  WEB_PORT="${WEB_PORT:-3000}"
  API_HOST="${API_HOST:-127.0.0.1}"
  API_PORT="${API_PORT:-4000}"
  NODE_ENV="${NODE_ENV:-development}"
}

pid_alive() {
  local pid="${1:-}"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

read_pid() {
  local file="$1"
  if [[ -f "$file" ]]; then
    tr -d '[:space:]' <"$file"
  fi
}

port_in_use() {
  local _host="$1"
  local port="$2"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
  else
    (echo >/dev/tcp/"$_host"/"$port") >/dev/null 2>&1
  fi
}

wait_for_http() {
  local url="$1"
  local name="$2"
  local attempts="${3:-40}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
      echo "ok: ${name} ready (${url})"
      return 0
    fi
    sleep 0.25
  done
  echo "error: ${name} did not become ready at ${url}" >&2
  return 1
}

ensure_pnpm() {
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "error: pnpm not found on PATH" >&2
    exit 1
  fi
  if [[ ! -d "${ROOT_DIR}/node_modules" ]]; then
    echo "error: node_modules missing — run 'pnpm install' from repo root first" >&2
    exit 1
  fi
}

# Build web dist + compiled API when outputs are missing or BUILD=1 (no dev/watch).
ensure_prod_build() {
  local api_dist="${ROOT_DIR}/apps/api/dist/index.js"
  local web_dist="${ROOT_DIR}/apps/web/dist/index.html"
  local force="${BUILD:-0}"

  if [[ "$force" == "1" ]] || [[ ! -f "$api_dist" ]] || [[ ! -f "$web_dist" ]]; then
    echo "building production artifacts (web dist + api dist)..."
    (cd "$ROOT_DIR" && pnpm build)
  else
    echo "using existing production build (set BUILD=1 to rebuild)"
  fi

  if [[ ! -f "$api_dist" ]] || [[ ! -f "$web_dist" ]]; then
    echo "error: build did not produce expected dist outputs" >&2
    exit 1
  fi
}

# Kill a tracked process and its descendants.
kill_tree() {
  local pid="$1"
  local sig="${2:-TERM}"
  if ! pid_alive "$pid"; then
    return 0
  fi
  local children
  children="$(pgrep -P "$pid" 2>/dev/null || true)"
  local c
  for c in $children; do
    kill_tree "$c" "$sig"
  done
  kill "-${sig}" "$pid" 2>/dev/null || true
}

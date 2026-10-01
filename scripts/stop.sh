#!/usr/bin/env bash
# Stop background web+api for APP_ENV=dev|test
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
resolve_env "${1:-}"
load_dotenv

stop_one() {
  local name="$1"
  local pid_file="$2"
  local pid
  pid="$(read_pid "$pid_file" || true)"
  if [[ -z "${pid:-}" ]]; then
    echo "${name}: no pid file"
    rm -f "$pid_file"
    return 0
  fi
  if ! pid_alive "$pid"; then
    echo "${name}: pid ${pid} not running (stale)"
    rm -f "$pid_file"
    return 0
  fi

  echo "${name}: stopping pid ${pid}"
  kill_tree "$pid" TERM

  local i
  for ((i = 1; i <= 40; i++)); do
    if ! pid_alive "$pid"; then
      rm -f "$pid_file"
      echo "${name}: stopped"
      return 0
    fi
    sleep 0.25
  done

  echo "${name}: force kill pid ${pid}"
  kill_tree "$pid" KILL
  rm -f "$pid_file"
  echo "${name}: killed"
}

echo "stopping word_decompose (${APP_ENV})"
stop_one "web" "$WEB_PID_FILE"
stop_one "api" "$API_PID_FILE"
echo "stopped (${APP_ENV})"

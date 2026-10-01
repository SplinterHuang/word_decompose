#!/usr/bin/env bash
# Restart web+api for APP_ENV=dev|test
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_ARG="${1:-test}"

"${SCRIPT_DIR}/stop.sh" "$ENV_ARG" || true
sleep 0.5
"${SCRIPT_DIR}/start.sh" "$ENV_ARG"

#!/usr/bin/env bash
# Read-only smoke check: course-roots list matches migrated Neo4j (9 units, forms by unit_order).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/common.sh
source "$ROOT/scripts/common.sh"

API_BASE="${API_BASE:-http://${API_HOST:-127.0.0.1}:${API_PORT:-4000}}"

expected_forms=(
  "chron-/chrono-"
  "arch-/archi-/-archy"
  "struct-"
  "graph-/gram-"
  "log-"
  "path-/pat-"
  "pel/puls"
  "pon/pound"
  "vis/vid"
)

json="$(curl -sf "${API_BASE}/api/graph/course-roots")"
count="$(node -e "const d=JSON.parse(process.argv[1]); console.log((d.courseRoots||[]).length)" "$json")"

if [[ "$count" != "9" ]]; then
  echo "FAIL: expected 9 course roots, got ${count}" >&2
  exit 1
fi

for i in "${!expected_forms[@]}"; do
  order=$((i + 1))
  form="$(node -e "
    const d=JSON.parse(process.argv[1]);
    const r=(d.courseRoots||[]).find(x=>x.unit_order===${order});
    console.log(r? (r.form||r.title||''): '');
  " "$json")"
  if [[ "$form" != "${expected_forms[$i]}" ]]; then
    echo "FAIL: unit_order ${order} expected form '${expected_forms[$i]}', got '${form}'" >&2
    exit 1
  fi
done

first_id="$(node -e "const d=JSON.parse(process.argv[1]); console.log(d.courseRoots[0].id)" "$json")"
graph="$(curl -sf "${API_BASE}/api/graph/course-root/${first_id}")"
nodes="$(node -e "const d=JSON.parse(process.argv[1]); console.log((d.nodes||[]).length)" "$graph")"

if [[ "$nodes" -lt 1 ]]; then
  echo "FAIL: course-root subgraph returned no nodes" >&2
  exit 1
fi

echo "OK: 9 course roots (forms 1–9), course-root subgraph has ${nodes} nodes"

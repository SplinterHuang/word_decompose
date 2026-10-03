#!/usr/bin/env bash
# Read-only smoke check: course-roots lists numbered units 1–9 plus extra unnumbered roots.
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

if [[ "$count" -lt 9 ]]; then
  echo "FAIL: expected at least 9 course roots, got ${count}" >&2
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

unnumbered="$(node -e "
  const d=JSON.parse(process.argv[1]);
  const n=(d.courseRoots||[]).filter(x=>x.unit_order==null).length;
  console.log(n);
" "$json")"

if [[ "$unnumbered" -lt 3 ]]; then
  echo "FAIL: expected at least 3 roots without unit_order, got ${unnumbered}" >&2
  exit 1
fi

first_id="$(node -e "const d=JSON.parse(process.argv[1]); console.log(d.courseRoots[0].id)" "$json")"
graph="$(curl -sf "${API_BASE}/api/graph/course-root/${first_id}")"
nodes="$(node -e "const d=JSON.parse(process.argv[1]); console.log((d.nodes||[]).length)" "$graph")"

if [[ "$nodes" -lt 1 ]]; then
  echo "FAIL: course-root subgraph returned no nodes" >&2
  exit 1
fi

unnumbered_id="$(node -e "
  const d=JSON.parse(process.argv[1]);
  const r=(d.courseRoots||[]).find(x=>x.unit_order==null);
  console.log(r? r.id: '');
" "$json")"

if [[ -n "$unnumbered_id" ]]; then
  graph2="$(curl -sf "${API_BASE}/api/graph/course-root/${unnumbered_id}")"
  nodes2="$(node -e "const d=JSON.parse(process.argv[1]); console.log((d.nodes||[]).length)" "$graph2")"
  if [[ "$nodes2" -lt 1 ]]; then
    echo "FAIL: unnumbered course-root subgraph returned no nodes" >&2
    exit 1
  fi
fi

echo "OK: ${count} course roots (${unnumbered} without unit_order), subgraph loads for numbered and unnumbered roots"

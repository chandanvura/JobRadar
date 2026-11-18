#!/usr/bin/env bash
# Reproducible checks only: no production writes, deployment or scan dispatch.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
python_bin="${JOBRADAR_HARNESS_PYTHON:-python}"
suite="${1:-all}"
case "$suite" in python|web|all) ;; *) echo 'Usage: bash scripts/verify-harness.sh [python|web|all]' >&2; exit 64 ;; esac
command -v timeout >/dev/null || { echo 'GNU timeout is required' >&2; exit 69; }
check() {
  local name="$1"; shift
  echo "HARNESS START: $name"
  if timeout --signal=TERM --kill-after=10s 600 "$@"; then
    echo "HARNESS PASS: $name"
  else
    local result=$?
    echo "HARNESS FAIL: $name (exit $result)" >&2
    return "$result"
  fi
}
if [[ "$suite" == python || "$suite" == all ]]; then
  export PYTHONPATH="$root"
  check 'Python regression and fault injection' "$python_bin" -m pytest -q
  check 'Python security review' "$python_bin" -m bandit -q -r scraper scripts
  check 'Python dependency audit' "$python_bin" -m pip_audit -r requirements.txt
fi
if [[ "$suite" == web || "$suite" == all ]]; then
  cd "$root/web"
  check 'Production dependency audit' npm audit --omit=dev --audit-level=high
  check 'Build and web regression tests' npm test
  check 'Compiled Worker and real local D1 integration' npm run test:api
  check 'Lint' npm run lint
  check 'UI types' npm run typecheck:ui
fi
echo "HARNESS COMPLETE: $suite"

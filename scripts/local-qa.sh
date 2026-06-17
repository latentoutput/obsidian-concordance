#!/usr/bin/env bash
set -u

failures=0
warnings=0

run_required() {
  local label="$1"
  shift

  printf '\n==> %s\n' "$label"
  if "$@"; then
    printf 'OK: %s\n' "$label"
  else
    printf 'FAIL: %s\n' "$label"
    failures=$((failures + 1))
  fi
}

run_optional() {
  local label="$1"
  shift

  printf '\n==> %s\n' "$label"
  if "$@"; then
    printf 'OK: %s\n' "$label"
  else
    printf 'WARN: %s\n' "$label"
    warnings=$((warnings + 1))
  fi
}

run_required "TypeScript typecheck" npm run typecheck
run_required "ESLint" npm run lint
run_required "Tests" npm run test
run_required "Prettier check" npm run format:check
run_required "Production build" npm run build
run_required "Dependency audit" npm run deps:audit

if command -v gitleaks >/dev/null 2>&1; then
  run_required "Secret scan" gitleaks detect --no-git --redact
else
  printf '\nWARN: gitleaks is not installed; skipping secret scan.\n'
  warnings=$((warnings + 1))
fi

printf '\nQA summary: %d failure(s), %d warning(s)\n' "$failures" "$warnings"

if [ "$failures" -gt 0 ]; then
  exit 1
fi

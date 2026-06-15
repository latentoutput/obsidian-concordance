#!/usr/bin/env bash
set -u

history_scan=false
strict_sast=false

for arg in "$@"; do
  case "$arg" in
    --history)
      history_scan=true
      ;;
    --strict-sast)
      strict_sast=true
      ;;
    *)
      printf 'Unknown option: %s\n' "$arg" >&2
      exit 2
      ;;
  esac
done

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

run_required "Dependency audit" npm run deps:audit
run_required "TypeScript typecheck" npm run typecheck
run_required "ESLint" npm run lint

if command -v gitleaks >/dev/null 2>&1; then
  run_required "Working-tree secret scan" gitleaks detect --no-git --redact
  if [ "$history_scan" = true ]; then
    run_required "Git history secret scan" gitleaks git --redact
  fi
else
  printf '\nWARN: gitleaks is not installed; skipping secret scan.\n'
  warnings=$((warnings + 1))
fi

if command -v opengrep >/dev/null 2>&1; then
  if [ "$strict_sast" = true ]; then
    run_required "OpenGrep SAST" opengrep scan --config auto --exclude node_modules --exclude main.js src
  else
    run_optional "OpenGrep SAST" opengrep scan --config auto --exclude node_modules --exclude main.js src
  fi
elif command -v semgrep >/dev/null 2>&1; then
  if [ "$strict_sast" = true ]; then
    run_required "Semgrep SAST" semgrep scan --config auto --error --exclude node_modules --exclude main.js src
  else
    run_optional "Semgrep SAST" semgrep scan --config auto --exclude node_modules --exclude main.js src
  fi
else
  printf '\nWARN: opengrep/semgrep is not installed; skipping SAST.\n'
  warnings=$((warnings + 1))
fi

printf '\nSecurity summary: %d failure(s), %d warning(s)\n' "$failures" "$warnings"

if [ "$failures" -gt 0 ]; then
  exit 1
fi

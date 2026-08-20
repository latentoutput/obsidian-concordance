#!/usr/bin/env bash
# Cut a release through the PR flow that main's ruleset requires.
#
#   scripts/release.sh patch|minor|major|X.Y.Z [--dry-run]
#
# main rejects direct pushes, so the version bump has to land as a PR. This
# drives the whole sequence: bump on a branch, open the PR, wait for CI, merge,
# tag the merged commit, and push the tag that triggers release.yml.
set -euo pipefail

BUMP="${1:-}"
DRY=""
[ "${2:-}" = "--dry-run" ] && DRY=1

case "$BUMP" in
  patch|minor|major) ;;
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) echo "usage: $0 patch|minor|major|X.Y.Z [--dry-run]" >&2; exit 64 ;;
esac

run() {
  if [ -n "$DRY" ]; then printf '  would run: %s\n' "$*"; else "$@"; fi
}

say() { printf '\n==> %s\n' "$*"; }

say "Preflight"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
[ "$BRANCH" = "main" ] || { echo "must be on main, on $BRANCH" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "working tree is dirty" >&2; exit 1; }
git fetch --quiet origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || {
  echo "local main differs from origin/main, pull first" >&2; exit 1; }
command -v gh >/dev/null || { echo "gh CLI is required" >&2; exit 1; }
echo "  on main, clean, in sync with origin"

say "Quality gate"
run npm run qa

say "Obsidian stable heads-up"
make --no-print-directory release-check || true

CURRENT=$(node -p "require('./package.json').version")
if [ -n "$DRY" ]; then
  NEXT="(computed by npm version $BUMP)"
else
  npm version "$BUMP" --no-git-tag-version >/dev/null
  NEXT=$(node -p "require('./package.json').version")
fi
say "Releasing $CURRENT -> $NEXT"

if [ -z "$DRY" ]; then
  MANIFEST=$(node -p "require('./manifest.json').version")
  [ "$MANIFEST" = "$NEXT" ] || {
    echo "manifest.json ($MANIFEST) does not match package.json ($NEXT)" >&2; exit 1; }
fi

printf '\nHave you installed this build in a real vault and exercised the commands? [y/N]: '
read -r REPLY
case "$REPLY" in
  y|Y|yes|Yes|YES) ;;
  *) echo "Canceled. Revert the bump with: git checkout -- package.json manifest.json versions.json" >&2; exit 1 ;;
esac

RB="release/$NEXT"
say "Opening $RB"
run git checkout -b "$RB"
run git add package.json package-lock.json manifest.json versions.json
run git commit -m "$NEXT"
run git push -u origin "$RB"
run gh pr create --fill
run gh pr merge --auto --squash

say "Waiting for CI and merge"
if [ -z "$DRY" ]; then
  gh pr checks --watch || { echo "CI failed, PR left open" >&2; exit 1; }
  for _ in $(seq 1 60); do
    [ "$(gh pr view --json state --jq .state)" = "MERGED" ] && break
    sleep 5
  done
  [ "$(gh pr view --json state --jq .state)" = "MERGED" ] || {
    echo "PR did not merge, finish it by hand then run: scripts/release.sh $NEXT" >&2; exit 1; }
else
  echo "  would watch checks and wait for merge"
fi

say "Tagging $NEXT on main"
run git checkout main
run git pull --ff-only
run git tag "$NEXT"
run git push origin "$NEXT"

say "Done"
echo "  release.yml is building. Watch it with: gh run watch --exit-status"

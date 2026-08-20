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
for a in "$@"; do [ "$a" = "--dry-run" ] && DRY=1; done
[ "$BUMP" = "--dry-run" ] && BUMP=""

case "$BUMP" in
  ""|patch|minor|major) ;;
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) echo "usage: $0 [patch|minor|major|X.Y.Z] [--dry-run]" >&2; exit 64 ;;
esac

# Look at what actually changed since the last tag and propose a bump. Semver
# encodes intent, which only a human has, so this proposes and explains rather
# than deciding silently.
propose_bump() {
  local last subjects bodies shipped
  last=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
  if [ -z "$last" ]; then
    echo "patch|no previous tag to compare against"
    return
  fi

  # Only trust explicit declarations. Guessing intent from English prose
  # misfires (a body line starting with "Adds" is not a feature), so anything
  # undeclared falls back to patch and you override if it is wrong.
  subjects=$(git log --format=%s "$last"..HEAD 2>/dev/null || echo "")
  bodies=$(git log --format=%b "$last"..HEAD 2>/dev/null || echo "")
  shipped=$(git diff --name-only "$last"..HEAD -- src/ styles.css 2>/dev/null)

  if printf '%s' "$bodies" | grep -q 'BREAKING CHANGE' \
     || printf '%s' "$subjects" | grep -qE '^[a-z]+(\(.+\))?!:'; then
    echo "major|a commit declares a breaking change"
  elif printf '%s' "$subjects" | grep -qE '^feat(\(.+\))?:'; then
    echo "minor|a commit is prefixed feat:"
  elif [ -z "$shipped" ]; then
    echo "patch|nothing under src/ or styles.css changed, so users see no behaviour change"
  else
    echo "patch|src/ changed but no commit declared a feature or breaking change"
  fi
}

if [ -z "$BUMP" ]; then
  LAST=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
  printf '\n==> Changes since %s\n\n' "${LAST:-the beginning}"
  if [ -n "$LAST" ]; then
    git log --format='  %s' "$LAST"..HEAD | head -20
    SHIPPED=$(git diff --name-only "$LAST"..HEAD -- src/ styles.css 2>/dev/null)
    if [ -n "$SHIPPED" ]; then
      printf '\n  files that reach users:\n'
      printf '%s\n' "$SHIPPED" | sed 's/^/    /'
    else
      printf '\n  files that reach users: none, this release ships no behaviour change\n'
    fi
  fi
  SUGGESTION=$(propose_bump)
  BUMP="${SUGGESTION%%|*}"
  WHY="${SUGGESTION#*|}"
  printf '\n  Suggested: %s (%s)\n' "$BUMP" "$WHY"
  OTHERS=$(printf 'patch minor major' | tr ' ' '\n' | grep -v "^$BUMP$" | tr '\n' '/' | sed 's:/$::')
  printf '\n  Intent cannot be read from commit prose, so override if this is wrong.\n'
  printf '\nBump [%s] or %s or X.Y.Z, Enter to accept: ' "$BUMP" "$OTHERS"
  read -r CHOICE
  case "$CHOICE" in
    "") ;;
    patch|minor|major) BUMP="$CHOICE" ;;
    [0-9]*.[0-9]*.[0-9]*) BUMP="$CHOICE" ;;
    *) echo "unrecognised bump: $CHOICE" >&2; exit 64 ;;
  esac
fi

run() {
  if [ -n "$DRY" ]; then printf '  would run: %s\n' "$*"; else "$@"; fi
}

say() { printf '\n==> %s\n' "$*"; }

if [ -n "$DRY" ]; then
  printf '\n*** DRY RUN. Nothing will be changed, pushed, or tagged. ***\n'
fi

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
  # Compute the same version npm would, so the preview is readable.
  NEXT=$(node -e '
    const [cur, bump] = process.argv.slice(1);
    if (/^[0-9]/.test(bump)) { console.log(bump); process.exit(0); }
    const [x, y, z] = cur.split(".").map(Number);
    console.log(bump === "patch" ? `${x}.${y}.${z + 1}`
              : bump === "minor" ? `${x}.${y + 1}.0`
              : `${x + 1}.0.0`);
  ' "$CURRENT" "$BUMP")
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

printf '\nHave you installed this build in a real vault and exercised the commands?%s [y/N]: ' "${DRY:+ (dry run, nothing rides on this)}"
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

if [ -n "$DRY" ]; then
  say "Dry run complete"
  echo "  Nothing was changed, pushed, or tagged."
  echo "  Re-run without DRY=1 to release $NEXT for real."
else
  say "Done"
  echo "  release.yml is building. Watch it with: gh run watch --exit-status"
fi

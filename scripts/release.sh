#!/usr/bin/env bash
# Cut a release through the PR flow that main's ruleset requires.
#
#   scripts/release.sh [patch|minor|major|X.Y.Z] [--dry-run]
#
# main rejects direct pushes, so the version bump has to land as a PR. This
# drives the whole sequence: bump on a branch, open the PR, wait for CI, merge,
# tag the merged commit, push the tag, and watch release.yml build it.
#
# With no bump argument it looks at what changed since the last tag and
# suggests one. If a previous attempt stranded, it offers to finish that
# instead of starting over.
set -euo pipefail

BUMP=""
DRY=""
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    patch|minor|major|[0-9]*.[0-9]*.[0-9]*) BUMP="$a" ;;
    *) echo "usage: $0 [patch|minor|major|X.Y.Z] [--dry-run]" >&2; exit 64 ;;
  esac
done

say() { printf '\n==> %s\n' "$*"; }
run() { if [ -n "$DRY" ]; then printf '  would run: %s\n' "$*"; else "$@"; fi; }

# Delegates to scripts/suggest-bump.sh so `make pr` can show the same answer
# before you merge, instead of the two drifting apart.
propose_bump() {
  "$(dirname "$0")/suggest-bump.sh"
}

[ -n "$DRY" ] && printf '\n*** DRY RUN. Nothing will be changed, pushed, or tagged. ***\n'

say "Preflight"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
[ "$BRANCH" = "main" ] || { echo "must be on main, on $BRANCH" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "working tree is dirty" >&2; exit 1; }
git fetch --quiet origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || {
  echo "local main differs from origin/main, pull first" >&2; exit 1; }
command -v gh >/dev/null || { echo "gh CLI is required" >&2; exit 1; }
echo "  on main, clean, in sync with origin"

# An earlier attempt can leave main bumped but never tagged. That is how a
# release strands, so offer to finish it rather than making you drive git.
ONDISK=$(node -p "require('./package.json').version")
LASTTAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
RESUME=""
NEXT=""
if [ -z "$BUMP" ] && [ "$ONDISK" != "$LASTTAG" ] && ! git rev-parse "$ONDISK" >/dev/null 2>&1; then
  say "Unfinished release detected"
  printf '  main is already bumped to %s but no %s tag exists.\n' "$ONDISK" "$ONDISK"
  printf '  That happens when a run stopped after the version PR merged.\n'
  printf '\nFinish releasing %s? [Y/n]: ' "$ONDISK"
  read -r FINISH
  case "$FINISH" in
    n|N|no|No|NO) echo "Leaving it alone. Nothing changed." >&2; exit 1 ;;
    *) RESUME=1; NEXT="$ONDISK" ;;
  esac
fi

if [ -z "$RESUME" ]; then
  if [ -z "$BUMP" ]; then
    LAST=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
    say "Changes since ${LAST:-the beginning}"
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
    printf '\n  Suggested: %s (%s)\n' "$BUMP" "${SUGGESTION#*|}"
    printf '\n  Intent cannot be read from commit prose, so override if this is wrong.\n'
    OTHERS=$(printf 'patch minor major' | tr ' ' '\n' | grep -v "^$BUMP$" | tr '\n' '/' | sed 's:/$::')
    printf '\nBump [%s] or %s or X.Y.Z, Enter to accept: ' "$BUMP" "$OTHERS"
    read -r CHOICE
    case "$CHOICE" in
      "") ;;
      patch|minor|major|[0-9]*.[0-9]*.[0-9]*) BUMP="$CHOICE" ;;
      *) echo "unrecognised bump: $CHOICE" >&2; exit 64 ;;
    esac
  fi

  say "Quality gate"
  run npm run qa

  say "Obsidian stable heads-up"
  make --no-print-directory release-check || true

  CURRENT=$(node -p "require('./package.json').version")
  if [ -n "$DRY" ]; then
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
    MANIFEST=$(node -p "require('./manifest.json').version")
    [ "$MANIFEST" = "$NEXT" ] || {
      echo "manifest.json ($MANIFEST) does not match package.json ($NEXT)" >&2; exit 1; }
  fi
  say "Releasing $CURRENT -> $NEXT"

  # Notes are optional for routine releases, and autogen handles those well.
  # This asks only when something in the release changes who gets it or how it
  # behaves, which autogen cannot possibly explain.
  NOTES_STATUS=$("$(dirname "$0")/changelog.sh" status "$NEXT")
  if [ "${NOTES_STATUS%%|*}" = "needed" ]; then
    NOTES_PRESENT="${NOTES_STATUS##*|}"
    NOTES_WHY=$(printf '%s' "$NOTES_STATUS" | cut -d'|' -f2)
    if [ "$NOTES_PRESENT" = "absent" ]; then
      printf '\n  This release wants curated notes: %s.\n' "$NOTES_WHY"
      printf '  CHANGELOG.md has no [%s] section, so the release will use\n' "$NEXT"
      printf '  auto-generated notes, which cannot explain that.\n\n'
      printf '  Start one with: scripts/changelog.sh scaffold %s\n\n' "$NEXT"
      printf 'Release anyway, without curated notes?%s [y/N]: ' \
        "${DRY:+ (dry run, nothing rides on this)}"
      read -r NOTES_REPLY
      case "$NOTES_REPLY" in
        y|Y|yes|Yes|YES) ;;
        *) echo "Canceled. Revert with: git checkout -- package.json package-lock.json manifest.json versions.json" >&2; exit 1 ;;
      esac
    else
      printf '\n  Using the CHANGELOG.md [%s] section for release notes.\n' "$NEXT"
    fi
  fi

  printf '\nHave you installed this build in a real vault and exercised the commands?%s [y/N]: ' \
    "${DRY:+ (dry run, nothing rides on this)}"
  read -r REPLY
  case "$REPLY" in
    y|Y|yes|Yes|YES) ;;
    *) echo "Canceled. Revert with: git checkout -- package.json package-lock.json manifest.json versions.json" >&2; exit 1 ;;
  esac

  RB="release/$NEXT"
  say "Opening $RB"
  run git checkout -b "$RB"
  run git add package.json package-lock.json manifest.json versions.json
  run git commit -m "$NEXT"
  run git push -u origin "$RB"
  run gh pr create --fill-first
  run gh pr merge --auto --squash

  say "Waiting for CI and merge"
  if [ -z "$DRY" ]; then
    # gh reports "no checks reported" and exits nonzero in the first seconds
    # after a push, before GitHub registers the run. Wait for one to exist.
    for _ in $(seq 1 30); do
      [ "$(gh pr checks --json name --jq 'length' 2>/dev/null || echo 0)" -gt 0 ] && break
      sleep 4
    done
    gh pr checks --watch || {
      echo "CI failed. The PR is open; fix it, let it merge, then re-run: make release" >&2
      exit 1; }
    for _ in $(seq 1 60); do
      [ "$(gh pr view --json state --jq .state)" = "MERGED" ] && break
      sleep 5
    done
    [ "$(gh pr view --json state --jq .state)" = "MERGED" ] || {
      echo "PR did not merge. Merge it, then re-run: make release" >&2; exit 1; }
  else
    echo "  would watch checks and wait for merge"
  fi
else
  say "Resuming release of $NEXT"
fi

say "Tagging $NEXT on main"
run git checkout main
run git pull --ff-only

if [ -z "$DRY" ]; then
  # A tag can survive an aborted attempt. Reuse it when it points at HEAD.
  if git rev-parse "$NEXT" >/dev/null 2>&1; then
    if [ "$(git rev-parse "$NEXT"^{commit})" = "$(git rev-parse HEAD)" ]; then
      echo "  tag $NEXT already exists here, reusing it"
    else
      echo "tag $NEXT exists but points elsewhere. Delete it and retry:" >&2
      echo "  git tag -d $NEXT && git push --delete origin $NEXT" >&2
      exit 1
    fi
  else
    git tag "$NEXT"
  fi
  git push origin "$NEXT"
else
  run git tag "$NEXT"
  run git push origin "$NEXT"
fi

if [ -n "$DRY" ]; then
  say "Dry run complete"
  echo "  Nothing was changed, pushed, or tagged."
  echo "  Re-run without DRY=1 to release $NEXT for real."
  exit 0
fi

say "Building the release"
# The run does not exist for a few seconds after the tag push, so watching
# immediately reports "no in progress runs" and tells you nothing.
RUN=""
for _ in $(seq 1 30); do
  RUN=$(gh run list --workflow release.yml --limit 5 --json databaseId,headBranch \
        --jq "[.[] | select(.headBranch == \"$NEXT\")][0].databaseId" 2>/dev/null || echo "")
  [ -n "$RUN" ] && [ "$RUN" != "null" ] && break
  sleep 4
done

if [ -z "$RUN" ] || [ "$RUN" = "null" ]; then
  echo "  could not find the release run: gh run list --workflow release.yml" >&2
else
  gh run watch "$RUN" --exit-status || {
    echo "" >&2
    echo "The release build failed. The tag is pushed, so fix the cause, then:" >&2
    echo "  git push --delete origin $NEXT && git tag -d $NEXT" >&2
    echo "  make release-version VERSION=$NEXT" >&2
    exit 1; }
fi

say "Released $NEXT"
gh release view "$NEXT" --json url --jq '"  " + .url' 2>/dev/null || true

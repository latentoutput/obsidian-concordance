#!/usr/bin/env bash
#
# Suggest a semver bump for the commits between a base ref and HEAD.
#
#   scripts/suggest-bump.sh [base-ref]
#
# Prints one line: <patch|minor|major>|<reason>
# Defaults to the most recent tag, which is the range a release would cover.
#
# Semver encodes intent, which only a human has. Trust explicit declarations
# only; guessing from commit prose misfires (a body line starting with "Adds"
# is not a feature), so anything undeclared falls back to patch.
set -eu

base="${1:-$(git describe --tags --abbrev=0 2>/dev/null || echo "")}"

if [ -z "$base" ]; then
  echo "patch|no previous tag to compare against"
  exit 0
fi

subjects=$(git log --format=%s "$base"..HEAD 2>/dev/null || echo "")
bodies=$(git log --format=%b "$base"..HEAD 2>/dev/null || echo "")
# Tests live beside the source but are never bundled into main.js, so a
# test-only change ships nothing and must not read as user-facing.
shipped=$(git diff --name-only "$base"..HEAD -- src/ styles.css ':(exclude)*.test.ts' 2>/dev/null)

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

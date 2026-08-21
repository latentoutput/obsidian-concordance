#!/usr/bin/env bash
#
# Help decide whether a release needs curated notes, and get them started.
#
#   scripts/changelog.sh status [version]     needed or optional, and present or not
#   scripts/changelog.sh scaffold [version]   print a draft section to fill in
#
# Notes cannot be generated. Nobody's tooling knows that a raised minAppVersion
# is the headline, or that a trimmed trailing space means readers must go and
# check a setting by hand. What tooling can do is notice when a release is not
# routine, and lay out the raw material so the writing starts from something.
set -eu

cd "$(git rev-parse --show-toplevel)"

CHANGELOG="CHANGELOG.md"
last=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

version="${2:-}"
if [ -z "$version" ]; then
  version=$(node -p "require('./package.json').version")
fi

has_section() {
  grep -qF "## [$version]" "$CHANGELOG" 2>/dev/null
}

# The signals that make a release worth writing about by hand. Each is
# something a reader has to act on, and none of it survives autogen.
notable_reasons() {
  [ -z "$last" ] && { echo "the first release"; return; }

  if git diff "$last"..HEAD -- manifest.json 2>/dev/null | grep -q '^[-+].*minAppVersion'; then
    local from to
    from=$(git show "$last":manifest.json 2>/dev/null | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).minAppVersion' 2>/dev/null || echo "?")
    to=$(node -p "require('./manifest.json').minAppVersion")
    echo "minAppVersion moved from $from to $to, which changes who receives the update"
  fi

  if git log --format=%b "$last"..HEAD | grep -q 'BREAKING CHANGE' \
     || git log --format=%s "$last"..HEAD | grep -qE '^[a-z]+(\(.+\))?!:'; then
    echo "a commit declares a breaking change"
  fi

  if [ "$(scripts/suggest-bump.sh | cut -d'|' -f1)" = "major" ]; then
    echo "the bump is a major"
  fi
}

case "${1:-status}" in
status)
  reasons=$(notable_reasons)
  if [ -z "$reasons" ]; then
    printf 'optional|routine release, auto-generated notes are fine|%s\n' \
      "$(has_section && echo present || echo absent)"
  else
    printf 'needed|%s|%s\n' \
      "$(printf '%s' "$reasons" | paste -sd';' - | sed 's/;/, and /g')" \
      "$(has_section && echo present || echo absent)"
  fi
  ;;

scaffold)
  if [ -z "$last" ]; then
    echo "No previous tag to scaffold from." >&2
    exit 1
  fi

  printf '## [%s] - %s\n\n' "$version" "$(date +%F)"
  printf 'ONE LINE ON WHY THIS RELEASE MATTERS TO A READER.\n\n'
  printf '<!-- Subjects below are grouped by commit prefix, which describes\n'
  printf '     intent rather than audience. Delete anything that never reaches\n'
  printf '     a user, and rewrite the rest as consequences. -->\n\n'

  reasons=$(notable_reasons)
  if [ -n "$reasons" ]; then
    printf '<!-- Needs a human because: %s -->\n\n' "$(printf '%s' "$reasons" | paste -sd',' -)"
  fi

  # Conventional Commit prefixes map onto Keep a Changelog sections. Only the
  # ones that reach users appear; chore, docs, ci and test are listed at the
  # bottom to be deleted, not because a reader wants them.
  emit() {
    local heading="$1" pattern="$2" body
    body=$(git log --format='%s' "$last"..HEAD | grep -E "$pattern" | sed -E 's/^[a-z]+(\(.+\))?!?: //' || true)
    [ -z "$body" ] && return
    printf '### %s\n\n' "$heading"
    printf '%s\n' "$body" | sed 's/^/- /' | sed 's/ (#[0-9]*)$//'
    printf '\n'
  }

  emit "Added" '^feat(\(.+\))?!?:'
  emit "Fixed" '^fix(\(.+\))?!?:'
  emit "Changed" '^(perf|refactor|revert)(\(.+\))?!?:'

  skipped=$(git log --format='%s' "$last"..HEAD | grep -cE '^(chore|docs|ci|test|build|style)(\(.+\))?:' || true)
  [ "$skipped" -gt 0 ] && printf '<!-- %s commit(s) omitted as not user facing. Add any that are. -->\n' "$skipped"
  ;;

*)
  echo "usage: $0 [status|scaffold] [version]" >&2
  exit 64
  ;;
esac

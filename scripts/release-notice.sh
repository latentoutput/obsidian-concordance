#!/usr/bin/env bash
#
# Say, loudly, whether the current branch will need a release once it merges.
#
# Run at the end of `make pr`. Merging publishes nothing: a release is a
# separate, deliberate step, and it is easy to land a fix and forget that
# nobody has actually received it. This works the answer out while the change
# is still fresh, including which bump it implies, so the decision is already
# made by the time you run `make release`.
#
#   scripts/release-notice.sh [base-ref]
#
# Compares against origin/main by default. Pass a base, such as the last tag,
# to ask what a release from here would look like.
set -eu

cd "$(git rev-parse --show-toplevel)"

# Colour when a human is looking. NO_COLOR turns it off even on a terminal;
# FORCE_COLOR turns it on through a pipe, which is how the banner gets
# previewed or captured into a CI log.
if [ -n "${NO_COLOR:-}" ]; then
  use_colour=""
elif [ -n "${FORCE_COLOR:-}" ] || [ -t 1 ]; then
  use_colour="yes"
else
  use_colour=""
fi

if [ -n "$use_colour" ]; then
  bold=$(printf '\033[1m'); dim=$(printf '\033[2m'); reset=$(printf '\033[0m')
  red=$(printf '\033[31m'); yellow=$(printf '\033[33m'); green=$(printf '\033[32m')
  cyan=$(printf '\033[36m'); white=$(printf '\033[97m')
  on_red=$(printf '\033[41m'); on_yellow=$(printf '\033[43m'); on_green=$(printf '\033[42m')
  black=$(printf '\033[30m')
else
  bold=""; dim=""; reset=""; red=""; yellow=""; green=""; cyan=""; white=""
  on_red=""; on_yellow=""; on_green=""; black=""
fi

rule="════════════════════════════════════════════════════════════════"

# Two questions, depending on where this runs.
#
# On a branch with commits of its own, the question is what this branch adds,
# so compare against main. On main, that comparison is empty by definition and
# the real question is what has piled up unreleased, so compare against the
# last tag. Getting this wrong made it report "no release owed" directly above
# a list of unreleased commits.
mainref="origin/main"
git rev-parse --verify --quiet "$mainref" >/dev/null || mainref="main"
ahead=$(git rev-list --count "$mainref"..HEAD 2>/dev/null || echo 0)
[ "$ahead" -gt 0 ] && pending_merge="yes" || pending_merge=""

last=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

if [ $# -ge 1 ]; then
  base="$1"
elif [ -n "$pending_merge" ]; then
  base="$mainref"
else
  base="${last:-$mainref}"
fi
git rev-parse --verify --quiet "$base" >/dev/null || base="$mainref"

fork=$(git merge-base HEAD "$base" 2>/dev/null || echo "")

# Only src/ and styles.css reach main.js, which is all a user ever downloads,
# and tests are never bundled into it however much they change.
if [ -n "$fork" ]; then
  reaching=$(git diff --name-only "$fork"...HEAD \
    -- src/ styles.css ':(exclude)*.test.ts' 2>/dev/null || echo "")
else
  reaching=""
fi

pending=0
[ -n "$last" ] && pending=$(git rev-list --count "$last"..HEAD 2>/dev/null || echo 0)

suggestion=$(scripts/suggest-bump.sh)
bump="${suggestion%%|*}"
reason="${suggestion#*|}"

case "$bump" in
  major) accent="$red";    banner="$on_red$white";    level="MAJOR" ;;
  minor) accent="$yellow"; banner="$on_yellow$black"; level="MINOR" ;;
  *)     accent="$green";  banner="$on_green$black";  level="PATCH" ;;
esac

if [ -n "$pending_merge" ]; then
  verdict="THIS PR NEEDS A $level RELEASE"
  files_label="Files in this PR that reach users:"
  when="Once this merges, from a clean main:"
else
  verdict="A $level RELEASE IS OWED"
  files_label="Files that reach users:"
  when="From a clean main:"
fi

current=$(node -p "require('./package.json').version")
next=$(node -e '
  const [cur, bump] = process.argv.slice(1);
  const [x, y, z] = cur.split(".").map(Number);
  console.log(bump === "patch" ? `${x}.${y}.${z + 1}`
            : bump === "minor" ? `${x}.${y + 1}.0`
            : `${x + 1}.0.0`);
' "$current" "$bump")

printf '\n'

if [ -z "$reaching" ]; then
  if [ -n "$pending_merge" ]; then
    printf '  %sNo release needed for this PR.%s Nothing under src/ or styles.css changed,\n' "$dim" "$reset"
  else
    printf '  %sNo release owed.%s Nothing under src/ or styles.css has changed,\n' "$dim" "$reset"
  fi
  printf '  %sso the main.js users download is unaffected.%s\n' "$dim" "$reset"
  if [ "$pending" -gt 0 ] && [ -n "$last" ]; then
    printf '\n  %sHeads up:%s %s commit(s) since %s are still unreleased from earlier work.\n' \
      "$yellow" "$reset" "$pending" "$last"
    printf '  Run %smake release%s when you want those to reach users.\n' "$bold" "$reset"
  fi
  printf '\n'
  exit 0
fi

# Pad on the plain text: colour escapes would break printf's width count.
suggested="make release-$bump"
generic="make release"
pad() { printf '%*s' $((22 - ${#1})) ''; }

# A solid bar reads as a stop sign even out of the corner of your eye, which
# is the point: this has to survive being scrolled past at the end of a build.
printf '%s%s%s\n' "$accent$bold" "$rule" "$reset"
printf '%s%s %-*s%s\n' "$banner" "$bold" "$((${#rule} - 1))" "$verdict" "$reset"
printf '%s%s%s\n' "$accent$bold" "$rule" "$reset"
printf '\n  %s\n' "$files_label"
printf '%s\n' "$reaching" | sed "s/^/    $cyan/;s/\$/$reset/"
printf '\n  Bump: %s%s%s   %s%s%s  ->  %s%s%s\n' \
  "$bold$accent" "$bump" "$reset" "$dim" "$current" "$reset" "$bold$accent" "$next" "$reset"
printf '  %sBecause %s.%s\n' "$dim" "$reason" "$reset"

# Curated notes matter most when the release is not routine, and that is
# exactly when nobody remembers to write them.
notes=$(scripts/changelog.sh status "$next" 2>/dev/null || echo "")
if [ "${notes%%|*}" = "needed" ] && [ "${notes##*|}" = "absent" ]; then
  why=$(printf '%s' "$notes" | cut -d'|' -f2)
  printf '\n  %sCurated notes wanted:%s %s.\n' "$bold$accent" "$reset" "$why"
  printf '  %sscripts/changelog.sh scaffold %s%s\n' "$bold$cyan" "$next" "$reset"
fi

if [ -n "$last" ]; then
  printf '\n  %s unreleased commit(s) since %s would ship together:\n' "$pending" "$last"
  git log --format='    %s' "$last"..HEAD | head -10
  extra=$((pending - 10))
  [ "$extra" -gt 0 ] && printf '    ... and %s more\n' "$extra"
fi

printf '\n  %s\n\n' "$when"
printf '      %s%s%s%s%s# straight to %s, no prompt%s\n' \
  "$bold$cyan" "$suggested" "$reset" "$(pad "$suggested")" "$dim" "$next" "$reset"
printf '      %s%s%s%s%s# same analysis, asks first%s\n' \
  "$bold$cyan" "$generic" "$reset" "$(pad "$generic")" "$dim" "$reset"
printf '\n  %sIntent cannot be read from commit prose. If this change is a feature or a\n' "$dim"
printf '  breaking one and no commit said so, override the bump.%s\n' "$reset"
printf '%s%s%s\n\n' "$accent$bold" "$rule" "$reset"

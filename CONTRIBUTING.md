# Contributing

## Development environment

Requires a Node LTS release (Node 24 LTS or newer LTS). Node "Current"
releases (odd-numbered) sometimes ship with an npm that breaks `npm install`
and `npm audit`.

```sh
npm install
npm run dev          # watch build
npm run build        # production build (typechecks first)
npm run test         # vitest
npm run lint         # eslint
npm run qa           # typecheck + lint + tests + format + build + audit (production deps only)
make help            # every target, if you have been away a while
```

`npm install` points `core.hooksPath` at `.githooks`, so `git push` runs the
full `qa` suite first. It takes about four seconds. Bypass it deliberately
with `git push --no-verify` or `SKIP_HOOKS=1 git push`.

## Manual testing in Obsidian

Automated tests cover the indexing logic but not the runtime integration
with Obsidian. Before cutting a release, install the build into a real
vault and exercise the commands:

```sh
make install-local VAULT=/path/to/test-vault
```

This builds the plugin and copies `main.js`, `manifest.json`, and
`styles.css` into the vault's `.obsidian/plugins/concordance/`. Reload
Obsidian (or toggle the plugin) and verify the settings tab renders, the
"Update current index" / "Update all indexes" / "Check indexes for
updates" commands behave correctly, and changes persist across reloads.

## Project layout

```text
src/                 TypeScript source bundled into main.js by esbuild
  block.ts           Marker parsing and block-replacement primitives
  indexing.ts        Index-detection and update-plan generation
  main.ts            Plugin entry point and command wiring
  modals.ts          Confirmation / diff modals
  settings.ts        Settings tab
  ui.ts              Shared DOM helpers
  types.ts           Shared types
.github/workflows/   Release workflow with artifact attestations
docs/screenshots/    README screenshots
scripts/             Local QA / security / compatibility helpers
```

The bundled `main.js` is the only runtime asset that ships to users, alongside
`manifest.json` and `styles.css`.

## Obsidian API compatibility

`manifest.json`'s `minAppVersion` is the oldest Obsidian build a user can
install this plugin on. The convention in the ecosystem is to set it to
the lowest version that has every API you actually use, not to keep it in
lockstep with current stable. Most community plugins drift years behind
stable, which is normal and fine.

A check verifies the declared floor is honest:

```sh
npm run check:min-app-version
```

The script walks `src/` for named imports from `"obsidian"`, looks each
symbol up in `scripts/obsidian-api-versions.json` (a hand-curated table
mapping `symbol → introduction version`), takes the max, and compares it
against `manifest.json`'s `minAppVersion`. Three outcomes:

- **Pass.** Declared floor is at or above the honest floor, so nothing to do.
- **Below floor (exit 1).** A symbol you import requires a newer build
  than `minAppVersion` claims. Raise `minAppVersion` in `manifest.json`
  to the printed value.
- **Unknown symbol (exit 2).** You imported something not in the table.
  Look up its introduction version in the Obsidian changelog and add the
  entry to `scripts/obsidian-api-versions.json`.

**Caveat:** the check is symbol-level. It only sees names in
`import { ... } from "obsidian"`, so a method call like
`metadataCache.fileToLinktext(...)` is invisible to it no matter how new
the method is.

A second check closes that gap by compiling against the floor itself:

```sh
npm run check:api-floor
```

It reads `minAppVersion`, resolves the newest published `obsidian` typings
at or below that line, downloads them, and typechecks `src/` against those
instead of the version in `node_modules`. The installed typings track the
latest API so editing and tooling stay current, which means the compiler
will happily accept something that does not exist on the declared floor.
This check fails only when the code actually reaches past the floor, which
is exactly when you have to decide: avoid the API, or raise `minAppVersion`
and `versions.json` together.

Because the floor is verified this way, the `obsidian` devDependency is free
to track latest and dependabot can bump it without weakening anything.

Both checks run on every push and PR via `.github/workflows/ci.yml`.
`.github/workflows/obsidian-watch.yml` runs them weekly as a fallback and
opens an issue if the floor drifts while nobody is looking.

Signature changes, behavioral changes, and event-name strings still slip
past both, so when you touch something subtle, test it in a real vault. The release-time heads-up
about Obsidian stable (see below) is the other half of compatibility
hygiene: it reminds you to test against the build most users actually
run, not just the Catalyst insider track.

## Commit messages

Conventional Commits, because `make release` reads the subject lines to suggest
a semver bump. The prefix is load-bearing:

| Prefix                                            | Suggests |
| ------------------------------------------------- | -------- |
| `feat:` / `feat(scope):`                          | minor    |
| `type!:` or a `BREAKING CHANGE` body trailer      | major    |
| `fix:` `docs:` `chore:` `ci:` `test:` `refactor:` | patch    |
| no prefix                                         | patch    |

Unprefixed commits are fine, they just always suggest patch and you override at
the release prompt. The convention is also written into `CLAUDE.md` so agent
sessions follow it, which matters here because most commits are agent-authored.

The subject becomes the PR title via `gh pr create --fill-first`, so write it
as one. Use `--fill-first` rather than `--fill`, or the whole body ends up in
the title.

## Branching and PRs

`main` is protected. Direct pushes are rejected, so every change lands as a
pull request. Required approvals are set to zero, so you merge your own PRs
without reviewing them, but CI has to be green first.

```sh
git checkout -b fix/some-thing
# work
git push -u origin fix/some-thing     # the pre-push hook runs qa
gh pr create --fill
gh pr merge --auto --squash           # merges itself once CI passes
```

`gh pr create --fill` takes the PR title from your first commit line, so write
that line as the title you want. Branches delete themselves on merge.

Outside contributions run the same `verify` job. A first-time contributor's
workflow run needs your approval before it starts, which is deliberate:
`npm ci` executes their lockfile's install scripts on the runner.

## Cutting a release

One command, from a clean `main`:

```sh
make release-patch       # bug fixes:     0.1.2 -> 0.1.3
make release-minor       # new features:  0.1.2 -> 0.2.0
make release-major       # breaking:      0.1.2 -> 1.0.0
make release-version VERSION=0.4.2
```

Add `DRY=1` to any of them to print the steps without touching anything:

```sh
make release-patch DRY=1
```

Because `main` requires a PR, the version bump cannot be pushed straight to
it. `scripts/release.sh` drives the whole sequence instead:

1. **Preflight.** Refuses unless you are on `main`, the tree is clean, and
   local `main` matches `origin/main`.
2. **Quality gate.** Runs the full `qa` suite. Nothing proceeds if it fails.
3. **Stable heads-up.** Compares `minAppVersion` against the current Obsidian
   stable release, so you know whether you are testing on the build most
   users actually run.
4. **Bump.** `npm version <bump> --no-git-tag-version` updates `package.json`,
   and the `version` script updates `manifest.json` and appends a
   `{ version -> minAppVersion }` entry to `versions.json`. No commit, no tag
   yet.
5. **Manual test prompt.** Asks whether you have installed the build in a real
   vault and exercised the commands. Answering no aborts and tells you how to
   revert the bump. Automated tests do not touch Obsidian, so this is the only
   thing standing between a broken build and your users.
6. **PR.** Commits the four files on a `release/X.Y.Z` branch, pushes, opens
   the PR, and enables auto-merge.
7. **Wait.** Watches CI, then waits for the merge.
8. **Tag.** Returns to `main`, pulls, and pushes a bare semver tag (`0.1.3`,
   never `v0.1.3`). Obsidian requires bare tags, enforced by `.npmrc`'s
   `tag-version-prefix=""`.

Pushing the tag triggers `.github/workflows/release.yml`, which:

- Re-runs typecheck, lint, tests, both API floor checks, audit, and the
  production build as a clean-room rebuild
- Verifies `manifest.json`'s version matches the pushed tag
- **Generates artifact attestations** for `main.js`, `manifest.json`, and
  `styles.css`, cryptographic provenance proving the assets were built from
  this repo at this commit, verifiable with `gh attestation verify`
- Creates the GitHub release with those three assets, using `CHANGELOG.md`'s
  `## [<version>]` section if present, otherwise auto-generated notes

Those three files are exactly what Obsidian's community-plugin reviewer
downloads. **Do not** attach the source archive. Only the bundled `main.js`
runs in users' vaults.

Tail it with `gh run watch --exit-status`.

### If something goes wrong partway

The script is resumable because each step is ordinary git and gh.

- **CI fails on the release PR.** The PR stays open. Fix it on the same
  branch, push, and it auto-merges. Then tag by hand:
  `git checkout main && git pull --ff-only && git tag X.Y.Z && git push origin X.Y.Z`
- **PR merged but the tag never pushed.** Just push the tag as above.
- **Tag pushed but the workflow failed.** Fix the cause, delete the tag on
  both sides (`git tag -d X.Y.Z && git push --delete origin X.Y.Z`), and
  re-push it. The version in `manifest.json` is already correct.

### Where the version lives

Three files have to agree, and the release workflow fails the build if they
do not:

- `package.json` — source of truth for `npm version`
- `manifest.json` — what Obsidian reads to offer an update
- `versions.json` — maps each plugin version to the `minAppVersion` it needs,
  so users on older Obsidian are served the last compatible release instead
  of a broken one

### Release notes

`CHANGELOG.md` is optional. Edit it before pushing the tag only when you
want curated hero notes (initial release, major versions, breaking changes).
Routine patches and minor releases work fine with auto-generated notes.

To curate notes for a release, add a section like this to `CHANGELOG.md`:

```markdown
## [0.2.0] - 2026-07-15

Brief summary of what's new.

### Added

- New feature A.

### Fixed

- Bug B.
```

The workflow reads the section matching `manifest.json`'s current version.

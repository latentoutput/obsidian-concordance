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
```

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
scripts/             Local QA / security helpers
```

The bundled `main.js` is the only runtime asset that ships to users —
alongside `manifest.json` and `styles.css`.

## Cutting a release

For most releases, one command:

```sh
make release-patch       # bug fixes:     0.1.0 → 0.1.1
make release-minor       # new features:  0.1.0 → 0.2.0
make release-major       # breaking:      0.1.0 → 1.0.0
```

Each combined target bumps the version, runs the full QA suite, compares
`minAppVersion` against the current Obsidian stable release, prints a
manual-test checklist, prompts for confirmation, then tags and pushes. If
QA fails or you decline the prompt, the release stops before the tag is
pushed.

For the very first release (where the bump is already in `manifest.json`),
or to re-release the current version without a bump, run just:

```sh
make release
```

If you need to bump and release as separate steps (for example, to keep
working on more commits between the bump and the publish):

```sh
make bump-patch          # or bump-minor / bump-major / bump VERSION=0.4.2
# ...more commits if you want...
make release
```

### What the targets actually do

**`bump-*`** wraps `npm version`, which:

1. Updates `version` in `package.json`
2. Runs the `version` script (`version-bump.mjs`), which:
   - Sets `version` in `manifest.json`
   - Appends a `{ newVersion → minAppVersion }` entry to `versions.json`
3. Commits all three files in a single commit
4. Creates a **bare semver tag** (e.g. `0.2.0`, never `v0.2.0`). Obsidian
   requires bare tags; the bare form is enforced via `.npmrc`'s
   `tag-version-prefix=""`.

**`release`**:

1. Runs the full local `qa` suite (typecheck + lint + tests + format check +
   markdown lint + production build + dependency audit). If anything fails,
   the tag is not pushed.
2. Tags the current `manifest.json` version if it isn't already tagged
   (covers the first-release case).
3. Pushes commits and tags to `origin`.

The push triggers the `release.yml` GitHub Actions workflow, which:

- Re-runs typecheck, lint, tests, audit, and the production build in CI for
  a clean-room rebuild
- Verifies that `manifest.json`'s version matches the pushed tag
- **Generates GitHub artifact attestations** for `main.js`, `manifest.json`,
  and `styles.css` (cryptographic provenance proving the assets were built
  from the source repository at this commit; users and reviewers can verify
  with `gh attestation verify`)
- Creates the GitHub release, attaching the three assets and using
  `CHANGELOG.md`'s `## [<version>]` section if present, otherwise
  auto-generated notes from commits since the previous tag

The three files attached to the release (`main.js`, `manifest.json`,
`styles.css`) are exactly what Obsidian's community-plugin reviewer
downloads. **Do not** attach the source archive — only the bundled `main.js`
runs in users' vaults.

Tail the release workflow after pushing with `gh run watch --exit-status`.

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

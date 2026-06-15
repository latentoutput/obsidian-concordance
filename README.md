# Concordance

Generate safe Markdown indexes from folders, tags, properties, and filename patterns.

Concordance writes a list of `[[wikilinks]]` into a clearly-marked block in any
note you designate as an index. Content outside the block is never touched, so
your indexes can mix prose, headings, callouts, and the auto-generated list in
one file.

## Features

- **Four ways to scope an index** in a single plugin:
  - `prefix` — files whose name starts with a configurable template (default
    `{PREFIX} -` plus a space)
  - `folder` — files inside a folder (optionally recursive)
  - `tag` — files carrying a tag (inline or frontmatter)
  - `property` — files whose frontmatter property equals a given value
- **Safe, contained edits.** Only the content between `%% concordance:start %%`
  and `%% concordance:end %%` is rewritten. Headings, notes, and other prose
  outside the block are left alone.
- **Diff-before-write modals** for single and bulk updates so you can see what
  will be added or removed before saving.
- **Read-only check command** to preview pending changes across the vault
  without modifying anything.
- **Configurable link style and sort** per index block (`name` vs full path,
  by `name` vs `path`).
- **Exclusions** for folders and filename substrings, applied to every mode.

## Installation

### From the Community Plugins browser (after acceptance)

1. In Obsidian, open **Settings → Community plugins**.
2. Disable Restricted mode if necessary.
3. Select **Browse**, search for **Concordance**, and install.
4. Enable the plugin.

### Manual install

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. Copy them into `<vault>/.obsidian/plugins/concordance/`.
3. Reload Obsidian and enable Concordance in **Settings → Community plugins**.

## Quick start

There are two ways to turn a note into an index.

### A. Filename-based prefix index

Create a note whose name matches the configured index template
(default `{PREFIX} - Index - {DISPLAY_NAME}`), e.g. `ART - Index - Art`. Open it
and run **Concordance: Update current index**. Concordance asks once whether to
insert the managed block, then fills it with links to every other note whose
name starts with the `ART -` prefix.

### B. Marker-driven index (any filename)

Add a managed block to any note. The attributes inside the start marker tell
Concordance how to populate it:

```markdown
## Recipes

%% concordance:start mode="folder" folder="Recipes" includeSubfolders="true" %%
%% concordance:end %%
```

Run **Concordance: Update current index** on the note. The body between the
markers is replaced with the generated list.

## Commands

| Command                          | What it does                                                |
| -------------------------------- | ----------------------------------------------------------- |
| Update current index             | Compute and apply the update for the active note.           |
| Update all indexes               | Bulk-update every detected index after a confirmation step. |
| Check indexes for updates        | Read-only diff of every index. Nothing is written.          |

## Block attribute reference

Attributes are written inside the start marker as `key="value"` pairs.

| Attribute           | Modes      | Values                                    | Default        |
| ------------------- | ---------- | ----------------------------------------- | -------------- |
| `mode`              | all        | `prefix`, `folder`, `tag`, `property`     | `prefix`       |
| `folder`            | `folder`   | vault-relative path (empty = whole vault) | _index folder_ |
| `includeSubfolders` | `folder`   | `true`, `false`                           | `false`        |
| `tag`               | `tag`      | `#tag` or `tag` (leading `#` added)       | —              |
| `property`          | `property` | frontmatter key                           | —              |
| `value`             | `property` | frontmatter value to match                | —              |
| `linkStyle`         | all        | `auto`, `name`, `path`                    | `auto`         |
| `sort`              | all        | `name`, `path`                            | `path`         |

`linkStyle="auto"` picks the basename for in-folder matches and the full path
for subfolder matches so wikilinks resolve unambiguously.

### Examples

```markdown
%% concordance:start mode="tag" tag="#recipe" sort="name" %%
%% concordance:end %%
```

```markdown
%% concordance:start mode="property" property="type" value="recipe" %%
%% concordance:end %%
```

```markdown
%% concordance:start mode="folder" folder="Projects/Active" includeSubfolders="true" linkStyle="path" %%
%% concordance:end %%
```

## Settings

- **Index note filename template** — pattern used to discover prefix-mode index
  notes. Must include `{PREFIX}` and `{DISPLAY_NAME}`.
- **Child note filename prefix template** — what prefix-mode child notes start
  with. Must include `{PREFIX}`.
- **Start / end markers** — the literal strings that delimit the managed block.
  The defaults use Obsidian's comment syntax so the markers do not render in
  preview mode.
- **Missing-block heading** — heading inserted just above a newly added block.
- **Missing-block behaviour** — `Ask` shows a confirmation modal before adding
  a marker pair to an index that has none; `Never` silently skips such files.
- **Excluded folders** — paths to skip in every mode.
- **Excluded note name terms** — substrings to skip in every mode.

## Safety model

- Concordance only writes between `%% concordance:start %%` and
  `%% concordance:end %%`. Everything else in the file is preserved.
- If the markers are missing or duplicated, no write happens and you receive a
  notice describing the problem.
- All updates go through a confirmation modal that lists what will be added and
  removed before any file is touched.

## Development

Requires a Node LTS release (Node 24 LTS or newer LTS). Node "Current"
releases (odd-numbered) sometimes ship with an npm that breaks `npm install`
and `npm audit`.

```sh
npm install
npm run dev          # watch build
npm run build        # production build (typechecks first)
npm run test         # vitest
npm run lint         # eslint
npm run qa           # typecheck + lint + tests + format + build + audit
```

### Cutting a release

For most releases, one command:

```sh
make release-patch       # bug fixes:     0.1.0 → 0.1.1
make release-minor       # new features:  0.1.0 → 0.2.0
make release-major       # breaking:      0.1.0 → 1.0.0
```

Each combined target bumps the version, runs the full QA suite, builds, tags,
pushes, and creates the GitHub release. If QA fails, the release stops before
anything is published.

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

#### What the targets actually do

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

1. Runs the full `qa` suite (typecheck + lint + tests + format check +
   markdown lint + production build + dependency audit)
2. Tags the current `manifest.json` version if it isn't already tagged
   (covers the first-release case)
3. Pushes commits and tags to `origin`
4. Calls `gh release create <version> main.js manifest.json styles.css`
   with auto-generated release notes

The three files attached to the release (`main.js`, `manifest.json`,
`styles.css`) are exactly what Obsidian's community-plugin reviewer
downloads. **Do not** attach the source archive — only the bundled `main.js`
runs in users' vaults.

## Disclosure

Developed with assistance from AI. All changes are reviewed and tested by the
maintainer.

## License

MIT — see [LICENSE](./LICENSE).

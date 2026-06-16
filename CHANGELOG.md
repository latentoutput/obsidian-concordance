# Changelog

This file is **optional curated release notes**. If a `## [version]` section
exists when `make release` runs, those notes are published with the release.
If no section exists, `gh release create --generate-notes` auto-generates
notes from commits and PRs since the previous tag. Use this file when you
want a hero summary (initial release, major versions, breaking changes);
otherwise skip it and let autogen handle the routine releases.

Format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project follows [Semantic Versioning](https://semver.org/).

## [0.1.2] - 2026-06-15

Broadens compatibility from Catalyst (1.13.1+) to stable Obsidian releases.

### Changed

- `minAppVersion` lowered from 1.13.1 to 1.8.0. The plugin now installs on
  any Obsidian build from 1.8 onward, not just Catalyst preview.
- Settings tab reverted from Obsidian 1.13's Catalyst-only declarative
  `getSettingDefinitions()` API back to the standard imperative `display()`
  method. No user-visible behaviour change. The declarative API can be
  re-adopted once it ships to stable; it coexists with `display()` so the
  migration is additive.
- `obsidian` dev dependency pinned to `~1.8.7` so the API contract is
  enforced at compile time.

## [0.1.1] - 2026-06-14

Addresses feedback from the Obsidian community-plugin review bot.

### Added

- GitHub Actions release workflow that builds, runs the full QA suite, and
  generates [artifact attestations](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds)
  for `main.js`, `manifest.json`, and `styles.css`. Release assets are now
  cryptographically tied to the source commit they were built from.

### Changed

- Settings tab migrated from the deprecated imperative `display()` API to
  Obsidian 1.13's declarative `getSettingDefinitions()`. No user-visible
  behaviour change.

### Removed

- `builtin-modules` dev dependency. The plugin doesn't import Node APIs, so
  the external-modules list in the esbuild config never needed Node
  builtins.

### Fixed

- Two `unknown`-typed values coming out of Obsidian's `MetadataCache` are
  now explicitly annotated, resolving "unsafe `any` assignment" lints
  without changing runtime behaviour.

## [0.1.0] - 2026-06-14

First public release.

Concordance writes a list of `[[wikilinks]]` into a clearly-marked block in
any note you designate as an index. Content outside the block is never
touched, so your indexes can mix prose, headings, callouts, and the
auto-generated list in one file.

### Added

- Four ways to scope an index in a single plugin: filename `prefix`,
  `folder`, `tag`, or frontmatter `property`.
- Diff-before-write modals for single and bulk updates so changes can be
  reviewed before any file is saved.
- Read-only check command to preview pending changes across the vault
  without modifying anything.
- Configurable per-block link style (`auto` / `name` / `path`) and sort
  (`name` / `path`).
- Global folder and filename exclusions applied across every mode.
- Safety boundary: only content between `%% concordance:start %%` and
  `%% concordance:end %%` is rewritten.

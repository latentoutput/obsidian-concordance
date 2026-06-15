# Changelog

This file is **optional curated release notes**. If a `## [version]` section
exists when `make release` runs, those notes are published with the release.
If no section exists, `gh release create --generate-notes` auto-generates
notes from commits and PRs since the previous tag. Use this file when you
want a hero summary (initial release, major versions, breaking changes);
otherwise skip it and let autogen handle the routine releases.

Format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project follows [Semantic Versioning](https://semver.org/).

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

# Concordance

Obsidian plugin that generates Markdown index blocks and writes them into
notes. Users commit those notes to git, so a bad write is data loss in
someone's vault. Bias toward caution over cleverness in anything that touches
`replaceGeneratedBlock` or `buildGeneratedBlock`.

## Commit messages

Use Conventional Commits. `scripts/release.sh` reads the subject lines to
suggest a semver bump, so the prefix is load-bearing, not decoration:

- `feat:` or `feat(scope):` — suggests a **minor** bump
- `refactor!:`, or any `type!:`, or a `BREAKING CHANGE` body trailer —
  suggests **major**
- `fix:`, `docs:`, `chore:`, `ci:`, `test:`, `refactor:` — suggests **patch**

Anything unprefixed falls back to patch. Do not guess a prefix to influence the
bump. If a change adds a user-facing capability it is `feat:`, otherwise it is
not.

Subject line is the PR title, so write it as one. Body explains why, not what.

## Workflow

`main` is protected: no direct pushes, PRs require the `verify` check to pass,
zero approvals required. Every change goes through a branch.

```sh
git checkout -b fix/thing
git push -u origin fix/thing      # pre-push hook runs the full qa suite
gh pr create --fill-first          # --fill-first, not --fill, or the body becomes the title
gh pr merge --auto --squash
```

Never commit directly to `main`. Never bypass the hook with `--no-verify`
without saying why.

## Constraints that are easy to violate

**API floor.** `manifest.json` declares `minAppVersion: 1.8.0`, but the
installed `obsidian` typings track latest, so the compiler will accept APIs
that do not exist on the floor. `npm run check:api-floor` compiles `src/`
against the floor's typings and is the thing that catches this. Check
`@since` tags before using an unfamiliar Obsidian API.

**Obsidian link resolution is not what the docs imply.** A bare path like
`[[folder/note]]` is matched against the end of every path in the vault, not
resolved relative to the source note, and vault-root paths win ties. See
`docs/link-resolution.md`, which is measured behaviour rather than
documentation. Re-run `test-vault/probe.js` via `obsidian eval` after an
Obsidian upgrade before trusting it.

**Nothing automated touches Obsidian.** Tests cover indexing logic only. For
anything affecting what gets written into notes, install into a vault and
exercise it: `make install-local VAULT=./test-vault`.

## Layout

- `src/block.ts` — marker parsing, block building, link extraction, diff stats
- `src/indexing.ts` — candidate selection, link targets, update plans
- `src/main.ts` — commands and the write path
- `test-vault/` — fixture vault plus `probe.js` for live-API experiments
- `make help` — everything else

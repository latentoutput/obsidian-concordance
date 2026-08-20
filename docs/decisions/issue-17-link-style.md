# Issue #17: relative link style

**Status:** decided, not built. Waiting on the reporter.
**Issue:** https://github.com/nsyout/obsidian-concordance/issues/17
**Evidence:** [`docs/link-resolution.md`](../link-resolution.md)
**Date:** 2026-08-20

## The request

Generated indexes emit `[[mytheme/afolder/doc]]` for notes in a subfolder of
the indexed folder. The reporter wants `[[afolder/doc]]`: shorter, and in their
words working "outside obsidian (in vim)".

## Decision

Add an **opt-in** `linkStyle` that delegates to
`metadataCache.fileToLinktext(file, sourcePath, true)`, keeping the `[[...]]`
wrapper in the plugin.

`fileToLinktext` reads the vault's `newLinkFormat` setting but not
`useMarkdownLinks`. So it yields the path shape the user already configured
while leaving link syntax to us. That distinction matters:
`generateMarkdownLink` reads both and would emit Markdown links for anyone with
wikilinks disabled, which `extractWikilinkTargets` cannot parse and would
report as every link removed.

Delegating also makes plugin output identical to what Obsidian's own rename
rewriter produces, so a rename becomes a no-op instead of permanent diff churn
between the two.

In a vault set to "Relative path to file", this produces exactly the output the
reporter asked for, and correctly emits `[[../mytheme/afolder/doc]]` when the
index note lives outside the folder it indexes.

## Rejected alternatives

**Hand-rolling `linkStyle="relative"`.** It emits the form Obsidian
suffix-matches rather than resolves. A vault-root twin silently wins, and
matching is not folder-segment aware, so `afolder/doc` resolves inside a folder
named `myafolder`. Obsidian's rewriter would strip it to the vault's own format
on the first rename. A survey of ten plugins that write generated link lists to
disk found none that hand-build a source-relative wikilink.

**Emitting `./`-prefixed links.** They resolve more precisely, beating a
root-level twin and failing loudly rather than landing on the wrong file. But
they break when the index note moves, and Obsidian rewrites them back to the
bare form anyway.

**Changing the `auto` default.** Rewrites every generated block in every
existing vault, producing large no-op diffs in files users commit to git.

## Why it is not built yet

The stated need is links that work in vim, outside Obsidian. A wikilink does not
resolve in vanilla vim, pandoc, or GitHub regardless of its path shape, so a
Markdown link with a relative target may serve that need better than any
`linkStyle` change would.

Asked on the issue what resolves wikilinks in their setup. Build after the
answer, not before.

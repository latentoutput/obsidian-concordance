# How Obsidian actually resolves wikilinks

Measured against Obsidian 1.13.7 using the `test-vault/` fixture and
`test-vault/probe.js`, run through `obsidian eval`. Obsidian does not document
its resolution algorithm, so everything below is observed behavior rather than
a documented contract. Re-run the probe before relying on it after an upgrade.

The only officially documented part is the "New link format" setting itself:
https://obsidian.md/help/settings

## Resolution

`getFirstLinkpathDest(link, source)` observed results:

| Link | Source | Resolves to |
| --- | --- | --- |
| `afolder/amarkdowndoc` | `A/mytheme/index.md` | `A/mytheme/afolder/amarkdowndoc.md` |
| `./afolder/amarkdowndoc` | `A/mytheme/index.md` | `A/mytheme/afolder/amarkdowndoc.md` |
| `afolder/bdoc` | `B/mytheme/index.md` | `afolder/bdoc.md` (vault root wins) |
| `./afolder/bdoc` | `B/mytheme/index.md` | `B/mytheme/afolder/bdoc.md` |
| `afolder/cdoc` | `C/index.md` | `C/myafolder/cdoc.md` (!) |
| `./afolder/cdoc` | `C/index.md` | unresolved |
| `../mytheme/afolder/ddoc` | `D/inbox/index.md` | `D/mytheme/afolder/ddoc.md` |

Three things follow, and they matter for any generated link text:

1. A bare path is **not** resolved relative to the source note. It is matched
   against the end of every path in the vault, with source-folder candidates
   only sorted first. A link with no relationship to the source still resolves.
2. An exact vault-root path takes priority over any suffix match, so a
   root-level twin silently steals the link.
3. Suffix matching is **not folder-segment aware**. A link to `afolder/cdoc`
   resolves into a folder named `myafolder`.

A leading `./` avoids all three. It is matched exactly against the source
folder, beats a root-level twin, and fails loudly (unresolved) rather than
silently landing on the wrong file.

## Generation

What Obsidian writes, per "New link format", for a note in a subfolder of the
source note's folder:

| Setting | Generated |
| --- | --- |
| Shortest path when possible | `[[amarkdowndoc]]` |
| Relative path to file | `[[afolder/amarkdowndoc]]` |
| Absolute path in vault | `[[A/mytheme/afolder/amarkdowndoc]]` |

When the source note sits outside the folder being linked into, relative mode
emits `[[../mytheme/afolder/ddoc]]`.

Note that relative mode never emits a leading `./` for a descendant path, so
Obsidian's own relative links are subject to points 1 through 3 above.

`fileToLinktext` reads `newLinkFormat` but not `useMarkdownLinks`, so it yields
the path shape while leaving link syntax to the caller.
`generateMarkdownLink` reads both.

## What renames do to a generated block

Tested by putting three link styles inside a real `%% concordance:start %%`
block, enabling "Automatically update internal links", and renaming through
`fileManager.renameFile`.

Starting block, and what one rename produced with the vault set to "shortest":

    - [[afolder/edoc1]]                  ->  - [[edoc1-renamed]]
    - [[E/mytheme/afolder/edoc2]]        ->  - [[edoc2-renamed]]
    - [[edoc3]]                          ->  - [[edoc3-renamed]]

Four things to know:

1. **The markers protect nothing.** Links between `concordance:start` and
   `concordance:end` are ordinary links and Obsidian rewrites them in place.
2. **The rewrite does not preserve the existing style.** It writes whatever the
   vault's "New link format" says at the moment of the rename. An absolute link
   becomes a shortest-path link if that is how the vault is configured.
3. **Only the renamed target's line is touched**, so a block gradually
   accumulates a mix of styles rather than converting all at once.
4. **Moving the index note does not break a bare relative link**, because such a
   link was never resolved relative to the source. A genuinely relative
   `./afolder/edoc1` link *does* break, resolving to nothing.

The practical consequence is that any link style the plugin picks independently
of the vault setting will be fought by Obsidian on every rename, producing
diff churn with no change in meaning. Emitting what the vault setting would
emit makes the rewrite a no-op.

Note that "Automatically update internal links" was `false` in this freshly
created vault, so this only affects users who have turned it on.

# Link resolution test vault

Fixture vault for checking how Obsidian actually resolves wikilinks, as opposed
to how the docs describe it. Built for issue #17.

- `A/` reproduces issue #17 exactly. Index at `A/mytheme/index.md`, one sibling
  note, one note in a subfolder.
- `B/` tests vault-root shadowing. `B/mytheme/afolder/bdoc.md` has a same-named
  twin at `afolder/bdoc.md` in the vault root.
- `C/` tests whether path matching is folder-segment aware. The folder is
  `myafolder`, so a link to `afolder/cdoc` should not match it.
- `D/` tests an index note that lives outside the folder it indexes.

Open this folder as a vault, then drive it with `obsidian eval`.

## Running the probe

Open this folder as a vault in Obsidian, then from anywhere:

    obsidian eval code="$(cat test-vault/probe.js)"

`probe.js` resolves a matrix of link forms through the live metadata cache, then
cycles the "New link format" setting through shortest, relative and absolute to
capture what Obsidian itself generates. It saves both link settings up front and
restores them in a `finally` block.

Findings are written up in `docs/link-resolution.md`.

## Running the settings probe

`settings-probe.js` checks the parts of the settings tab that unit tests cannot
reach, by driving the live plugin inside Obsidian. Install the current build,
reload the plugin, then run it:

    make install-local VAULT=test-vault
    obsidian plugin:reload id=concordance
    obsidian eval code="$(cat test-vault/settings-probe.js)"

It asserts that the plugin loads, that `getSettingDefinitions()` produces the
expected groups, that every stored setting has a control, that values round
trip through storage and reach `data.json`, and that each setting is findable
in Obsidian's settings search. It restores whatever it changed in a `finally`
block and prints `ALL PASS` or a count of failures.

This is what caught the child prefix template losing its trailing space.

## Concordance fixtures

`Concordance/` holds index notes covering every status the plugin reports, so
the three commands can be exercised against something real. They are committed
in their pre-run state, needing an update, so the check means something each
time. Reset them with `git checkout test-vault/Concordance` after a run.

| Note                        | Exercises                                  |
| --------------------------- | ------------------------------------------ |
| `CON - Index - Prefix.md`   | prefix mode, matched by filename template  |
| `Folder Index.md`           | `mode="folder"`, matched by marker          |
| `Tag Index.md`              | `mode="tag"` over `#concordance-fixture`    |
| `CON - Index - Missing.md`  | recognised as an index, has no block        |
| `CON - Index - Malformed.md`| broken block, recognised by filename        |
| `Broken Folder Index.md`    | broken block, recognised only by markers    |

A healthy run reports 6 indexes found, 3 needing updates, 6 links to add, 1
missing block and 2 malformed.

The last two fixtures are a pair on purpose. Both have their markers reversed;
they differ only in whether the filename matches the index template. That
changes how sure the plugin can be, and the summary says so: the named one is
reported plainly, while the other carries "(matched on its markers, not its
filename)", because a note that merely documents the markers looks identical
from the plugin's side.

## Exercising the commands

With the vault open and the current build installed:

    make install-local VAULT=test-vault
    obsidian plugin:reload id=concordance

Then run `Check indexes for updates`, `Update all indexes`, and
`Update current index` from the command palette, or drive them through
`obsidian eval`.

> [!important] Modals render into whichever window is active
> Obsidian puts the settings tab in its own window. If that window is open,
> plugin modals render there too, and `document.querySelector` from `obsidian
> eval` will not find them, which looks exactly like the modal failing to
> open. Call `app.setting.close()` first, and reach a modal through
> `document.querySelector(".modal-container").ownerDocument` rather than
> assuming `document`.

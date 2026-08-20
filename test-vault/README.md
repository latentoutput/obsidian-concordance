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

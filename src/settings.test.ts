import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingDefinitionControl, SettingDefinitionItem } from "obsidian";
import { noticeMessages, resetNoticeMessages } from "../test/obsidian-stub";
import {
  ConcordanceSettingTab,
  DEFAULT_SETTINGS,
  createDefaultSettings,
  type ConcordanceSettings,
} from "./settings";
import type ConcordancePlugin from "./main";

type SettingKey = keyof ConcordanceSettings;

function createTab(overrides: Partial<ConcordanceSettings> = {}) {
  const settings: ConcordanceSettings = { ...createDefaultSettings(), ...overrides };
  const saveSettings = vi.fn(() => Promise.resolve());
  const plugin = { settings, saveSettings } as unknown as ConcordancePlugin;
  const tab = new ConcordanceSettingTab({} as never, plugin);
  // The stub records update() calls; the real base class re-renders.
  return { tab, plugin: plugin as unknown as { settings: ConcordanceSettings }, saveSettings };
}

// getSettingDefinitions returns groups of definitions, so flatten to the
// control-bearing rows the storage hooks are actually keyed by.
function controlsOf(items: SettingDefinitionItem<SettingKey>[]) {
  const found: { name: string; control: SettingDefinitionControl<SettingKey>["control"] }[] = [];

  for (const item of items) {
    if (!("items" in item) || !item.items) {
      continue;
    }
    for (const child of item.items) {
      if ("control" in child && child.control) {
        found.push({ name: child.name, control: child.control });
      }
    }
  }

  return found;
}

beforeEach(() => {
  resetNoticeMessages();
});

describe("settings definitions", () => {
  it("groups every setting under a heading", () => {
    const { tab } = createTab();
    const items = tab.getSettingDefinitions();

    expect(items.map((item) => ("heading" in item ? item.heading : undefined))).toEqual([
      "Prefix mode defaults",
      "Generated block markers",
      "Global exclusions",
      "Maintenance",
    ]);
  });

  // The compiler rejects a control key that is not a ConcordanceSettings key.
  // It cannot catch the inverse, which is a stored setting that no control
  // edits, so a setting silently disappearing from the tab is checked here.
  it("exposes a control for every stored setting", () => {
    const { tab } = createTab();
    const keys = controlsOf(tab.getSettingDefinitions()).map((entry) => entry.control.key);

    expect([...keys].sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  it("names and describes every row", () => {
    const { tab } = createTab();

    for (const item of tab.getSettingDefinitions()) {
      if (!("items" in item) || !item.items) {
        continue;
      }
      for (const child of item.items) {
        // Pages carry a title rather than a name, and we do not use them.
        expect("name" in child).toBe(true);
        if ("name" in child) {
          expect(child.name.length).toBeGreaterThan(0);
          expect(child.desc).toBeTruthy();
        }
      }
    }
  });

  it("offers exactly the supported missing-block behaviours", () => {
    const { tab } = createTab();
    const control = controlsOf(tab.getSettingDefinitions()).find(
      (entry) => entry.control.key === "missingBlockBehavior",
    )?.control;

    expect(control?.type).toBe("dropdown");
    expect(control && "options" in control ? Object.keys(control.options) : []).toEqual([
      "ask",
      "never",
    ]);
  });
});

describe("reading control values", () => {
  it("reads scalar settings straight through", () => {
    const { tab } = createTab({ startMarker: "%% custom:start %%" });

    expect(tab.getControlValue("startMarker")).toBe("%% custom:start %%");
    expect(tab.getControlValue("missingBlockBehavior")).toBe("ask");
  });

  it("presents list settings one per line", () => {
    const { tab } = createTab({ excludedFolders: ["Archive", "Private/Notes"] });

    expect(tab.getControlValue("excludedFolders")).toBe("Archive\nPrivate/Notes");
  });

  it("returns undefined for a key it does not own", () => {
    const { tab } = createTab();

    expect(tab.getControlValue("somethingElse")).toBeUndefined();
  });
});

describe("writing control values", () => {
  // Regression: the child prefix default is "{PREFIX} - " and the trailing
  // space is the separator that yields "ART - Anatomy". Trimming it on edit
  // silently rewrote every child filename the plugin matched and generated.
  it("keeps trailing whitespace in the child prefix template", async () => {
    const { tab, plugin } = createTab();

    await tab.setControlValue("childFilenamePrefixTemplate", "{PREFIX} - ");

    expect(plugin.settings.childFilenamePrefixTemplate).toBe("{PREFIX} - ");
    expect(tab.getControlValue("childFilenamePrefixTemplate")).toBe("{PREFIX} - ");
  });

  it("round-trips every default without altering it", async () => {
    const { tab, plugin } = createTab();
    const keys = Object.keys(DEFAULT_SETTINGS) as (keyof ConcordanceSettings)[];

    for (const key of keys) {
      await tab.setControlValue(key, tab.getControlValue(key) as string);
    }

    expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("trims text settings and persists them", async () => {
    const { tab, plugin, saveSettings } = createTab();

    await tab.setControlValue("autoIndexHeading", "  Contents  ");

    expect(plugin.settings.autoIndexHeading).toBe("Contents");
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it("splits list settings on newlines, dropping blanks and padding", async () => {
    const { tab, plugin } = createTab();

    await tab.setControlValue("excludedFolders", "Archive\n\n  Private/Notes  \n");

    expect(plugin.settings.excludedFolders).toEqual(["Archive", "Private/Notes"]);
  });

  it("keeps the dropdown within its union", async () => {
    const { tab, plugin } = createTab();

    await tab.setControlValue("missingBlockBehavior", "never");
    expect(plugin.settings.missingBlockBehavior).toBe("never");

    await tab.setControlValue("missingBlockBehavior", "nonsense");
    expect(plugin.settings.missingBlockBehavior).toBe("ask");
  });

  it("ignores unknown keys and non-string values without saving", async () => {
    const { tab, plugin, saveSettings } = createTab();
    const before = { ...plugin.settings };

    await tab.setControlValue("somethingElse", "value");
    await tab.setControlValue("startMarker", 42);

    expect(plugin.settings).toEqual(before);
    expect(saveSettings).not.toHaveBeenCalled();
  });
});

describe("resetting", () => {
  it("restores defaults, notifies, and re-renders", async () => {
    const { tab, plugin, saveSettings } = createTab({
      autoIndexHeading: "Changed",
      excludedFolders: ["Archive"],
    });

    const items = tab.getSettingDefinitions();
    const maintenance = items[items.length - 1];
    const row =
      maintenance && "items" in maintenance && maintenance.items ? maintenance.items[0] : undefined;
    expect(row && "render" in row).toBe(true);

    // Drive the rendered button the way Obsidian would.
    let onClick: (() => void) | undefined;
    const setting = {
      addButton(cb: (button: unknown) => void) {
        const button = {
          setButtonText() {
            return button;
          },
          onClick(handler: () => void) {
            onClick = handler;
            return button;
          },
        };
        cb(button);
        return setting;
      },
    };

    if (row && "render" in row && row.render) {
      row.render(setting as never, undefined as never);
    }
    onClick?.();
    await vi.waitFor(() => expect(saveSettings).toHaveBeenCalled());

    expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
    expect(noticeMessages).toEqual(["Concordance settings reset to defaults."]);
    expect((tab as unknown as { updateCount: number }).updateCount).toBe(1);
  });

  it("does not alias the default arrays", async () => {
    const { tab, plugin } = createTab();

    await tab.setControlValue("excludedFolders", "Archive");

    expect(DEFAULT_SETTINGS.excludedFolders).toEqual([]);
    expect(plugin.settings.excludedFolders).toEqual(["Archive"]);
  });
});

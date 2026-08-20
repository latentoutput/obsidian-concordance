import { Notice, PluginSettingTab } from "obsidian";
import type { App, SettingDefinitionItem } from "obsidian";
import type ConcordancePlugin from "./main";

export type MissingBlockBehavior = "ask" | "never";

export interface ConcordanceSettings {
  indexFilenameTemplate: string;
  childFilenamePrefixTemplate: string;
  startMarker: string;
  endMarker: string;
  autoIndexHeading: string;
  missingBlockBehavior: MissingBlockBehavior;
  excludedFolders: string[];
  excludedFilenameTerms: string[];
}

export const DEFAULT_SETTINGS: ConcordanceSettings = {
  indexFilenameTemplate: "{PREFIX} - Index - {DISPLAY_NAME}",
  childFilenamePrefixTemplate: "{PREFIX} - ",
  startMarker: "%% concordance:start %%",
  endMarker: "%% concordance:end %%",
  autoIndexHeading: "Index",
  missingBlockBehavior: "ask",
  excludedFolders: [],
  excludedFilenameTerms: [],
};

export function createDefaultSettings(): ConcordanceSettings {
  return {
    ...DEFAULT_SETTINGS,
    excludedFolders: [...DEFAULT_SETTINGS.excludedFolders],
    excludedFilenameTerms: [...DEFAULT_SETTINGS.excludedFilenameTerms],
  };
}

function parseLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

// Settings stored as arrays but edited as one-per-line text.
const LINE_LIST_KEYS = ["excludedFolders", "excludedFilenameTerms"] as const;

// Settings stored as trimmed free text. Surrounding whitespace in these is
// always a typo, and trimming keeps a stray space out of a marker or heading.
const TEXT_KEYS = [
  "indexFilenameTemplate",
  "startMarker",
  "endMarker",
  "autoIndexHeading",
] as const;

// Stored exactly as typed, because trailing whitespace carries meaning. The
// default child prefix is "{PREFIX} - ", where the final space is the
// separator that produces "ART - Anatomy". Trimming it silently rewrites every
// child filename the plugin matches and generates, so this one is left alone.
const VERBATIM_KEYS = ["childFilenamePrefixTemplate"] as const;

type SettingKey = keyof ConcordanceSettings;
type LineListKey = (typeof LINE_LIST_KEYS)[number];
type TextKey = (typeof TEXT_KEYS)[number];
type VerbatimKey = (typeof VERBATIM_KEYS)[number];

function isLineListKey(key: string): key is LineListKey {
  return (LINE_LIST_KEYS as readonly string[]).includes(key);
}

function isTextKey(key: string): key is TextKey {
  return (TEXT_KEYS as readonly string[]).includes(key);
}

function isVerbatimKey(key: string): key is VerbatimKey {
  return (VERBATIM_KEYS as readonly string[]).includes(key);
}

export class ConcordanceSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: ConcordancePlugin,
  ) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem<SettingKey>[] {
    return [
      {
        type: "group",
        heading: "Prefix mode defaults",
        items: [
          {
            name: "Index note filename template",
            desc: "Identifies prefix-mode index notes. Must include {PREFIX} and {DISPLAY_NAME}.",
            control: {
              type: "text",
              key: "indexFilenameTemplate",
              placeholder: DEFAULT_SETTINGS.indexFilenameTemplate,
            },
          },
          {
            name: "Child note filename prefix template",
            desc: "Finds prefix-mode child notes. Use {PREFIX} for the captured prefix.",
            control: {
              type: "text",
              key: "childFilenamePrefixTemplate",
              placeholder: DEFAULT_SETTINGS.childFilenamePrefixTemplate,
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Generated block markers",
        items: [
          {
            name: "Start marker",
            desc: 'Marks the start of plugin-owned content. Supports options like mode="folder".',
            control: {
              type: "text",
              key: "startMarker",
              placeholder: DEFAULT_SETTINGS.startMarker,
            },
          },
          {
            name: "End marker",
            desc: "Marks the end of plugin-owned content. Content outside markers is never changed.",
            control: {
              type: "text",
              key: "endMarker",
              placeholder: DEFAULT_SETTINGS.endMarker,
            },
          },
          {
            name: "Missing-block heading",
            desc: "Heading inserted before a newly added generated block.",
            control: {
              type: "text",
              key: "autoIndexHeading",
              placeholder: DEFAULT_SETTINGS.autoIndexHeading,
            },
          },
          {
            name: "Missing auto-index blocks",
            desc: "Controls what happens when an index note has no Concordance markers.",
            control: {
              type: "dropdown",
              key: "missingBlockBehavior",
              options: {
                ask: "Ask before adding",
                never: "Never add automatically",
              },
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Global exclusions",
        items: [
          {
            name: "Excluded folders",
            desc: "Skip notes inside these vault-relative folders. One folder per line.",
            control: {
              type: "textarea",
              key: "excludedFolders",
              placeholder: "Archive\nTemplates\nPrivate/Notes",
              rows: 6,
            },
          },
          {
            name: "Excluded note name terms",
            desc: "Skip notes whose file name contains these plain-text terms. One term per line.",
            control: {
              type: "textarea",
              key: "excludedFilenameTerms",
              placeholder: "Draft\nWIP\nArchive\n_template",
              rows: 6,
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Maintenance",
        items: [
          {
            name: "Reset settings",
            desc: "Restore Concordance defaults.",
            // A render row keeps the labelled button the imperative tab had.
            // An action row makes the whole row clickable with no "Reset"
            // label on it, which reads as a navigation affordance instead.
            render: (setting) => {
              setting.addButton((button) =>
                button.setButtonText("Reset").onClick(() => {
                  void this.resetSettings();
                }),
              );
            },
          },
        ],
      },
    ];
  }

  // Settings live on the plugin and persist through saveSettings(), not in the
  // vault config the base implementation reads, so both halves are overridden.
  getControlValue(key: string): unknown {
    const settings = this.plugin.settings;

    if (isLineListKey(key)) {
      return settings[key].join("\n");
    }

    if (isTextKey(key) || isVerbatimKey(key)) {
      return settings[key];
    }

    if (key === "missingBlockBehavior") {
      return settings.missingBlockBehavior;
    }

    return undefined;
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    // Every control above is string-valued, so anything else means a
    // definition and this method have drifted apart. Drop it rather than
    // coercing something unrecognised into settings.
    if (typeof value !== "string") {
      return;
    }

    const settings = this.plugin.settings;

    if (isLineListKey(key)) {
      settings[key] = parseLines(value);
    } else if (isTextKey(key)) {
      settings[key] = value.trim();
    } else if (isVerbatimKey(key)) {
      settings[key] = value;
    } else if (key === "missingBlockBehavior") {
      settings.missingBlockBehavior = value === "never" ? "never" : "ask";
    } else {
      return;
    }

    await this.plugin.saveSettings();
  }

  private async resetSettings(): Promise<void> {
    this.plugin.settings = createDefaultSettings();
    await this.plugin.saveSettings();
    new Notice("Concordance settings reset to defaults.");
    // Values changed underneath the definitions, so re-render from them.
    this.update();
  }
}

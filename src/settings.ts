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

const LIST_KEYS = new Set<keyof ConcordanceSettings>(["excludedFolders", "excludedFilenameTerms"]);

export class ConcordanceSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: ConcordancePlugin,
  ) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
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
              rows: 6,
              placeholder: "Archive\nTemplates\nPrivate/Notes",
            },
          },
          {
            name: "Excluded note name terms",
            desc: "Skip notes whose file name contains these plain-text terms. One term per line.",
            control: {
              type: "textarea",
              key: "excludedFilenameTerms",
              rows: 6,
              placeholder: "Draft\nWIP\nArchive\n_template",
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
            render: (setting) => {
              setting.addButton((button) => {
                button.setButtonText("Reset").onClick(async () => {
                  this.plugin.settings = createDefaultSettings();
                  await this.plugin.saveSettings();
                  new Notice("Concordance settings reset to defaults.");
                  this.update();
                });
              });
            },
          },
        ],
      },
    ];
  }

  getControlValue(key: string): unknown {
    if (isListKey(key)) {
      return this.plugin.settings[key].join("\n");
    }

    const settings = this.plugin.settings as unknown as Record<string, unknown>;
    return settings[key];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (isListKey(key)) {
      const text = typeof value === "string" ? value : "";
      this.plugin.settings[key] = text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      await this.plugin.saveSettings();
      return;
    }

    const settings = this.plugin.settings as unknown as Record<string, unknown>;
    settings[key] = typeof value === "string" ? value.trim() : value;
    await this.plugin.saveSettings();
  }
}

function isListKey(key: string): key is "excludedFolders" | "excludedFilenameTerms" {
  return LIST_KEYS.has(key as keyof ConcordanceSettings);
}

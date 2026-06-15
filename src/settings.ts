import { Notice, PluginSettingTab, SettingGroup } from "obsidian";
import type { App } from "obsidian";
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

export class ConcordanceSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: ConcordancePlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("concordance-settings");

    new SettingGroup(containerEl)
      .setHeading("Prefix mode defaults")
      .addSetting((setting) => {
        setting
          .setName("Index note filename template")
          .setDesc("Identifies prefix-mode index notes. Must include {PREFIX} and {DISPLAY_NAME}.")
          .addText((text) => {
            text
              .setPlaceholder(DEFAULT_SETTINGS.indexFilenameTemplate)
              .setValue(this.plugin.settings.indexFilenameTemplate)
              .onChange(async (value) => {
                this.plugin.settings.indexFilenameTemplate = value.trim();
                await this.plugin.saveSettings();
              });
          });
      })
      .addSetting((setting) => {
        setting
          .setName("Child note filename prefix template")
          .setDesc("Finds prefix-mode child notes. Use {PREFIX} for the captured prefix.")
          .addText((text) => {
            text
              .setPlaceholder(DEFAULT_SETTINGS.childFilenamePrefixTemplate)
              .setValue(this.plugin.settings.childFilenamePrefixTemplate)
              .onChange(async (value) => {
                this.plugin.settings.childFilenamePrefixTemplate = value;
                await this.plugin.saveSettings();
              });
          });
      });

    new SettingGroup(containerEl)
      .setHeading("Generated block markers")
      .addSetting((setting) => {
        setting
          .setName("Start marker")
          .setDesc('Marks the start of plugin-owned content. Supports options like mode="folder".')
          .addText((text) => {
            text
              .setPlaceholder(DEFAULT_SETTINGS.startMarker)
              .setValue(this.plugin.settings.startMarker)
              .onChange(async (value) => {
                this.plugin.settings.startMarker = value.trim();
                await this.plugin.saveSettings();
              });
          });
      })
      .addSetting((setting) => {
        setting
          .setName("End marker")
          .setDesc(
            "Marks the end of plugin-owned content. Content outside markers is never changed.",
          )
          .addText((text) => {
            text
              .setPlaceholder(DEFAULT_SETTINGS.endMarker)
              .setValue(this.plugin.settings.endMarker)
              .onChange(async (value) => {
                this.plugin.settings.endMarker = value.trim();
                await this.plugin.saveSettings();
              });
          });
      })
      .addSetting((setting) => {
        setting
          .setName("Missing-block heading")
          .setDesc("Heading inserted before a newly added generated block.")
          .addText((text) => {
            text
              .setPlaceholder(DEFAULT_SETTINGS.autoIndexHeading)
              .setValue(this.plugin.settings.autoIndexHeading)
              .onChange(async (value) => {
                this.plugin.settings.autoIndexHeading = value.trim();
                await this.plugin.saveSettings();
              });
          });
      })
      .addSetting((setting) => {
        setting
          .setName("Missing auto-index blocks")
          .setDesc("Controls what happens when an index note has no Concordance markers.")
          .addDropdown((dropdown) => {
            dropdown
              .addOption("ask", "Ask before adding")
              .addOption("never", "Never add automatically")
              .setValue(this.plugin.settings.missingBlockBehavior)
              .onChange(async (value) => {
                this.plugin.settings.missingBlockBehavior = value as MissingBlockBehavior;
                await this.plugin.saveSettings();
              });
          });
      });

    new SettingGroup(containerEl)
      .setHeading("Global exclusions")
      .addSetting((setting) => {
        setting
          .setName("Excluded folders")
          .setDesc("Skip notes inside these vault-relative folders. One folder per line.")
          .addTextArea((text) => {
            text.inputEl.rows = 6;
            text
              .setPlaceholder("Archive\nTemplates\nPrivate/Notes")
              .setValue(this.plugin.settings.excludedFolders.join("\n"))
              .onChange(async (value) => {
                this.plugin.settings.excludedFolders = linesFromTextArea(value);
                await this.plugin.saveSettings();
              });
          });
      })
      .addSetting((setting) => {
        setting
          .setName("Excluded note name terms")
          .setDesc("Skip notes whose file name contains these plain-text terms. One term per line.")
          .addTextArea((text) => {
            text.inputEl.rows = 6;
            text
              .setPlaceholder("Draft\nWIP\nArchive\n_template")
              .setValue(this.plugin.settings.excludedFilenameTerms.join("\n"))
              .onChange(async (value) => {
                this.plugin.settings.excludedFilenameTerms = linesFromTextArea(value);
                await this.plugin.saveSettings();
              });
          });
      });

    new SettingGroup(containerEl).setHeading("Maintenance").addSetting((setting) => {
      setting
        .setName("Reset settings")
        .setDesc("Restore Concordance defaults.")
        .addButton((button) => {
          button.setButtonText("Reset").onClick(async () => {
            this.plugin.settings = createDefaultSettings();
            await this.plugin.saveSettings();
            new Notice("Concordance settings reset to defaults.");
            this.display();
          });
        });
    });
  }
}

function linesFromTextArea(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

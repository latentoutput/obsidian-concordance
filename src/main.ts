import { Notice, Plugin } from "obsidian";
import {
  confirmBulkUpdate,
  confirmCurrentUpdate,
  confirmMissingBlock,
  showUpdateCheck,
} from "./modals";
import {
  createAllUpdatePlans,
  createIndexingContext,
  createUpdatePlan,
  getIndexFileInfo,
  validateSettings,
} from "./indexing";
import type { IndexingContext } from "./indexing";
import { ConcordanceSettingTab, DEFAULT_SETTINGS, createDefaultSettings } from "./settings";
import type { ConcordanceSettings } from "./settings";
import type { UpdatePlan } from "./types";

export default class ConcordancePlugin extends Plugin {
  settings: ConcordanceSettings = createDefaultSettings();

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new ConcordanceSettingTab(this.app, this));

    this.addCommand({
      id: "update-current-index",
      name: "Update current index",
      callback: () => {
        void this.updateCurrentIndex();
      },
    });

    this.addCommand({
      id: "update-all-indexes",
      name: "Update all indexes",
      callback: () => {
        void this.updateAllIndexes();
      },
    });

    this.addCommand({
      id: "check-index-updates",
      name: "Check indexes for updates",
      callback: () => {
        void this.checkIndexUpdates();
      },
    });
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<ConcordanceSettings> | null;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...data,
      excludedFolders: data?.excludedFolders ?? DEFAULT_SETTINGS.excludedFolders,
      excludedFilenameTerms: data?.excludedFilenameTerms ?? DEFAULT_SETTINGS.excludedFilenameTerms,
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private context(): IndexingContext {
    return createIndexingContext(this.app);
  }

  private async updateCurrentIndex(): Promise<void> {
    if (!this.validateSettings()) {
      return;
    }

    const activeFile = this.app.workspace.getActiveFile();

    if (!activeFile) {
      new Notice("No active file.");
      return;
    }

    const context = this.context();
    const index = await getIndexFileInfo(context, activeFile, this.settings);
    if (!index) {
      new Notice(
        "Active file does not match the configured index filename pattern or contain a supported Concordance block.",
      );
      return;
    }

    let plan = await createUpdatePlan(context, index, this.settings, false);

    if (plan.status === "malformed-block") {
      new Notice(plan.error ?? "Generated index block is malformed; no changes were made.");
      return;
    }

    if (plan.status === "missing-block") {
      if (this.settings.missingBlockBehavior === "never") {
        new Notice("This index does not contain a generated index block.");
        return;
      }

      const shouldAddBlock = await confirmMissingBlock(this.app, index.file.basename);
      if (!shouldAddBlock) {
        new Notice("Concordance update canceled.");
        return;
      }

      plan = await createUpdatePlan(context, index, this.settings, true);
    }

    if (plan.status === "unchanged") {
      new Notice(`${index.file.basename} is already up to date.`);
      return;
    }

    if (!plan.nextContent) {
      new Notice("Concordance could not generate an update.");
      return;
    }

    const confirmed = await confirmCurrentUpdate(this.app, plan);
    if (!confirmed) {
      new Notice("Concordance update canceled.");
      return;
    }

    const nextContent = plan.nextContent;
    await this.app.vault.process(index.file, () => nextContent);
    new Notice(
      `Updated ${index.file.basename}: +${plan.stats.added.length} / -${plan.stats.removed.length}`,
    );
  }

  private async updateAllIndexes(): Promise<void> {
    const context = this.context();
    const initialPlans = await this.createAllPlansOrNotify(context);
    if (!initialPlans) {
      return;
    }

    const confirmation = await confirmBulkUpdate(this.app, initialPlans, this.settings);

    if (!confirmation.confirmed) {
      new Notice("Concordance bulk update canceled.");
      return;
    }

    const plans = confirmation.addMissingBlocks
      ? await Promise.all(
          initialPlans.map((plan) => {
            if (plan.status === "missing-block") {
              return createUpdatePlan(context, plan.index, this.settings, true);
            }

            return Promise.resolve(plan);
          }),
        )
      : initialPlans;

    const writablePlans = plans.filter(
      (plan): plan is UpdatePlan & { nextContent: string } =>
        plan.status === "changed" && plan.nextContent !== null,
    );

    for (const plan of writablePlans) {
      const nextContent = plan.nextContent;
      await this.app.vault.process(plan.index.file, () => nextContent);
    }

    const skipped = plans.filter(
      (plan) => plan.status === "missing-block" || plan.status === "malformed-block",
    ).length;

    new Notice(`Updated ${writablePlans.length} index(es). Skipped ${skipped}.`);
  }

  private async checkIndexUpdates(): Promise<void> {
    const plans = await this.createAllPlansOrNotify(this.context());
    if (!plans) {
      return;
    }

    await showUpdateCheck(this.app, plans);
  }

  private async createAllPlansOrNotify(context: IndexingContext): Promise<UpdatePlan[] | null> {
    if (!this.validateSettings()) {
      return null;
    }

    const plans = await createAllUpdatePlans(context, this.settings);

    if (plans.length === 0) {
      new Notice("No index files found.");
      return null;
    }

    return plans;
  }

  private validateSettings(): boolean {
    const validationError = validateSettings(this.settings);
    if (validationError) {
      new Notice(validationError);
      return false;
    }

    return true;
  }
}

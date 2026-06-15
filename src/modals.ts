import { Modal, Setting } from "obsidian";
import type { App } from "obsidian";
import type { ConcordanceSettings } from "./settings";
import type { BulkConfirmationResult, UpdatePlan } from "./types";
import {
  appendExpandableStats,
  changedPlanSummaries,
  linkChangeSummaries,
  malformedPlanSummaries,
  planNames,
  sumLinks,
} from "./ui";

export function confirmMissingBlock(app: App, fileName: string): Promise<boolean> {
  return new Promise((resolve) => {
    new MissingBlockModal(app, fileName, resolve).open();
  });
}

export function confirmCurrentUpdate(app: App, plan: UpdatePlan): Promise<boolean> {
  return new Promise((resolve) => {
    new CurrentUpdateModal(app, plan, resolve).open();
  });
}

export function confirmBulkUpdate(
  app: App,
  plans: UpdatePlan[],
  settings: ConcordanceSettings,
): Promise<BulkConfirmationResult> {
  return new Promise((resolve) => {
    new BulkUpdateModal(app, plans, settings, resolve).open();
  });
}

export function showUpdateCheck(app: App, plans: UpdatePlan[]): Promise<void> {
  return new Promise((resolve) => {
    new UpdateCheckModal(app, plans, resolve).open();
  });
}

class MissingBlockModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private readonly fileName: string,
    private readonly resolve: (confirmed: boolean) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Add Concordance block?");
    this.contentEl.empty();
    this.contentEl.createEl("p", {
      text: `${this.fileName} does not contain a generated index block. Add one at the end of the file?`,
    });

    new Setting(this.contentEl)
      .addButton((button) => {
        button.setButtonText("Cancel").onClick(() => this.submit(false));
      })
      .addButton((button) => {
        button
          .setButtonText("Add block")
          .setCta()
          .onClick(() => this.submit(true));
      });
  }

  onClose(): void {
    this.contentEl.empty();

    if (!this.resolved) {
      this.resolve(false);
    }
  }

  private submit(confirmed: boolean): void {
    this.resolved = true;
    this.resolve(confirmed);
    this.close();
  }
}

class CurrentUpdateModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private readonly plan: UpdatePlan,
    private readonly resolve: (confirmed: boolean) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Update index?");
    this.contentEl.empty();
    this.contentEl.createEl("p", { text: this.plan.index.file.basename });
    appendExpandableStats(this.contentEl, [
      {
        label: "Matched notes",
        count: this.plan.childFiles.length,
        items: this.plan.generatedLinks,
      },
      { label: "Links added", count: this.plan.stats.added.length, items: this.plan.stats.added },
      {
        label: "Links removed",
        count: this.plan.stats.removed.length,
        items: this.plan.stats.removed,
      },
      {
        label: "Unchanged links",
        count: this.plan.stats.unchanged.length,
        items: this.plan.stats.unchanged,
      },
    ]);

    new Setting(this.contentEl)
      .addButton((button) => {
        button.setButtonText("Cancel").onClick(() => this.submit(false));
      })
      .addButton((button) => {
        button
          .setButtonText("Update")
          .setCta()
          .onClick(() => this.submit(true));
      });
  }

  onClose(): void {
    this.contentEl.empty();

    if (!this.resolved) {
      this.resolve(false);
    }
  }

  private submit(confirmed: boolean): void {
    this.resolved = true;
    this.resolve(confirmed);
    this.close();
  }
}

class BulkUpdateModal extends Modal {
  private addMissingBlocks = false;
  private resolved = false;

  constructor(
    app: App,
    private readonly plans: UpdatePlan[],
    private readonly settings: ConcordanceSettings,
    private readonly resolve: (result: BulkConfirmationResult) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const changedPlans = this.plans.filter((plan) => plan.status === "changed");
    const missingPlans = this.plans.filter((plan) => plan.status === "missing-block");
    const malformedPlans = this.plans.filter((plan) => plan.status === "malformed-block");

    this.titleEl.setText("Update all indexes?");
    this.contentEl.empty();
    appendExpandableStats(this.contentEl, [
      { label: "Indexes found", count: this.plans.length, items: planNames(this.plans) },
      {
        label: "Indexes with changes",
        count: changedPlans.length,
        items: changedPlanSummaries(changedPlans),
      },
      {
        label: "Total links added",
        count: sumLinks(changedPlans, "added"),
        items: linkChangeSummaries(changedPlans, "added"),
      },
      {
        label: "Total links removed",
        count: sumLinks(changedPlans, "removed"),
        items: linkChangeSummaries(changedPlans, "removed"),
      },
      {
        label: "Missing auto-index blocks",
        count: missingPlans.length,
        items: planNames(missingPlans),
      },
      {
        label: "Malformed auto-index blocks",
        count: malformedPlans.length,
        items: malformedPlanSummaries(malformedPlans),
      },
    ]);

    if (missingPlans.length > 0) {
      if (this.settings.missingBlockBehavior === "ask") {
        new Setting(this.contentEl)
          .setName("Add marker blocks to missing indexes")
          .setDesc(
            "Default is off. If enabled, blocks are added at the end of missing index files.",
          )
          .addToggle((toggle) => {
            toggle.setValue(false).onChange((value) => {
              this.addMissingBlocks = value;
            });
          });
      } else {
        this.contentEl.createEl("p", {
          text: "Missing-block insertion is disabled in settings, so these files will be skipped.",
        });
      }
    }

    new Setting(this.contentEl)
      .addButton((button) => {
        button.setButtonText("Cancel").onClick(() => this.submit(false));
      })
      .addButton((button) => {
        button
          .setButtonText("Update all")
          .setCta()
          .onClick(() => this.submit(true));
      });
  }

  onClose(): void {
    this.contentEl.empty();

    if (!this.resolved) {
      this.resolve({ confirmed: false, addMissingBlocks: false });
    }
  }

  private submit(confirmed: boolean): void {
    this.resolved = true;
    this.resolve({ confirmed, addMissingBlocks: this.addMissingBlocks });
    this.close();
  }
}

class UpdateCheckModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private readonly plans: UpdatePlan[],
    private readonly resolve: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const changedPlans = this.plans.filter((plan) => plan.status === "changed");
    const missingPlans = this.plans.filter((plan) => plan.status === "missing-block");
    const malformedPlans = this.plans.filter((plan) => plan.status === "malformed-block");
    const unchangedPlans = this.plans.filter((plan) => plan.status === "unchanged");

    this.titleEl.setText("Check indexes for updates");
    this.contentEl.empty();
    appendExpandableStats(this.contentEl, [
      { label: "Indexes found", count: this.plans.length, items: planNames(this.plans) },
      {
        label: "Indexes needing updates",
        count: changedPlans.length,
        items: changedPlanSummaries(changedPlans),
      },
      {
        label: "Total links to add",
        count: sumLinks(changedPlans, "added"),
        items: linkChangeSummaries(changedPlans, "added"),
      },
      {
        label: "Total links to remove",
        count: sumLinks(changedPlans, "removed"),
        items: linkChangeSummaries(changedPlans, "removed"),
      },
      { label: "Up to date", count: unchangedPlans.length, items: planNames(unchangedPlans) },
      {
        label: "Missing auto-index blocks",
        count: missingPlans.length,
        items: planNames(missingPlans),
      },
      {
        label: "Malformed auto-index blocks",
        count: malformedPlans.length,
        items: malformedPlanSummaries(malformedPlans),
      },
    ]);

    new Setting(this.contentEl).addButton((button) => {
      button
        .setButtonText("Close")
        .setCta()
        .onClick(() => this.submit());
    });
  }

  onClose(): void {
    this.contentEl.empty();

    if (!this.resolved) {
      this.resolve();
    }
  }

  private submit(): void {
    this.resolved = true;
    this.resolve();
    this.close();
  }
}

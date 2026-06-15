import { setIcon } from "obsidian";
import type { LinkStats, UpdatePlan } from "./types";

export function appendSummaryList(container: HTMLElement, items: string[]): void {
  const list = container.createEl("ul");

  for (const item of items) {
    list.createEl("li", { text: item });
  }
}

export function appendExpandableStats(
  container: HTMLElement,
  stats: Array<{ label: string; count: number; items: string[] }>,
): void {
  const list = container.createDiv({ cls: "concordance-stats" });

  for (const stat of stats) {
    const item = list.createDiv({ cls: "concordance-stat" });

    if (stat.count === 0) {
      item.createSpan({ cls: "concordance-stat-icon concordance-stat-icon-placeholder" });
      item.createSpan({ text: `${stat.label}: 0` });
      continue;
    }

    const details = item.createEl("details", { cls: "concordance-stat-details" });
    const summary = details.createEl("summary");
    const icon = summary.createSpan({ cls: "concordance-stat-icon" });
    summary.createSpan({ text: `${stat.label}: ${stat.count}` });
    setIcon(icon, "chevron-right");
    details.addEventListener("toggle", () => {
      setIcon(icon, details.open ? "chevron-down" : "chevron-right");
    });
    appendSummaryList(details, stat.items);
  }
}

export function planNames(plans: UpdatePlan[]): string[] {
  return plans.map((plan) => plan.index.file.basename);
}

export function changedPlanSummaries(plans: UpdatePlan[]): string[] {
  return plans.map(
    (plan) =>
      `${plan.index.file.basename}: +${plan.stats.added.length} / -${plan.stats.removed.length}`,
  );
}

export function linkChangeSummaries(plans: UpdatePlan[], key: keyof LinkStats): string[] {
  return plans.flatMap((plan) =>
    plan.stats[key].map((link) => `${plan.index.file.basename}: ${link}`),
  );
}

export function malformedPlanSummaries(plans: UpdatePlan[]): string[] {
  return plans.map((plan) =>
    plan.error ? `${plan.index.file.basename}: ${plan.error}` : plan.index.file.basename,
  );
}

export function sumLinks(plans: UpdatePlan[], key: keyof LinkStats): number {
  return plans.reduce((sum, plan) => sum + plan.stats[key].length, 0);
}

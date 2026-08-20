import { beforeEach, describe, expect, it } from "vitest";
import type { TFile } from "obsidian";
import {
  createdModals,
  createdSettings,
  resetCreatedModals,
  resetCreatedSettings,
} from "../test/obsidian-stub";
import {
  confirmBulkUpdate,
  confirmCurrentUpdate,
  confirmMissingBlock,
  showUpdateCheck,
} from "./modals";
import { createDefaultSettings } from "./settings";
import type { LinkStats, UpdatePlan } from "./types";

const app = {} as never;

function plan(
  basename: string,
  status: UpdatePlan["status"] = "changed",
  stats: Partial<LinkStats> = {},
  error: string | null = null,
): UpdatePlan {
  return {
    index: {
      file: { basename, path: `${basename}.md` } as TFile,
      prefix: basename,
      displayName: basename,
    },
    status,
    childFiles: [],
    generatedLinks: [],
    stats: { added: [], removed: [], unchanged: [], ...stats },
    nextContent: status === "changed" ? "next" : null,
    error,
  };
}

/** The modal opens synchronously, so its Setting rows already exist. */
function lastSetting() {
  return createdSettings[createdSettings.length - 1];
}

function lastModal() {
  return createdModals[createdModals.length - 1];
}

beforeEach(() => {
  resetCreatedModals();
  resetCreatedSettings();
});

describe("missing block confirmation", () => {
  it("names the file it is asking about", () => {
    void confirmMissingBlock(app, "Art Index");

    expect(lastModal().titleEl.text).toBe("Add Concordance block?");
    expect(lastModal().contentEl.textOf("p")[0]).toContain("Art Index");
  });

  it("resolves true when the block is added", async () => {
    const answer = confirmMissingBlock(app, "Art");
    lastSetting().button("Add block")?.click();

    await expect(answer).resolves.toBe(true);
  });

  it("resolves false when cancelled", async () => {
    const answer = confirmMissingBlock(app, "Art");
    lastSetting().button("Cancel")?.click();

    await expect(answer).resolves.toBe(false);
  });

  it("resolves false when dismissed without choosing", async () => {
    const answer = confirmMissingBlock(app, "Art");
    lastModal().close();

    await expect(answer).resolves.toBe(false);
  });

  it("offers the confirming button as the call to action", () => {
    void confirmMissingBlock(app, "Art");

    expect(lastSetting().button("Add block")?.isCta).toBe(true);
    expect(lastSetting().button("Cancel")?.isCta).toBe(false);
  });
});

describe("current update confirmation", () => {
  it("shows the index name and its link counts", () => {
    void confirmCurrentUpdate(
      app,
      plan("Art", "changed", { added: ["A", "B"], removed: ["C"], unchanged: ["D"] }),
    );

    const content = lastModal().contentEl;
    expect(lastModal().titleEl.text).toBe("Update index?");
    expect(content.textOf("p")).toContain("Art");
    const labels = content.textOf("span").join(" ");
    expect(labels).toContain("Links added: 2");
    expect(labels).toContain("Links removed: 1");
    expect(labels).toContain("Unchanged links: 1");
  });

  it("resolves true on update and false on cancel", async () => {
    const yes = confirmCurrentUpdate(app, plan("Art"));
    lastSetting().button("Update")?.click();
    await expect(yes).resolves.toBe(true);

    const no = confirmCurrentUpdate(app, plan("Art"));
    lastSetting().button("Cancel")?.click();
    await expect(no).resolves.toBe(false);
  });

  it("resolves false when dismissed", async () => {
    const answer = confirmCurrentUpdate(app, plan("Art"));
    lastModal().close();

    await expect(answer).resolves.toBe(false);
  });
});

describe("bulk update confirmation", () => {
  const settings = createDefaultSettings();

  it("breaks the plans down by status", () => {
    void confirmBulkUpdate(
      app,
      [
        plan("Changed", "changed", { added: ["A"] }),
        plan("Missing", "missing-block"),
        plan("Malformed", "malformed-block", {}, "end before start"),
      ],
      settings,
    );

    const labels = lastModal().contentEl.textOf("span").join(" ");
    expect(labels).toContain("Indexes found: 3");
    expect(labels).toContain("Indexes with changes: 1");
    expect(labels).toContain("Total links added: 1");
    expect(labels).toContain("Missing auto-index blocks: 1");
    expect(labels).toContain("Malformed auto-index blocks: 1");
  });

  it("offers the missing-block toggle only when there are missing blocks", () => {
    void confirmBulkUpdate(app, [plan("Changed")], settings);
    expect(createdSettings.some((setting) => setting.toggles.length > 0)).toBe(false);

    resetCreatedSettings();
    void confirmBulkUpdate(app, [plan("Missing", "missing-block")], settings);
    expect(createdSettings.some((setting) => setting.toggles.length > 0)).toBe(true);
  });

  it("explains instead of offering the toggle when insertion is disabled", () => {
    void confirmBulkUpdate(app, [plan("Missing", "missing-block")], {
      ...settings,
      missingBlockBehavior: "never",
    });

    expect(createdSettings.some((setting) => setting.toggles.length > 0)).toBe(false);
    expect(lastModal().contentEl.textOf("p").join(" ")).toContain("disabled in settings");
  });

  it("reports the toggle state alongside the confirmation", async () => {
    const answer = confirmBulkUpdate(app, [plan("Missing", "missing-block")], settings);
    const toggle = createdSettings.find((setting) => setting.toggles.length > 0)?.toggles[0];
    toggle?.set(true);
    lastSetting().button("Update all")?.click();

    await expect(answer).resolves.toEqual({ confirmed: true, addMissingBlocks: true });
  });

  it("defaults the toggle off and reports a cancellation", async () => {
    const answer = confirmBulkUpdate(app, [plan("Missing", "missing-block")], settings);
    lastSetting().button("Cancel")?.click();

    await expect(answer).resolves.toEqual({ confirmed: false, addMissingBlocks: false });
  });

  it("reports a dismissal as a cancellation", async () => {
    const answer = confirmBulkUpdate(app, [plan("Changed")], settings);
    lastModal().close();

    await expect(answer).resolves.toEqual({ confirmed: false, addMissingBlocks: false });
  });
});

describe("update check", () => {
  it("separates what needs updating from what is up to date", () => {
    void showUpdateCheck(app, [
      plan("Changed", "changed", { added: ["A"], removed: ["B"] }),
      plan("Fine", "unchanged"),
      plan("Missing", "missing-block"),
    ]);

    const labels = lastModal().contentEl.textOf("span").join(" ");
    expect(lastModal().titleEl.text).toBe("Check indexes for updates");
    expect(labels).toContain("Indexes found: 3");
    expect(labels).toContain("Indexes needing updates: 1");
    expect(labels).toContain("Total links to add: 1");
    expect(labels).toContain("Total links to remove: 1");
    expect(labels).toContain("Up to date: 1");
  });

  it("resolves when closed by the button or by dismissal", async () => {
    const byButton = showUpdateCheck(app, [plan("Art")]);
    lastSetting().button("Close")?.click();
    await expect(byButton).resolves.toBeUndefined();

    const byDismissal = showUpdateCheck(app, [plan("Art")]);
    lastModal().close();
    await expect(byDismissal).resolves.toBeUndefined();
  });
});

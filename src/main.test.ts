import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TFile } from "obsidian";
import { noticeMessages, resetNoticeMessages } from "../test/obsidian-stub";
import type { LinkStats, UpdatePlan } from "./types";
import { DEFAULT_SETTINGS } from "./settings";

// indexing and modals are covered by their own suites. Mocking them here keeps
// this file about orchestration: which branch runs, what the user is told, and
// whether anything is written.
const indexing = vi.hoisted(() => ({
  createIndexingContext: vi.fn(() => ({ vault: {}, metadataCache: {} })),
  validateSettings: vi.fn<(settings: unknown) => string | null>(() => null),
  getIndexFileInfo: vi.fn(),
  createUpdatePlan: vi.fn(),
  createAllUpdatePlans: vi.fn(),
}));

const modals = vi.hoisted(() => ({
  confirmMissingBlock: vi.fn(),
  confirmCurrentUpdate: vi.fn(),
  confirmBulkUpdate: vi.fn(),
  showUpdateCheck: vi.fn(),
}));

vi.mock("./indexing", () => indexing);
vi.mock("./modals", () => modals);

const { default: ConcordancePlugin } = await import("./main");

const file = (basename: string) => ({ basename, path: `${basename}.md` }) as TFile;

function plan(
  basename: string,
  status: UpdatePlan["status"],
  overrides: Partial<UpdatePlan> = {},
  stats: Partial<LinkStats> = {},
): UpdatePlan {
  return {
    index: { file: file(basename), prefix: basename, displayName: basename },
    status,
    childFiles: [],
    generatedLinks: [],
    stats: { added: [], removed: [], unchanged: [], ...stats },
    nextContent: status === "changed" ? "next content" : null,
    error: null,
    ...overrides,
  };
}

const processed: { path: string; content: string }[] = [];

function createPlugin(activeFile: TFile | null = file("Art - Index - Art")) {
  const app = {
    workspace: { getActiveFile: () => activeFile },
    vault: {
      process: (target: TFile, fn: (data: string) => string) => {
        processed.push({ path: target.path, content: fn("") });
        return Promise.resolve("");
      },
    },
    metadataCache: {},
  };
  return new ConcordancePlugin(app as never, {} as never);
}

/** Commands fire and forget, so let the async chain settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function run(plugin: InstanceType<typeof ConcordancePlugin>, id: string) {
  const command = (plugin as unknown as { commands: { id: string; callback?: () => void }[] })
    .commands;
  command.find((entry) => entry.id === id)?.callback?.();
  await flush();
}

beforeEach(() => {
  resetNoticeMessages();
  processed.length = 0;
  vi.clearAllMocks();
  indexing.createIndexingContext.mockReturnValue({ vault: {}, metadataCache: {} });
  indexing.validateSettings.mockReturnValue(null);
});

describe("plugin lifecycle", () => {
  it("registers the three commands and the settings tab", async () => {
    const plugin = createPlugin();
    await plugin.onload();

    const registered = plugin as unknown as {
      commands: { id: string; name: string }[];
      settingTabs: unknown[];
    };
    expect(registered.commands.map((entry) => entry.id)).toEqual([
      "update-current-index",
      "update-all-indexes",
      "check-index-updates",
    ]);
    expect(registered.commands.map((entry) => entry.name)).toEqual([
      "Update current index",
      "Update all indexes",
      "Check indexes for updates",
    ]);
    expect(registered.settingTabs).toHaveLength(1);
  });

  it("falls back to defaults when there is no saved data", async () => {
    const plugin = createPlugin();
    await plugin.loadSettings();

    expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("merges saved data over the defaults", async () => {
    const plugin = createPlugin();
    (plugin as unknown as { savedData: unknown }).savedData = {
      autoIndexHeading: "Contents",
      excludedFolders: ["Archive"],
    };

    await plugin.loadSettings();

    expect(plugin.settings.autoIndexHeading).toBe("Contents");
    expect(plugin.settings.excludedFolders).toEqual(["Archive"]);
    expect(plugin.settings.startMarker).toBe(DEFAULT_SETTINGS.startMarker);
  });

  it("restores list settings that were saved as null", async () => {
    const plugin = createPlugin();
    (plugin as unknown as { savedData: unknown }).savedData = {
      excludedFolders: null,
      excludedFilenameTerms: null,
    };

    await plugin.loadSettings();

    expect(plugin.settings.excludedFolders).toEqual([]);
    expect(plugin.settings.excludedFilenameTerms).toEqual([]);
  });

  it("round-trips settings through save and load", async () => {
    const plugin = createPlugin();
    plugin.settings = { ...DEFAULT_SETTINGS, autoIndexHeading: "Saved" };

    await plugin.saveSettings();
    plugin.settings = { ...DEFAULT_SETTINGS };
    await plugin.loadSettings();

    expect(plugin.settings.autoIndexHeading).toBe("Saved");
  });
});

describe("update current index", () => {
  async function runCurrent(plugin: InstanceType<typeof ConcordancePlugin>) {
    await plugin.onload();
    await run(plugin, "update-current-index");
  }

  it("refuses to run with invalid settings", async () => {
    indexing.validateSettings.mockReturnValue("Markers must differ.");
    await runCurrent(createPlugin());

    expect(noticeMessages).toEqual(["Markers must differ."]);
    expect(indexing.getIndexFileInfo).not.toHaveBeenCalled();
  });

  it("says so when there is no active file", async () => {
    await runCurrent(createPlugin(null));

    expect(noticeMessages).toEqual(["No active file."]);
  });

  it("says so when the active file is not an index", async () => {
    indexing.getIndexFileInfo.mockResolvedValue(null);
    await runCurrent(createPlugin());

    expect(noticeMessages[0]).toContain("does not match the configured index filename pattern");
  });

  it("reports a malformed block and writes nothing", async () => {
    indexing.getIndexFileInfo.mockResolvedValue(plan("Art", "changed").index);
    indexing.createUpdatePlan.mockResolvedValue(
      plan("Art", "malformed-block", { error: "end marker before start marker" }),
    );
    await runCurrent(createPlugin());

    expect(noticeMessages).toEqual(["end marker before start marker"]);
    expect(processed).toHaveLength(0);
  });

  it("falls back to a generic message when a malformed plan has no error", async () => {
    indexing.getIndexFileInfo.mockResolvedValue(plan("Art", "changed").index);
    indexing.createUpdatePlan.mockResolvedValue(plan("Art", "malformed-block"));
    await runCurrent(createPlugin());

    expect(noticeMessages[0]).toContain("malformed");
  });

  it("skips a missing block when insertion is disabled", async () => {
    indexing.getIndexFileInfo.mockResolvedValue(plan("Art", "changed").index);
    indexing.createUpdatePlan.mockResolvedValue(plan("Art", "missing-block"));

    const plugin = createPlugin();
    await plugin.onload();
    plugin.settings.missingBlockBehavior = "never";
    await run(plugin, "update-current-index");

    expect(noticeMessages).toEqual(["This index does not contain a generated index block."]);
    expect(modals.confirmMissingBlock).not.toHaveBeenCalled();
  });

  it("cancels when the user declines to add a missing block", async () => {
    indexing.getIndexFileInfo.mockResolvedValue(plan("Art", "changed").index);
    indexing.createUpdatePlan.mockResolvedValue(plan("Art", "missing-block"));
    modals.confirmMissingBlock.mockResolvedValue(false);
    await runCurrent(createPlugin());

    expect(noticeMessages).toEqual(["Concordance update canceled."]);
    expect(processed).toHaveLength(0);
  });

  it("re-plans with insertion once the user agrees", async () => {
    indexing.getIndexFileInfo.mockResolvedValue(plan("Art", "changed").index);
    indexing.createUpdatePlan
      .mockResolvedValueOnce(plan("Art", "missing-block"))
      .mockResolvedValueOnce(plan("Art", "changed", {}, { added: ["A"] }));
    modals.confirmMissingBlock.mockResolvedValue(true);
    modals.confirmCurrentUpdate.mockResolvedValue(true);
    await runCurrent(createPlugin());

    expect(indexing.createUpdatePlan).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      true,
    );
    expect(processed).toHaveLength(1);
  });

  it("says nothing needs doing when the index is current", async () => {
    indexing.getIndexFileInfo.mockResolvedValue(plan("Art", "changed").index);
    indexing.createUpdatePlan.mockResolvedValue(plan("Art", "unchanged"));
    await runCurrent(createPlugin());

    expect(noticeMessages).toEqual(["Art is already up to date."]);
  });

  it("bails when a changed plan somehow has no content", async () => {
    indexing.getIndexFileInfo.mockResolvedValue(plan("Art", "changed").index);
    indexing.createUpdatePlan.mockResolvedValue(plan("Art", "changed", { nextContent: null }));
    await runCurrent(createPlugin());

    expect(noticeMessages).toEqual(["Concordance could not generate an update."]);
  });

  it("cancels without writing when the confirmation is declined", async () => {
    indexing.getIndexFileInfo.mockResolvedValue(plan("Art", "changed").index);
    indexing.createUpdatePlan.mockResolvedValue(plan("Art", "changed"));
    modals.confirmCurrentUpdate.mockResolvedValue(false);
    await runCurrent(createPlugin());

    expect(noticeMessages).toEqual(["Concordance update canceled."]);
    expect(processed).toHaveLength(0);
  });

  it("writes the new content and reports the counts", async () => {
    indexing.getIndexFileInfo.mockResolvedValue(plan("Art", "changed").index);
    indexing.createUpdatePlan.mockResolvedValue(
      plan("Art", "changed", {}, { added: ["A", "B"], removed: ["C"] }),
    );
    modals.confirmCurrentUpdate.mockResolvedValue(true);
    await runCurrent(createPlugin());

    expect(processed).toEqual([{ path: "Art.md", content: "next content" }]);
    expect(noticeMessages).toEqual(["Updated Art: +2 / -1"]);
  });
});

describe("update all indexes", () => {
  async function runAll(plugin: InstanceType<typeof ConcordancePlugin>) {
    await plugin.onload();
    await run(plugin, "update-all-indexes");
  }

  it("stops when settings are invalid", async () => {
    indexing.validateSettings.mockReturnValue("Bad markers.");
    await runAll(createPlugin());

    expect(noticeMessages).toEqual(["Bad markers."]);
    expect(indexing.createAllUpdatePlans).not.toHaveBeenCalled();
  });

  it("stops when the vault has no indexes", async () => {
    indexing.createAllUpdatePlans.mockResolvedValue([]);
    await runAll(createPlugin());

    expect(noticeMessages).toEqual(["No index files found."]);
  });

  it("cancels without writing", async () => {
    indexing.createAllUpdatePlans.mockResolvedValue([plan("Art", "changed")]);
    modals.confirmBulkUpdate.mockResolvedValue({ confirmed: false, addMissingBlocks: false });
    await runAll(createPlugin());

    expect(noticeMessages).toEqual(["Concordance bulk update canceled."]);
    expect(processed).toHaveLength(0);
  });

  it("writes every changed plan and counts what it skipped", async () => {
    indexing.createAllUpdatePlans.mockResolvedValue([
      plan("Art", "changed"),
      plan("Science", "changed"),
      plan("Missing", "missing-block"),
      plan("Malformed", "malformed-block"),
      plan("Fine", "unchanged"),
    ]);
    modals.confirmBulkUpdate.mockResolvedValue({ confirmed: true, addMissingBlocks: false });
    await runAll(createPlugin());

    expect(processed.map((entry) => entry.path)).toEqual(["Art.md", "Science.md"]);
    expect(noticeMessages).toEqual(["Updated 2 index(es). Skipped 2."]);
  });

  it("re-plans only the missing ones when asked to add blocks", async () => {
    indexing.createAllUpdatePlans.mockResolvedValue([
      plan("Art", "changed"),
      plan("Missing", "missing-block"),
    ]);
    indexing.createUpdatePlan.mockResolvedValue(plan("Missing", "changed"));
    modals.confirmBulkUpdate.mockResolvedValue({ confirmed: true, addMissingBlocks: true });
    await runAll(createPlugin());

    expect(indexing.createUpdatePlan).toHaveBeenCalledTimes(1);
    expect(processed.map((entry) => entry.path)).toEqual(["Art.md", "Missing.md"]);
    expect(noticeMessages).toEqual(["Updated 2 index(es). Skipped 0."]);
  });
});

describe("check indexes for updates", () => {
  it("hands the plans to the report modal", async () => {
    const plans = [plan("Art", "changed"), plan("Fine", "unchanged")];
    indexing.createAllUpdatePlans.mockResolvedValue(plans);

    const plugin = createPlugin();
    await plugin.onload();
    await run(plugin, "check-index-updates");

    expect(modals.showUpdateCheck).toHaveBeenCalledWith(expect.anything(), plans);
  });

  it("shows nothing when there is nothing to report", async () => {
    indexing.createAllUpdatePlans.mockResolvedValue([]);

    const plugin = createPlugin();
    await plugin.onload();
    await run(plugin, "check-index-updates");

    expect(modals.showUpdateCheck).not.toHaveBeenCalled();
    expect(noticeMessages).toEqual(["No index files found."]);
  });
});

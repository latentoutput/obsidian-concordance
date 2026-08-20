import { beforeEach, describe, expect, it } from "vitest";
import type { TFile } from "obsidian";
import { resetSetIconCalls, setIconCalls } from "../test/obsidian-stub";
import { FakeElement, asContainer } from "../test/fake-element";
import {
  appendExpandableStats,
  appendSummaryList,
  changedPlanSummaries,
  linkChangeSummaries,
  malformedPlanSummaries,
  planNames,
  sumLinks,
} from "./ui";
import type { LinkStats, UpdatePlan } from "./types";

function plan(
  basename: string,
  stats: Partial<LinkStats> = {},
  error: string | null = null,
): UpdatePlan {
  return {
    index: {
      file: { basename, path: `${basename}.md` } as TFile,
      prefix: basename,
      displayName: basename,
    },
    status: "changed",
    childFiles: [],
    generatedLinks: [],
    stats: { added: [], removed: [], unchanged: [], ...stats },
    nextContent: null,
    error,
  };
}

describe("plan summaries", () => {
  it("names plans by their index basename", () => {
    expect(planNames([plan("ART - Index - Art"), plan("SCI - Index - Science")])).toEqual([
      "ART - Index - Art",
      "SCI - Index - Science",
    ]);
  });

  it("summarises a changed plan as an add and remove count", () => {
    const summaries = changedPlanSummaries([
      plan("Art", { added: ["A", "B"], removed: ["C"] }),
      plan("Science", {}),
    ]);

    expect(summaries).toEqual(["Art: +2 / -1", "Science: +0 / -0"]);
  });

  it("flattens per-link changes across plans", () => {
    const plans = [
      plan("Art", { added: ["Anatomy", "Gouache"] }),
      plan("Science", { added: ["Optics"] }),
    ];

    expect(linkChangeSummaries(plans, "added")).toEqual([
      "Art: Anatomy",
      "Art: Gouache",
      "Science: Optics",
    ]);
  });

  it("omits plans with no links for the requested key", () => {
    const plans = [plan("Art", { added: ["Anatomy"] }), plan("Science", { removed: ["Optics"] })];

    expect(linkChangeSummaries(plans, "removed")).toEqual(["Science: Optics"]);
  });

  it("appends the error to a malformed plan, and nothing when there is none", () => {
    const summaries = malformedPlanSummaries([
      plan("Art", {}, "end marker before start marker"),
      plan("Science"),
    ]);

    expect(summaries).toEqual(["Art: end marker before start marker", "Science"]);
  });

  it("totals links across plans", () => {
    const plans = [
      plan("Art", { added: ["A", "B"], removed: ["C"] }),
      plan("Science", { added: ["D"] }),
    ];

    expect(sumLinks(plans, "added")).toBe(3);
    expect(sumLinks(plans, "removed")).toBe(1);
    expect(sumLinks(plans, "unchanged")).toBe(0);
  });
});

function lastIcon(): string | undefined {
  return setIconCalls[setIconCalls.length - 1]?.icon;
}

beforeEach(() => {
  resetSetIconCalls();
});

describe("rendering summary lists", () => {
  it("builds one list item per entry", () => {
    const container = new FakeElement("div");

    appendSummaryList(asContainer(container), ["Anatomy", "Gouache"]);

    const list = container.children[0];
    expect(list.tag).toBe("ul");
    expect(list.textOf("li")).toEqual(["Anatomy", "Gouache"]);
  });

  it("still creates the list when there is nothing to put in it", () => {
    const container = new FakeElement("div");

    appendSummaryList(asContainer(container), []);

    expect(container.children[0].tag).toBe("ul");
    expect(container.children[0].children).toHaveLength(0);
  });
});

describe("rendering expandable stats", () => {
  it("renders a zero count as a flat row with no disclosure", () => {
    const container = new FakeElement("div");

    appendExpandableStats(asContainer(container), [{ label: "Added", count: 0, items: [] }]);

    const row = container.children[0].children[0];
    expect(row.descendants().some((node) => node.tag === "details")).toBe(false);
    expect(row.textOf("span")).toContain("Added: 0");
    expect(
      row.descendants().some((node) => node.cls?.includes("concordance-stat-icon-placeholder")),
    ).toBe(true);
  });

  it("renders a non-zero count as a disclosure holding its items", () => {
    const container = new FakeElement("div");

    appendExpandableStats(asContainer(container), [
      { label: "Added", count: 2, items: ["Anatomy", "Gouache"] },
    ]);

    const details = container.children[0].children[0].children[0];
    expect(details.tag).toBe("details");
    expect(details.children[0].tag).toBe("summary");
    expect(details.textOf("span")).toContain("Added: 2");
    expect(details.textOf("li")).toEqual(["Anatomy", "Gouache"]);
  });

  it("points the chevron down while open and back again when closed", () => {
    const container = new FakeElement("div");

    appendExpandableStats(asContainer(container), [
      { label: "Added", count: 1, items: ["Anatomy"] },
    ]);

    const details = container.children[0].children[0].children[0];
    expect(setIconCalls.map((call) => call.icon)).toEqual(["chevron-right"]);

    details.open = true;
    details.dispatch("toggle");
    expect(lastIcon()).toBe("chevron-down");

    details.open = false;
    details.dispatch("toggle");
    expect(lastIcon()).toBe("chevron-right");
  });

  it("renders each stat in the order given", () => {
    const container = new FakeElement("div");

    appendExpandableStats(asContainer(container), [
      { label: "Added", count: 1, items: ["A"] },
      { label: "Removed", count: 0, items: [] },
    ]);

    expect(container.children[0].children).toHaveLength(2);
  });
});

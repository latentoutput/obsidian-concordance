import { describe, expect, it } from "vitest";
import {
  buildGeneratedBlock,
  collectPreservedLinkParts,
  countOccurrences,
  extractWikilinkEntries,
  extractWikilinkTargets,
  getLinkStats,
  inspectGeneratedBlock,
  replaceGeneratedBlock,
} from "./block";
import type { ConcordanceSettings } from "./settings";

const settings: ConcordanceSettings = {
  indexFilenameTemplate: "{PREFIX} - Index - {DISPLAY_NAME}",
  childFilenamePrefixTemplate: "{PREFIX} - ",
  startMarker: "%% concordance:start %%",
  endMarker: "%% concordance:end %%",
  autoIndexHeading: "Index",
  missingBlockBehavior: "ask",
  excludedFolders: [],
  excludedFilenameTerms: [],
};

describe("generated block handling", () => {
  it("replaces only content inside the managed block", () => {
    const content = [
      "User intro.",
      "",
      "%% concordance:start %%",
      "- [[Old Note]]",
      "%% concordance:end %%",
      "",
      "User outro.",
    ].join("\n");

    const generatedBlock = buildGeneratedBlock(["New Note"], settings);
    const result = replaceGeneratedBlock(content, generatedBlock, false, settings);

    expect(result.status).toBe("found");
    if (result.status !== "found") {
      return;
    }
    expect(result.nextContent).toBe(
      [
        "User intro.",
        "",
        "%% concordance:start %%",
        "- [[New Note]]",
        "%% concordance:end %%",
        "",
        "User outro.",
      ].join("\n"),
    );
  });

  it("parses folder mode from marker attributes", () => {
    const content = [
      '%% concordance:start mode="folder" folder="Recipes" includeSubfolders="true" %%',
      "%% concordance:end %%",
    ].join("\n");

    const result = inspectGeneratedBlock(content, settings);

    expect(result.status).toBe("found");
    if (result.status !== "found") {
      return;
    }
    expect(result.config).toEqual({
      mode: "folder",
      folder: "Recipes",
      includeSubfolders: true,
      linkStyle: "auto",
      property: null,
      sort: "path",
      startMarker:
        '%% concordance:start mode="folder" folder="Recipes" includeSubfolders="true" %%',
      tag: null,
      value: null,
    });
  });

  it("parses link style and sort overrides", () => {
    const content = [
      '%% concordance:start mode="tag" tag="#recipe" linkStyle="path" sort="name" %%',
      "%% concordance:end %%",
    ].join("\n");

    const result = inspectGeneratedBlock(content, settings);

    expect(result.status).toBe("found");
    if (result.status !== "found") {
      return;
    }
    expect(result.config.linkStyle).toBe("path");
    expect(result.config.sort).toBe("name");
  });

  it("refuses duplicated markers", () => {
    const content = [
      "%% concordance:start %%",
      "%% concordance:start %%",
      "%% concordance:end %%",
    ].join("\n");

    expect(inspectGeneratedBlock(content, settings).status).toBe("malformed-block");
  });
});

describe("preserving hand-edited link parts", () => {
  it("keeps an alias when the target is still generated", () => {
    const existing = [
      "%% concordance:start %%",
      "- [[Recipes/Chili|My Chili]]",
      "%% concordance:end %%",
    ].join("\n");
    const preserved = collectPreservedLinkParts(existing);
    const block = buildGeneratedBlock(["Recipes/Chili"], settings, settings.startMarker, preserved);

    expect(block).toContain("- [[Recipes/Chili|My Chili]]");
  });

  it("keeps a subpath alongside an alias", () => {
    const existing = "- [[Recipes/Chili#Method|How to]]";
    const block = buildGeneratedBlock(
      ["Recipes/Chili"],
      settings,
      settings.startMarker,
      collectPreservedLinkParts(existing),
    );

    expect(block).toContain("- [[Recipes/Chili#Method|How to]]");
  });

  it("leaves untouched targets bare", () => {
    const block = buildGeneratedBlock(["Recipes/Chili"], settings, settings.startMarker, new Map());

    expect(block).toContain("- [[Recipes/Chili]]");
  });

  it("drops a preserved alias once its target leaves the index", () => {
    const preserved = collectPreservedLinkParts("- [[Recipes/Chili|My Chili]]");
    const block = buildGeneratedBlock(["Recipes/Ziti"], settings, settings.startMarker, preserved);

    expect(block).toContain("- [[Recipes/Ziti]]");
    expect(block).not.toContain("My Chili");
  });

  it("still reports targets without alias text", () => {
    expect(extractWikilinkTargets("- [[Recipes/Chili#Method|My Chili]]")).toEqual([
      "Recipes/Chili",
    ]);
  });
});

describe("custom start markers", () => {
  const custom: ConcordanceSettings = { ...settings, startMarker: "%% index:start %%" };

  it("parses attributes on a custom marker", () => {
    const content = [
      '%% index:start mode="folder" folder="Projects" linkStyle="path" %%',
      "%% concordance:end %%",
    ].join("\n");
    const result = inspectGeneratedBlock(content, custom);

    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.config.mode).toBe("folder");
    expect(result.config.folder).toBe("Projects");
    expect(result.config.linkStyle).toBe("path");
  });

  it("still handles a custom marker with no attributes", () => {
    const content = ["%% index:start %%", "%% concordance:end %%"].join("\n");
    const result = inspectGeneratedBlock(content, custom);

    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.config.mode).toBe("prefix");
  });

  it("falls back to a literal match for markers that do not close with %%", () => {
    const odd: ConcordanceSettings = { ...settings, startMarker: "<!-- index:start -->" };
    const content = ["<!-- index:start -->", "%% concordance:end %%"].join("\n");
    const result = inspectGeneratedBlock(content, odd);

    expect(result.status).toBe("found");
  });
});

describe("empty and degenerate blocks", () => {
  it("emits bare markers when there is nothing to link", () => {
    expect(buildGeneratedBlock([], settings)).toBe(
      `${settings.startMarker}\n${settings.endMarker}`,
    );
  });

  it("preserves an alias and a subpath on a kept link", () => {
    const preserved = collectPreservedLinkParts("- [[Note#Section|Alias]]");

    expect(buildGeneratedBlock(["Note"], settings, settings.startMarker, preserved)).toContain(
      "- [[Note#Section|Alias]]",
    );
  });

  it("returns nothing to preserve when there is no existing block", () => {
    expect(collectPreservedLinkParts(null).size).toBe(0);
    expect(collectPreservedLinkParts("").size).toBe(0);
  });

  it("reports a block whose end marker precedes its start marker as malformed", () => {
    const content = [settings.endMarker, "- [[Stray]]", settings.startMarker].join("\n");

    expect(inspectGeneratedBlock(content, settings).status).toBe("malformed-block");
  });

  it("refuses to rewrite a malformed block", () => {
    const content = [settings.endMarker, settings.startMarker].join("\n");
    const result = replaceGeneratedBlock(content, "ignored", true, settings);

    expect(result.status).toBe("malformed-block");
  });
});

describe("inserting a missing block", () => {
  const generated = buildGeneratedBlock(["Note"], settings);

  it("leaves the note alone when insertion was not requested", () => {
    const result = replaceGeneratedBlock("Just prose.", generated, false, settings);

    expect(result).toEqual({ status: "missing-block", existingBlock: null });
  });

  it("appends the block under the configured heading", () => {
    const result = replaceGeneratedBlock("Just prose.", generated, true, settings);

    expect(result.status).toBe("found");
    expect(result.status === "found" && result.nextContent).toContain("## Index");
    expect(result.status === "found" && result.nextContent).toContain("- [[Note]]");
  });

  it("omits the heading when it is configured empty", () => {
    const result = replaceGeneratedBlock("Just prose.", generated, true, {
      ...settings,
      autoIndexHeading: "   ",
    });

    expect(result.status === "found" && result.nextContent).not.toContain("##");
  });

  it("normalises to exactly one blank line whether or not the note ends in a newline", () => {
    const expected = `Prose.\n\n## Index\n${generated}\n`;

    const withTrailing = replaceGeneratedBlock("Prose.\n", generated, true, settings);
    const withoutTrailing = replaceGeneratedBlock("Prose.", generated, true, settings);

    expect(withTrailing.status === "found" && withTrailing.nextContent).toBe(expected);
    expect(withoutTrailing.status === "found" && withoutTrailing.nextContent).toBe(expected);
  });
});

describe("link statistics", () => {
  it("splits links into added, removed, and unchanged", () => {
    expect(getLinkStats(["Kept", "Gone"], ["Kept", "New"])).toEqual({
      added: ["New"],
      removed: ["Gone"],
      unchanged: ["Kept"],
    });
  });

  it("treats both sides being empty as no change at all", () => {
    expect(getLinkStats([], [])).toEqual({ added: [], removed: [], unchanged: [] });
  });
});

describe("scanning helpers", () => {
  it("counts every occurrence, including repeats on one line", () => {
    expect(countOccurrences("a %% b %% c %%", "%%")).toBe(3);
    expect(countOccurrences("nothing here", "%%")).toBe(0);
  });

  it("separates a wikilink into target, subpath, and alias", () => {
    expect(extractWikilinkEntries("- [[Note#Section|Alias]]")).toEqual([
      { target: "Note", subpath: "#Section", alias: "Alias" },
    ]);
    expect(extractWikilinkEntries("- [[Plain]]")).toEqual([
      { target: "Plain", subpath: "", alias: null },
    ]);
  });
});

describe("custom markers", () => {
  const custom: ConcordanceSettings = {
    ...settings,
    startMarker: "<!-- concordance:start -->",
    endMarker: "<!-- concordance:end -->",
  };

  it("falls back to literal matching for markers that do not close with %%", () => {
    const content = [custom.startMarker, "- [[Note]]", custom.endMarker].join("\n");

    expect(inspectGeneratedBlock(content, custom).status).toBe("found");
  });

  it("cannot disambiguate a start marker that is only a %% pair", () => {
    // buildStartMarkerPattern has no prefix to anchor on, so it gives up and
    // the literal fallback counts every %% in the note, including the end
    // marker's own. Reporting malformed is the safe answer: it refuses to
    // guess at boundaries rather than rewriting the wrong span.
    const bare: ConcordanceSettings = { ...settings, startMarker: "%%", endMarker: "%% end %%" };
    const content = [bare.startMarker, "- [[Note]]", bare.endMarker].join("\n");

    expect(inspectGeneratedBlock(content, bare)).toMatchObject({
      status: "malformed-block",
      error: "Concordance start and end markers must appear exactly once each.",
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  buildGeneratedBlock,
  collectPreservedLinkParts,
  extractWikilinkTargets,
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

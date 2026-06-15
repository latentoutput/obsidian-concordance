import { describe, expect, it } from "vitest";
import { buildGeneratedBlock, inspectGeneratedBlock, replaceGeneratedBlock } from "./block";
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

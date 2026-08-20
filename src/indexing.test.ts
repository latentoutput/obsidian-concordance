import { describe, expect, it } from "vitest";
import type { CachedMetadata, MetadataCache, TagCache, TFile, Vault } from "obsidian";
import {
  createAllUpdatePlans,
  createIndexingContext,
  findIndexes,
  createUpdatePlan,
  getIndexFileInfo,
  parseIndexFile,
  validateSettings,
} from "./indexing";
import type { IndexingContext } from "./indexing";
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

describe("index update planning", () => {
  it("plans prefix indexes from filename prefixes", async () => {
    const index = file("ART - Index - Art.md");
    const context = contextWithFiles(
      [index, file("ART - Anatomy.md"), file("ART - Gouache.md"), file("ART - Index - Other.md")],
      {
        [index.path]: ["%% concordance:start %%", "%% concordance:end %%"].join("\n"),
      },
    );

    const indexInfo = parseIndexFile(index, settings);
    expect(indexInfo).not.toBeNull();

    const plan = await createUpdatePlan(context, indexInfo!, settings, false);

    expect(plan.status).toBe("changed");
    expect(plan.generatedLinks).toEqual(["ART - Anatomy", "ART - Gouache"]);
    expect(plan.nextContent).toContain("- [[ART - Anatomy]]");
    expect(plan.nextContent).toContain("- [[ART - Gouache]]");
    expect(plan.nextContent).not.toContain("ART - Index - Other");
  });

  it("plans folder indexes from marker config", async () => {
    const index = file("Indexes/Recipe Index.md");
    const context = contextWithFiles(
      [
        index,
        file("Recipes/Chili.md"),
        file("Recipes/Soup.md"),
        file("Recipes/Desserts/Brownies.md"),
        file("Inbox/Recipe Draft.md"),
      ],
      {
        [index.path]: [
          '%% concordance:start mode="folder" folder="Recipes" includeSubfolders="true" %%',
          "%% concordance:end %%",
        ].join("\n"),
      },
    );

    const indexInfo = { file: index, prefix: "REC", displayName: "Recipes" };
    const plan = await createUpdatePlan(context, indexInfo, settings, false);

    expect(plan.status).toBe("changed");
    expect(plan.generatedLinks).toEqual(["Chili", "Recipes/Desserts/Brownies", "Soup"]);
    expect(plan.nextContent).toContain("- [[Chili]]");
    expect(plan.nextContent).toContain("- [[Recipes/Desserts/Brownies]]");
    expect(plan.nextContent).not.toContain("Recipe Draft");
  });

  it("discovers arbitrary folder-mode index notes", async () => {
    const index = file("Indexes/Recipe Index.md");
    const context = contextWithFiles([index, file("Recipes/Chili.md")], {
      [index.path]: [
        '%% concordance:start mode="folder" folder="Recipes" %%',
        "%% concordance:end %%",
      ].join("\n"),
    });

    await expect(getIndexFileInfo(context, index, settings)).resolves.toMatchObject({
      file: index,
      displayName: "Recipe Index",
    });

    const plans = await createAllUpdatePlans(context, settings);

    expect(plans).toHaveLength(1);
    expect(plans[0]?.generatedLinks).toEqual(["Chili"]);
  });

  it("plans tag indexes from marker config", async () => {
    const index = file("Indexes/Recipe Tags.md");
    const context = contextWithFiles(
      [index, file("Recipes/Chili.md"), file("Recipes/Soup.md"), file("Notes/Not Food.md")],
      {
        [index.path]: [
          '%% concordance:start mode="tag" tag="#recipe" %%',
          "%% concordance:end %%",
        ].join("\n"),
      },
      {
        "Recipes/Chili.md": { tags: [tag("#recipe")] },
        "Recipes/Soup.md": { frontmatter: { tags: ["recipe", "soup"] } },
        "Notes/Not Food.md": { tags: [tag("#not-recipe")] },
      },
    );

    const indexInfo = await getIndexFileInfo(context, index, settings);
    expect(indexInfo).not.toBeNull();

    const plan = await createUpdatePlan(context, indexInfo!, settings, false);

    expect(plan.status).toBe("changed");
    expect(plan.generatedLinks).toEqual(["Chili", "Soup"]);
  });

  it("plans property indexes from marker config", async () => {
    const index = file("Indexes/Recipe Properties.md");
    const context = contextWithFiles(
      [index, file("Recipes/Chili.md"), file("Recipes/Soup.md"), file("Notes/Other.md")],
      {
        [index.path]: [
          '%% concordance:start mode="property" property="type" value="recipe" %%',
          "%% concordance:end %%",
        ].join("\n"),
      },
      {
        "Recipes/Chili.md": { frontmatter: { type: "recipe" } },
        "Recipes/Soup.md": { frontmatter: { type: ["recipe", "soup"] } },
        "Notes/Other.md": { frontmatter: { type: "note" } },
      },
    );

    const indexInfo = await getIndexFileInfo(context, index, settings);
    expect(indexInfo).not.toBeNull();

    const plan = await createUpdatePlan(context, indexInfo!, settings, false);

    expect(plan.status).toBe("changed");
    expect(plan.generatedLinks).toEqual(["Chili", "Soup"]);
  });

  it("applies path link style", async () => {
    const index = file("Indexes/Path Links.md");
    const context = contextWithFiles(
      [index, file("Recipes/Chili.md")],
      {
        [index.path]: [
          '%% concordance:start mode="tag" tag="#recipe" linkStyle="path" %%',
          "%% concordance:end %%",
        ].join("\n"),
      },
      {
        "Recipes/Chili.md": { tags: [tag("#recipe")] },
      },
    );

    const indexInfo = await getIndexFileInfo(context, index, settings);
    expect(indexInfo).not.toBeNull();

    const plan = await createUpdatePlan(context, indexInfo!, settings, false);

    expect(plan.generatedLinks).toEqual(["Recipes/Chili"]);
  });

  it("sorts by name when configured", async () => {
    const index = file("Indexes/Name Sort.md");
    const context = contextWithFiles(
      [
        index,
        file("Recipes/Ziti.md"),
        file("Recipes/Desserts/Brownies.md"),
        file("Recipes/Apple.md"),
      ],
      {
        [index.path]: [
          '%% concordance:start mode="folder" folder="Recipes" includeSubfolders="true" sort="name" %%',
          "%% concordance:end %%",
        ].join("\n"),
      },
    );

    const indexInfo = await getIndexFileInfo(context, index, settings);
    expect(indexInfo).not.toBeNull();

    const plan = await createUpdatePlan(context, indexInfo!, settings, false);

    expect(plan.generatedLinks).toEqual(["Apple", "Recipes/Desserts/Brownies", "Ziti"]);
  });
});

function file(path: string): TFile {
  const basename = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");

  return {
    path,
    name: `${basename}.md`,
    basename,
    extension: "md",
  } as TFile;
}

function tag(value: string): TagCache {
  return { tag: value, position: {} as TagCache["position"] };
}

function contextWithFiles(
  files: TFile[],
  contentByPath: Record<string, string>,
  cacheByPath: Record<string, CachedMetadata> = {},
): IndexingContext {
  const vault = {
    getMarkdownFiles: () => files,
    cachedRead: async (target: TFile) => contentByPath[target.path] ?? "",
    read: async (target: TFile) => contentByPath[target.path] ?? "",
  } as unknown as Vault;

  const metadataCache = {
    getFileCache: (target: TFile) => cacheByPath[target.path] ?? null,
  } as unknown as MetadataCache;

  return { vault, metadataCache };
}

describe("settings validation", () => {
  it("accepts the defaults", () => {
    expect(validateSettings(settings)).toBeNull();
  });

  it("rejects a blank marker on either side", () => {
    expect(validateSettings({ ...settings, startMarker: "" })).toBe(
      "Concordance start and end markers must both be configured.",
    );
    expect(validateSettings({ ...settings, endMarker: "" })).toBe(
      "Concordance start and end markers must both be configured.",
    );
  });

  it("rejects markers that cannot be told apart", () => {
    expect(validateSettings({ ...settings, endMarker: settings.startMarker })).toBe(
      "Concordance start and end markers must be different.",
    );
  });

  it("requires the child prefix template to place the prefix", () => {
    expect(validateSettings({ ...settings, childFilenamePrefixTemplate: "Notes - " })).toBe(
      "Concordance child filename prefix template must include {PREFIX}.",
    );
  });

  it("requires the index template to carry both tokens with text between them", () => {
    const message =
      "Concordance index filename template must include {PREFIX} and {DISPLAY_NAME} exactly once, separated by literal text.";

    expect(validateSettings({ ...settings, indexFilenameTemplate: "{PREFIX} only" })).toBe(message);
    expect(validateSettings({ ...settings, indexFilenameTemplate: "{DISPLAY_NAME} only" })).toBe(
      message,
    );
    expect(validateSettings({ ...settings, indexFilenameTemplate: "{PREFIX}{DISPLAY_NAME}" })).toBe(
      message,
    );
  });
});

describe("indexing context", () => {
  it("carries the vault and metadata cache from the app", () => {
    const vault = { name: "vault" };
    const metadataCache = { name: "cache" };
    const context = createIndexingContext({ vault, metadataCache } as never);

    expect(context.vault).toBe(vault);
    expect(context.metadataCache).toBe(metadataCache);
  });
});

describe("exclusions", () => {
  const indexContent = ["%% concordance:start %%", "%% concordance:end %%"].join("\n");

  it("skips notes inside an excluded folder but keeps similarly named ones", async () => {
    const index = file("ART - Index - Art.md");
    const context = contextWithFiles(
      [index, file("Archive/ART - Old.md"), file("ArchiveNotes/ART - Kept.md")],
      { [index.path]: indexContent },
    );

    const plans = await createAllUpdatePlans(context, {
      ...settings,
      excludedFolders: ["Archive"],
    });

    expect(plans[0]?.generatedLinks).toEqual(["ART - Kept"]);
  });

  it("tolerates leading and trailing slashes on an excluded folder", async () => {
    const index = file("ART - Index - Art.md");
    const context = contextWithFiles([index, file("Archive/ART - Old.md")], {
      [index.path]: indexContent,
    });

    const plans = await createAllUpdatePlans(context, {
      ...settings,
      excludedFolders: ["/Archive/"],
    });

    expect(plans[0]?.generatedLinks).toEqual([]);
  });

  it("ignores an empty excluded folder entry rather than excluding everything", async () => {
    const index = file("ART - Index - Art.md");
    const context = contextWithFiles([index, file("ART - Kept.md")], {
      [index.path]: indexContent,
    });

    const plans = await createAllUpdatePlans(context, {
      ...settings,
      excludedFolders: ["/", "   "],
    });

    expect(plans[0]?.generatedLinks).toEqual(["ART - Kept"]);
  });

  it("skips notes whose name contains an excluded term", async () => {
    const index = file("ART - Index - Art.md");
    const context = contextWithFiles(
      [index, file("ART - Draft Sketch.md"), file("ART - Final.md")],
      {
        [index.path]: indexContent,
      },
    );

    const plans = await createAllUpdatePlans(context, {
      ...settings,
      excludedFilenameTerms: ["Draft"],
    });

    expect(plans[0]?.generatedLinks).toEqual(["ART - Final"]);
  });
});

describe("property values that are not strings", () => {
  function propertyIndex(value: string) {
    return [
      `%% concordance:start mode="property" property="rating" value="${value}" %%`,
      "%% concordance:end %%",
    ].join("\n");
  }

  it("matches numeric and boolean frontmatter by its printed form", async () => {
    const index = file("Indexes/Rated.md");
    const context = contextWithFiles(
      [index, file("Notes/Five.md"), file("Notes/True.md"), file("Notes/Other.md")],
      { [index.path]: propertyIndex("5") },
      {
        "Notes/Five.md": { frontmatter: { rating: 5 } },
        "Notes/True.md": { frontmatter: { rating: true } },
        "Notes/Other.md": { frontmatter: { rating: 3 } },
      },
    );

    const indexInfo = await getIndexFileInfo(context, index, settings);
    const plan = await createUpdatePlan(context, indexInfo!, settings, false);

    expect(plan.generatedLinks).toEqual(["Five"]);
  });

  it("never matches a nested map, which would otherwise stringify to [object Object]", async () => {
    const index = file("Indexes/Rated.md");
    const context = contextWithFiles(
      [index, file("Notes/Nested.md")],
      { [index.path]: propertyIndex("[object Object]") },
      { "Notes/Nested.md": { frontmatter: { rating: { score: 5 } } } },
    );

    const indexInfo = await getIndexFileInfo(context, index, settings);
    const plan = await createUpdatePlan(context, indexInfo!, settings, false);

    expect(plan.generatedLinks).toEqual([]);
  });

  it("ignores a property that is absent or null", async () => {
    const index = file("Indexes/Rated.md");
    const context = contextWithFiles(
      [index, file("Notes/Missing.md"), file("Notes/Null.md")],
      { [index.path]: propertyIndex("5") },
      {
        "Notes/Missing.md": { frontmatter: {} },
        "Notes/Null.md": { frontmatter: { rating: null } },
      },
    );

    const indexInfo = await getIndexFileInfo(context, index, settings);
    const plan = await createUpdatePlan(context, indexInfo!, settings, false);

    expect(plan.generatedLinks).toEqual([]);
  });
});

describe("recognising index files", () => {
  it("ignores anything that is not markdown", () => {
    const attachment = { ...file("ART - Index - Art.md"), extension: "png" } as TFile;

    expect(parseIndexFile(attachment, settings)).toBeNull();
  });

  it("collects prefix indexes and drops excluded ones", () => {
    const files = [
      file("ART - Index - Art.md"),
      file("Archive/OLD - Index - Old.md"),
      file("ART - Anatomy.md"),
    ];

    const found = findIndexes(files, { ...settings, excludedFolders: ["Archive"] });

    expect(found.map((index) => index.file.basename)).toEqual(["ART - Index - Art"]);
    expect(found[0]?.prefix).toBe("ART");
    expect(found[0]?.displayName).toBe("Art");
  });

  it("does not treat a prefix-mode block in a non-index note as an index", async () => {
    const note = file("Notes/Scratch.md");
    const context = contextWithFiles([note], {
      [note.path]: ["%% concordance:start %%", "%% concordance:end %%"].join("\n"),
    });

    expect(await getIndexFileInfo(context, note, settings)).toBeNull();
  });
});

describe("plans that cannot be written", () => {
  it("reports a malformed block", async () => {
    const index = file("ART - Index - Art.md");
    const context = contextWithFiles([index, file("ART - Anatomy.md")], {
      [index.path]: ["%% concordance:end %%", "%% concordance:start %%"].join("\n"),
    });

    const plan = await createUpdatePlan(context, parseIndexFile(index, settings)!, settings, false);

    expect(plan.status).toBe("malformed-block");
    expect(plan.nextContent).toBeNull();
  });

  it("reports a missing block when insertion was not requested", async () => {
    const index = file("ART - Index - Art.md");
    const context = contextWithFiles([index, file("ART - Anatomy.md")], {
      [index.path]: "Just prose.",
    });

    const plan = await createUpdatePlan(context, parseIndexFile(index, settings)!, settings, false);

    expect(plan.status).toBe("missing-block");
    expect(plan.nextContent).toBeNull();
  });
});

describe("marker configuration edge cases", () => {
  async function planFor(marker: string, files: TFile[], caches = {}) {
    const index = file("Indexes/Configured.md");
    const context = contextWithFiles(
      [index, ...files],
      {
        [index.path]: [marker, "%% concordance:end %%"].join("\n"),
      },
      caches,
    );
    const info = await getIndexFileInfo(context, index, settings);
    return info ? createUpdatePlan(context, info, settings, false) : null;
  }

  it("matches nothing when tag mode has no tag", async () => {
    const plan = await planFor('%% concordance:start mode="tag" tag="" %%', [file("Notes/A.md")]);

    expect(plan?.generatedLinks).toEqual([]);
  });

  it("matches nothing when property mode is missing its value", async () => {
    const plan = await planFor('%% concordance:start mode="property" property="type" %%', [
      file("Notes/A.md"),
    ]);

    expect(plan?.generatedLinks).toEqual([]);
  });

  it("links by bare name when linkStyle is name", async () => {
    const plan = await planFor(
      '%% concordance:start mode="tag" tag="#recipe" linkStyle="name" %%',
      [file("Deep/Nested/Chili.md")],
      { "Deep/Nested/Chili.md": { tags: [tag("#recipe")] } },
    );

    expect(plan?.generatedLinks).toEqual(["Chili"]);
  });

  it("skips notes with no metadata cache at all", async () => {
    const plan = await planFor('%% concordance:start mode="tag" tag="#recipe" %%', [
      file("Notes/Uncached.md"),
    ]);

    expect(plan?.generatedLinks).toEqual([]);
  });

  it("reads frontmatter tags written as a delimited string", async () => {
    const plan = await planFor(
      '%% concordance:start mode="tag" tag="#recipe" %%',
      [file("Notes/Commas.md"), file("Notes/Spaces.md"), file("Notes/Empty.md")],
      {
        "Notes/Commas.md": { frontmatter: { tags: "recipe, dinner" } },
        "Notes/Spaces.md": { frontmatter: { tags: "recipe dinner" } },
        "Notes/Empty.md": { frontmatter: { tags: "" } },
      },
    );

    expect(plan?.generatedLinks).toEqual(["Commas", "Spaces"]);
  });

  it("ignores a note with no frontmatter in property mode", async () => {
    const plan = await planFor(
      '%% concordance:start mode="property" property="type" value="recipe" %%',
      [file("Notes/Bare.md")],
      { "Notes/Bare.md": {} },
    );

    expect(plan?.generatedLinks).toEqual([]);
  });
});

describe("filename template matching", () => {
  it("rejects a child whose literal text does not line up", async () => {
    const index = file("ART - Index - Art.md");
    const context = contextWithFiles([index, file("ARTish - Anatomy.md")], {
      [index.path]: ["%% concordance:start %%", "%% concordance:end %%"].join("\n"),
    });

    const plan = await createUpdatePlan(context, parseIndexFile(index, settings)!, settings, false);

    expect(plan.generatedLinks).toEqual([]);
  });

  it("rejects an index whose name has trailing text beyond the template", () => {
    expect(parseIndexFile(file("ART - Index - Art - extra.md"), settings)?.displayName).toBe(
      "Art - extra",
    );
    expect(parseIndexFile(file("ART - Indexish - Art.md"), settings)).toBeNull();
  });

  it("rejects a name with text left over after a trailing literal", () => {
    const trailing = { ...settings, indexFilenameTemplate: "{PREFIX} - Index - {DISPLAY_NAME}!" };

    expect(parseIndexFile(file("ART - Index - Art!.md"), trailing)?.displayName).toBe("Art");
    expect(parseIndexFile(file("ART - Index - Art!extra.md"), trailing)).toBeNull();
  });

  it("rejects a template with no tokens at all", () => {
    expect(
      parseIndexFile(file("Anything.md"), { ...settings, indexFilenameTemplate: "Static" }),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import type { CachedMetadata, MetadataCache, TagCache, TFile, Vault } from "obsidian";
import {
  createAllUpdatePlans,
  createUpdatePlan,
  getIndexFileInfo,
  parseIndexFile,
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

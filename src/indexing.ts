import type { App, CachedMetadata, FrontMatterCache, MetadataCache, TFile, Vault } from "obsidian";
import {
  buildGeneratedBlock,
  countOccurrences,
  extractWikilinkTargets,
  getLinkStats,
  inspectGeneratedBlock,
  replaceGeneratedBlock,
} from "./block";
import type { IndexBlockConfig } from "./block";
import type { ConcordanceSettings } from "./settings";
import type { IndexInfo, UpdatePlan } from "./types";

export interface IndexingContext {
  vault: Vault;
  metadataCache: MetadataCache;
}

export function createIndexingContext(app: App): IndexingContext {
  return { vault: app.vault, metadataCache: app.metadataCache };
}

export function validateSettings(settings: ConcordanceSettings): string | null {
  if (settings.startMarker.length === 0 || settings.endMarker.length === 0) {
    return "Concordance start and end markers must both be configured.";
  }

  if (settings.startMarker === settings.endMarker) {
    return "Concordance start and end markers must be different.";
  }

  if (!settings.childFilenamePrefixTemplate.includes("{PREFIX}")) {
    return "Concordance child filename prefix template must include {PREFIX}.";
  }

  if (!isValidIndexFilenameTemplate(settings.indexFilenameTemplate)) {
    return "Concordance index filename template must include {PREFIX} and {DISPLAY_NAME} exactly once, separated by literal text.";
  }

  return null;
}

export function parseIndexFile(file: TFile, settings: ConcordanceSettings): IndexInfo | null {
  if (file.extension !== "md") {
    return null;
  }

  const captures = parseFilenameTemplate(file.basename, settings.indexFilenameTemplate);
  const prefix = captures?.prefix.trim();
  const displayName = captures?.displayName.trim();

  if (!prefix || !displayName) {
    return null;
  }

  return { file, prefix, displayName };
}

export function findIndexes(files: TFile[], settings: ConcordanceSettings): IndexInfo[] {
  return files
    .filter((file) => !isExcludedFile(file, settings))
    .map((file) => parseIndexFile(file, settings))
    .filter((index): index is IndexInfo => Boolean(index));
}

export async function getIndexFileInfo(
  context: IndexingContext,
  file: TFile,
  settings: ConcordanceSettings,
): Promise<IndexInfo | null> {
  const filenameIndex = parseIndexFile(file, settings);
  if (filenameIndex) {
    return filenameIndex;
  }

  const content = await context.vault.cachedRead(file);
  const inspection = inspectGeneratedBlock(content, settings);

  if (inspection.status !== "found") {
    return null;
  }

  if (!isExplicitIndexMode(inspection.config.mode)) {
    return null;
  }

  return { file, prefix: "", displayName: file.basename };
}

export async function createUpdatePlan(
  context: IndexingContext,
  index: IndexInfo,
  settings: ConcordanceSettings,
  addMissingBlock: boolean,
): Promise<UpdatePlan> {
  const content = await context.vault.cachedRead(index.file);
  const inspection = inspectGeneratedBlock(content, settings);
  const blockConfig =
    inspection.status === "found" ? inspection.config : getDefaultBlockConfig(settings);
  const childFiles = findChildFiles(context, index, settings, blockConfig);
  const generatedLinks = childFiles.map((file) => getLinkTarget(file, index, blockConfig));
  const generatedBlock = buildGeneratedBlock(generatedLinks, settings, blockConfig.startMarker);
  const block = replaceGeneratedBlock(content, generatedBlock, addMissingBlock, settings);
  const existingLinks = block.existingBlock ? extractWikilinkTargets(block.existingBlock) : [];
  const stats = getLinkStats(existingLinks, generatedLinks);

  if (block.status === "malformed-block") {
    return {
      index,
      status: "malformed-block",
      childFiles,
      generatedLinks,
      stats,
      nextContent: null,
      error: block.error,
    };
  }

  if (block.status === "missing-block") {
    return {
      index,
      status: "missing-block",
      childFiles,
      generatedLinks,
      stats,
      nextContent: null,
      error: null,
    };
  }

  return {
    index,
    status: block.nextContent === content ? "unchanged" : "changed",
    childFiles,
    generatedLinks,
    stats,
    nextContent: block.nextContent,
    error: null,
  };
}

export async function createAllUpdatePlans(
  context: IndexingContext,
  settings: ConcordanceSettings,
): Promise<UpdatePlan[]> {
  const candidateFiles = context.vault
    .getMarkdownFiles()
    .filter((file) => !isExcludedFile(file, settings));
  const candidates = await Promise.all(
    candidateFiles.map((file) => getIndexFileInfo(context, file, settings)),
  );
  const indexes = candidates.filter((index): index is IndexInfo => Boolean(index));

  return Promise.all(indexes.map((index) => createUpdatePlan(context, index, settings, false)));
}

function isValidIndexFilenameTemplate(template: string): boolean {
  return (
    countOccurrences(template, "{PREFIX}") === 1 &&
    countOccurrences(template, "{DISPLAY_NAME}") === 1 &&
    !template.includes("{PREFIX}{DISPLAY_NAME}") &&
    !template.includes("{DISPLAY_NAME}{PREFIX}")
  );
}

function isExplicitIndexMode(mode: IndexBlockConfig["mode"]): boolean {
  return mode === "folder" || mode === "tag" || mode === "property";
}

function getDefaultBlockConfig(settings: ConcordanceSettings): IndexBlockConfig {
  return {
    mode: "prefix",
    folder: null,
    includeSubfolders: false,
    linkStyle: "auto",
    property: null,
    sort: "path",
    startMarker: settings.startMarker,
    tag: null,
    value: null,
  };
}

function findChildFiles(
  context: IndexingContext,
  index: IndexInfo,
  settings: ConcordanceSettings,
  blockConfig: IndexBlockConfig,
): TFile[] {
  const files = context.vault.getMarkdownFiles();

  if (blockConfig.mode === "folder") {
    return findFolderChildFiles(files, index, settings, blockConfig);
  }

  if (blockConfig.mode === "tag") {
    return findTagChildFiles(context.metadataCache, files, index, settings, blockConfig);
  }

  if (blockConfig.mode === "property") {
    return findPropertyChildFiles(context.metadataCache, files, index, settings, blockConfig);
  }

  return findPrefixChildFiles(files, index, settings, blockConfig);
}

function findPrefixChildFiles(
  files: TFile[],
  index: IndexInfo,
  settings: ConcordanceSettings,
  blockConfig: IndexBlockConfig,
): TFile[] {
  const childPrefix = renderTemplate(settings.childFilenamePrefixTemplate, index);

  return filterCandidateFiles(files, index, settings, (file) => {
    if (!file.basename.startsWith(childPrefix)) {
      return false;
    }

    return parseIndexFile(file, settings)?.prefix !== index.prefix;
  }).sort(getFileSort(blockConfig));
}

function findFolderChildFiles(
  files: TFile[],
  index: IndexInfo,
  settings: ConcordanceSettings,
  blockConfig: IndexBlockConfig,
): TFile[] {
  const targetFolder = normalizeFolderPath(blockConfig.folder ?? getFolderPath(index.file.path));

  return filterCandidateFiles(files, index, settings, (file) => {
    return isInFolderScope(file, targetFolder, blockConfig.includeSubfolders);
  }).sort(getFileSort(blockConfig));
}

function findTagChildFiles(
  metadataCache: MetadataCache,
  files: TFile[],
  index: IndexInfo,
  settings: ConcordanceSettings,
  blockConfig: IndexBlockConfig,
): TFile[] {
  const tag = normalizeTag(blockConfig.tag ?? "");

  if (tag.length === 0) {
    return [];
  }

  return filterCandidateFiles(files, index, settings, (file) => {
    return getAllTagsFromCache(metadataCache.getFileCache(file)).has(tag);
  }).sort(getFileSort(blockConfig));
}

function findPropertyChildFiles(
  metadataCache: MetadataCache,
  files: TFile[],
  index: IndexInfo,
  settings: ConcordanceSettings,
  blockConfig: IndexBlockConfig,
): TFile[] {
  const property = blockConfig.property?.trim();
  const value = blockConfig.value?.trim();

  if (!property || !value) {
    return [];
  }

  return filterCandidateFiles(files, index, settings, (file) => {
    return frontmatterMatches(metadataCache.getFileCache(file)?.frontmatter, property, value);
  }).sort(getFileSort(blockConfig));
}

function filterCandidateFiles(
  files: TFile[],
  index: IndexInfo,
  settings: ConcordanceSettings,
  predicate: (file: TFile) => boolean,
): TFile[] {
  return files.filter((file) => {
    if (
      file.path === index.file.path ||
      file.extension !== "md" ||
      isExcludedFile(file, settings)
    ) {
      return false;
    }

    if (parseIndexFile(file, settings) !== null) {
      return false;
    }

    return predicate(file);
  });
}

function isInFolderScope(file: TFile, targetFolder: string, includeSubfolders: boolean): boolean {
  if (includeSubfolders) {
    return targetFolder.length === 0 || file.path.startsWith(`${targetFolder}/`);
  }

  return getFolderPath(file.path) === targetFolder;
}

function getLinkTarget(file: TFile, index: IndexInfo, blockConfig: IndexBlockConfig): string {
  if (blockConfig.linkStyle === "name") {
    return file.basename;
  }

  if (blockConfig.linkStyle === "path") {
    return stripMarkdownExtension(file.path);
  }

  if (blockConfig.mode === "folder") {
    const targetFolder = normalizeFolderPath(blockConfig.folder ?? getFolderPath(index.file.path));
    const fileFolder = getFolderPath(file.path);

    if (blockConfig.includeSubfolders && fileFolder !== targetFolder) {
      return stripMarkdownExtension(file.path);
    }
  }

  return file.basename;
}

function getFolderPath(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash === -1 ? "" : path.slice(0, lastSlash);
}

function normalizeFolderPath(folder: string): string {
  return folder.replace(/^\/+|\/+$/g, "");
}

function stripMarkdownExtension(path: string): string {
  return path.endsWith(".md") ? path.slice(0, -3) : path;
}

function getFileSort(blockConfig: IndexBlockConfig): (a: TFile, b: TFile) => number {
  if (blockConfig.sort === "name") {
    return (a, b) => a.basename.localeCompare(b.basename, undefined, { sensitivity: "base" });
  }

  return (a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: "base" });
}

function normalizeTag(tag: string): string {
  const trimmed = tag.trim();
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function getAllTagsFromCache(cache: CachedMetadata | null): Set<string> {
  const tags = new Set<string>();

  if (!cache) {
    return tags;
  }

  if (cache.tags) {
    for (const entry of cache.tags) {
      tags.add(entry.tag);
    }
  }

  const frontmatterTags: unknown = cache.frontmatter?.tags;

  if (Array.isArray(frontmatterTags)) {
    for (const entry of frontmatterTags) {
      if (typeof entry === "string" && entry.length > 0) {
        tags.add(normalizeTag(entry));
      }
    }
  } else if (typeof frontmatterTags === "string" && frontmatterTags.length > 0) {
    for (const entry of frontmatterTags.split(/[\s,]+/)) {
      if (entry.length > 0) {
        tags.add(normalizeTag(entry));
      }
    }
  }

  return tags;
}

function frontmatterMatches(
  frontmatter: FrontMatterCache | undefined,
  property: string,
  value: string,
): boolean {
  if (!frontmatter) {
    return false;
  }

  const raw: unknown = frontmatter[property];

  if (raw === null || raw === undefined) {
    return false;
  }

  if (Array.isArray(raw)) {
    return raw.some((entry: unknown) => String(entry).trim() === value);
  }

  return String(raw).trim() === value;
}

function parseFilenameTemplate(
  filename: string,
  template: string,
): { prefix: string; displayName: string } | null {
  const parts = tokenizeTemplate(template);
  const captures = new Map<string, string>();
  let position = 0;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];

    if (part.type === "literal") {
      if (!filename.startsWith(part.value, position)) {
        return null;
      }

      position += part.value.length;
      continue;
    }

    const nextLiteral = parts.slice(index + 1).find((candidate) => candidate.type === "literal");
    const nextIndex = nextLiteral ? filename.indexOf(nextLiteral.value, position) : filename.length;

    if (nextIndex === -1) {
      return null;
    }

    captures.set(part.value, filename.slice(position, nextIndex));
    position = nextIndex;
  }

  if (position !== filename.length) {
    return null;
  }

  return {
    prefix: captures.get("PREFIX") ?? "",
    displayName: captures.get("DISPLAY_NAME") ?? "",
  };
}

function tokenizeTemplate(
  template: string,
): Array<{ type: "literal"; value: string } | { type: "token"; value: "PREFIX" | "DISPLAY_NAME" }> {
  const parts: Array<
    { type: "literal"; value: string } | { type: "token"; value: "PREFIX" | "DISPLAY_NAME" }
  > = [];
  let position = 0;

  while (position < template.length) {
    const prefixIndex = template.indexOf("{PREFIX}", position);
    const displayNameIndex = template.indexOf("{DISPLAY_NAME}", position);
    const nextToken = getNextTemplateToken(prefixIndex, displayNameIndex);

    if (!nextToken) {
      parts.push({ type: "literal", value: template.slice(position) });
      break;
    }

    if (nextToken.index > position) {
      parts.push({ type: "literal", value: template.slice(position, nextToken.index) });
    }

    parts.push({ type: "token", value: nextToken.value });
    position = nextToken.index + nextToken.raw.length;
  }

  return parts.filter((part) => part.type === "token" || part.value.length > 0);
}

function getNextTemplateToken(
  prefixIndex: number,
  displayNameIndex: number,
): { index: number; raw: string; value: "PREFIX" | "DISPLAY_NAME" } | null {
  if (prefixIndex === -1 && displayNameIndex === -1) {
    return null;
  }

  if (displayNameIndex === -1 || (prefixIndex !== -1 && prefixIndex < displayNameIndex)) {
    return { index: prefixIndex, raw: "{PREFIX}", value: "PREFIX" };
  }

  return { index: displayNameIndex, raw: "{DISPLAY_NAME}", value: "DISPLAY_NAME" };
}

function renderTemplate(template: string, index: IndexInfo): string {
  return template
    .split("{PREFIX}")
    .join(index.prefix)
    .split("{DISPLAY_NAME}")
    .join(index.displayName);
}

function isExcludedFile(file: TFile, settings: ConcordanceSettings): boolean {
  return isExcludedFolder(file, settings) || isExcludedFilename(file, settings);
}

function isExcludedFolder(file: TFile, settings: ConcordanceSettings): boolean {
  return settings.excludedFolders.some((folder) => {
    const normalized = normalizeFolderPath(folder);

    if (normalized.length === 0) {
      return false;
    }

    return file.path.startsWith(`${normalized}/`);
  });
}

function isExcludedFilename(file: TFile, settings: ConcordanceSettings): boolean {
  return settings.excludedFilenameTerms.some((term) => file.basename.includes(term));
}

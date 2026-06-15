import type { ConcordanceSettings } from "./settings";
import type { LinkStats } from "./types";

export interface IndexBlockConfig {
  mode: "prefix" | "folder" | "tag" | "property";
  folder: string | null;
  includeSubfolders: boolean;
  linkStyle: "auto" | "name" | "path";
  property: string | null;
  sort: "name" | "path";
  startMarker: string;
  tag: string | null;
  value: string | null;
}

export type BlockInspection =
  | {
      status: "found";
      startIndex: number;
      endIndex: number;
      blockEndIndex: number;
      existingBlock: string;
      config: IndexBlockConfig;
    }
  | { status: "missing-block" }
  | { status: "malformed-block"; existingBlock: string | null; error: string };

export function buildGeneratedBlock(
  linkTargets: string[],
  settings: ConcordanceSettings,
  startMarker = settings.startMarker,
): string {
  const links = linkTargets.map((target) => `- [[${target}]]`);

  if (links.length === 0) {
    return `${startMarker}\n${settings.endMarker}`;
  }

  return `${startMarker}\n${links.join("\n")}\n${settings.endMarker}`;
}

export function inspectGeneratedBlock(
  content: string,
  settings: ConcordanceSettings,
): BlockInspection {
  const startMarkers = findStartMarkers(content, settings.startMarker);
  const endCount = countOccurrences(content, settings.endMarker);

  if (startMarkers.length === 0 && endCount === 0) {
    return { status: "missing-block" };
  }

  if (startMarkers.length !== 1 || endCount !== 1) {
    return {
      status: "malformed-block",
      existingBlock: null,
      error: "Concordance start and end markers must appear exactly once each.",
    };
  }

  const startMarker = startMarkers[0];
  const endIndex = content.indexOf(settings.endMarker);
  const blockEndIndex = endIndex + settings.endMarker.length;

  if (startMarker.index > endIndex) {
    return {
      status: "malformed-block",
      existingBlock: content.slice(endIndex, blockEndIndex),
      error: "Concordance end marker appears before the start marker.",
    };
  }

  return {
    status: "found",
    startIndex: startMarker.index,
    endIndex,
    blockEndIndex,
    existingBlock: content.slice(startMarker.index, blockEndIndex),
    config: parseBlockConfig(startMarker.text, startMarker.attributes),
  };
}

export function replaceGeneratedBlock(
  content: string,
  generatedBlock: string,
  addMissingBlock: boolean,
  settings: ConcordanceSettings,
):
  | { status: "found"; nextContent: string; existingBlock: string }
  | { status: "missing-block"; existingBlock: null }
  | { status: "malformed-block"; existingBlock: string | null; error: string } {
  const inspection = inspectGeneratedBlock(content, settings);

  if (inspection.status === "missing-block") {
    if (!addMissingBlock) {
      return { status: "missing-block", existingBlock: null };
    }

    const separator = content.endsWith("\n") ? "\n" : "\n\n";
    const heading = settings.autoIndexHeading.trim();
    const insertedBlock = heading.length > 0 ? `## ${heading}\n${generatedBlock}` : generatedBlock;

    return {
      status: "found",
      nextContent: `${content}${separator}${insertedBlock}\n`,
      existingBlock: "",
    };
  }

  if (inspection.status === "malformed-block") {
    return {
      status: "malformed-block",
      existingBlock: inspection.existingBlock,
      error: inspection.error,
    };
  }

  return {
    status: "found",
    nextContent: `${content.slice(0, inspection.startIndex)}${generatedBlock}${content.slice(inspection.blockEndIndex)}`,
    existingBlock: inspection.existingBlock,
  };
}

export function countOccurrences(content: string, search: string): number {
  let count = 0;
  let index = content.indexOf(search);

  while (index !== -1) {
    count += 1;
    index = content.indexOf(search, index + search.length);
  }

  return count;
}

export function extractWikilinkTargets(content: string): string[] {
  const targets: string[] = [];
  const linkPattern = /^-\s+\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/gm;
  let match = linkPattern.exec(content);

  while (match) {
    const target = match[1]?.trim();

    if (target) {
      targets.push(target);
    }

    match = linkPattern.exec(content);
  }

  return targets;
}

export function getLinkStats(existingLinks: string[], generatedLinks: string[]): LinkStats {
  const existing = new Set(existingLinks);
  const generated = new Set(generatedLinks);

  return {
    added: generatedLinks.filter((link) => !existing.has(link)),
    removed: existingLinks.filter((link) => !generated.has(link)),
    unchanged: generatedLinks.filter((link) => existing.has(link)),
  };
}

function findStartMarkers(
  content: string,
  configuredStartMarker: string,
): Array<{ index: number; text: string; attributes: string }> {
  if (configuredStartMarker === "%% concordance:start %%") {
    const markers: Array<{ index: number; text: string; attributes: string }> = [];
    const markerPattern = /%%\s*concordance:start(?<attributes>.*?)%%/g;
    let match = markerPattern.exec(content);

    while (match) {
      markers.push({
        index: match.index,
        text: match[0],
        attributes: match.groups?.attributes?.trim() ?? "",
      });
      match = markerPattern.exec(content);
    }

    return markers;
  }

  const markers: Array<{ index: number; text: string; attributes: string }> = [];
  let index = content.indexOf(configuredStartMarker);

  while (index !== -1) {
    markers.push({ index, text: configuredStartMarker, attributes: "" });
    index = content.indexOf(configuredStartMarker, index + configuredStartMarker.length);
  }

  return markers;
}

function parseBlockConfig(startMarker: string, attributes: string): IndexBlockConfig {
  const parsed = parseAttributes(attributes);
  const mode = parseMode(parsed.get("mode"));

  return {
    mode,
    folder: parsed.get("folder") ?? null,
    includeSubfolders: parsed.get("includeSubfolders") === "true",
    linkStyle: parseLinkStyle(parsed.get("linkStyle")),
    property: parsed.get("property") ?? null,
    sort: parseSort(parsed.get("sort")),
    startMarker,
    tag: parsed.get("tag") ?? null,
    value: parsed.get("value") ?? null,
  };
}

function parseLinkStyle(linkStyle: string | undefined): IndexBlockConfig["linkStyle"] {
  if (linkStyle === "name" || linkStyle === "path") {
    return linkStyle;
  }

  return "auto";
}

function parseSort(sort: string | undefined): IndexBlockConfig["sort"] {
  if (sort === "name") {
    return "name";
  }

  return "path";
}

function parseMode(mode: string | undefined): IndexBlockConfig["mode"] {
  if (mode === "folder" || mode === "tag" || mode === "property") {
    return mode;
  }

  return "prefix";
}

function parseAttributes(attributes: string): Map<string, string> {
  const parsed = new Map<string, string>();
  const attributePattern = /([A-Za-z][A-Za-z0-9_-]*)="([^"]*)"/g;
  let match = attributePattern.exec(attributes);

  while (match) {
    const key = match[1];
    const value = match[2];

    if (key && value !== undefined) {
      parsed.set(key, value);
    }

    match = attributePattern.exec(attributes);
  }

  return parsed;
}

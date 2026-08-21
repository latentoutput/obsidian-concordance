import type { TFile } from "obsidian";

export interface IndexInfo {
  file: TFile;
  prefix: string;
  displayName: string;
  /**
   * How this note was recognised as an index. "filename" means it matches the
   * configured template, which is unambiguous. "markers" means the only
   * evidence is the block inside it, which a note merely documenting the
   * plugin could also carry, so anything reported about it is hedged.
   */
  source: "filename" | "markers";
}

export interface LinkStats {
  added: string[];
  removed: string[];
  unchanged: string[];
}

export interface UpdatePlan {
  index: IndexInfo;
  status: "changed" | "unchanged" | "missing-block" | "malformed-block";
  childFiles: TFile[];
  generatedLinks: string[];
  stats: LinkStats;
  nextContent: string | null;
  error: string | null;
}

export interface BulkConfirmationResult {
  confirmed: boolean;
  addMissingBlocks: boolean;
}

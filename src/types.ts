import type { TFile } from "obsidian";

export interface IndexInfo {
  file: TFile;
  prefix: string;
  displayName: string;
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

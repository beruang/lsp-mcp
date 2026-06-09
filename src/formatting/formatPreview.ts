import type { LspClient } from "../lsp/LspClient.js";
import type { SafetyViolation } from "../workspaceEdit/validateWorkspaceEdit.js";
import { buildWorkspaceEditPreview } from "../workspaceEdit/previewWorkspaceEdit.js";
import { LIMITS } from "../safety/limits.js";

export interface FormatOptions {
  tabSize?: number;
  insertSpaces?: boolean;
  trimTrailingWhitespace?: boolean;
  insertFinalNewline?: boolean;
  trimFinalNewlines?: boolean;
}

export interface FormatPreviewResult {
  changed: boolean;
  changedFiles: string[];
  editCount: number;
  diff?: string;
  safe: boolean;
  violations: SafetyViolation[];
}

const DEFAULT_OPTIONS: FormatOptions = {
  tabSize: 2,
  insertSpaces: true,
};

/**
 * Format a full document via textDocument/formatting.
 */
export async function formatDocument(
  client: LspClient,
  uri: string,
  workspacePath: string,
  options?: FormatOptions & { includeDiff?: boolean }
): Promise<FormatPreviewResult> {
  const caps = client.getCapabilities();
  if (!caps.raw.documentFormattingProvider) {
    return {
      changed: false,
      changedFiles: [],
      editCount: 0,
      safe: false,
      violations: [{ type: "capability_unsupported", message: "documentFormattingProvider not supported" }],
    };
  }

  const fmtOpts = { ...DEFAULT_OPTIONS, ...options };
  const includeDiff = options?.includeDiff !== false;

  let textEdits: Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }>;
  try {
    textEdits = await client.request("textDocument/formatting", {
      textDocument: { uri },
      options: { tabSize: fmtOpts.tabSize, insertSpaces: fmtOpts.insertSpaces },
    }, LIMITS.TIMEOUTS.HOVER_MS) as any;
  } catch {
    return { changed: false, changedFiles: [], editCount: 0, safe: false, violations: [{ type: "unknown", message: "Formatting request failed" }] };
  }

  if (!textEdits || textEdits.length === 0) {
    return { changed: false, changedFiles: [], editCount: 0, safe: true, violations: [] };
  }

  // Build WorkspaceEdit-like shape
  const workspaceEdit = { changes: { [uri]: textEdits } };
  const preview = buildWorkspaceEditPreview(workspaceEdit, workspacePath, { includeDiff });

  return {
    changed: preview.editCount > 0,
    changedFiles: preview.changedFiles,
    editCount: preview.editCount,
    diff: preview.diff,
    safe: preview.safe,
    violations: preview.violations,
  };
}

/**
 * Format a range via textDocument/rangeFormatting.
 */
export async function formatRange(
  client: LspClient,
  uri: string,
  range: { start: { line: number; character: number }; end: { line: number; character: number } },
  workspacePath: string,
  options?: FormatOptions & { includeDiff?: boolean }
): Promise<FormatPreviewResult> {
  const caps = client.getCapabilities();
  if (!caps.raw.documentRangeFormattingProvider) {
    return {
      changed: false,
      changedFiles: [],
      editCount: 0,
      safe: false,
      violations: [{ type: "capability_unsupported", message: "documentRangeFormattingProvider not supported" }],
    };
  }

  const fmtOpts = { ...DEFAULT_OPTIONS, ...options };
  const includeDiff = options?.includeDiff !== false;

  let textEdits: Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }>;
  try {
    textEdits = await client.request("textDocument/rangeFormatting", {
      textDocument: { uri },
      range,
      options: { tabSize: fmtOpts.tabSize, insertSpaces: fmtOpts.insertSpaces },
    }, LIMITS.TIMEOUTS.HOVER_MS) as any;
  } catch {
    return { changed: false, changedFiles: [], editCount: 0, safe: false, violations: [{ type: "unknown", message: "Range formatting request failed" }] };
  }

  if (!textEdits || textEdits.length === 0) {
    return { changed: false, changedFiles: [], editCount: 0, safe: true, violations: [] };
  }

  const workspaceEdit = { changes: { [uri]: textEdits } };
  const preview = buildWorkspaceEditPreview(workspaceEdit, workspacePath, { includeDiff });

  return {
    changed: preview.editCount > 0,
    changedFiles: preview.changedFiles,
    editCount: preview.editCount,
    diff: preview.diff,
    safe: preview.safe,
    violations: preview.violations,
  };
}

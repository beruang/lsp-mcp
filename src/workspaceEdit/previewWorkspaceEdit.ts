import { readFileSync } from "node:fs";
import { createPatch } from "diff";
import { parseWorkspaceEdit } from "./parseWorkspaceEdit.js";
import { validateWorkspaceEdit } from "./validateWorkspaceEdit.js";
import { applyTextEdits } from "./applyTextEdits.js";
import type { ParsedWorkspaceEdit } from "./parseWorkspaceEdit.js";
import type { SafetyViolation, ValidationOptions } from "./validateWorkspaceEdit.js";

export interface WorkspaceEditPreview {
  safe: boolean;
  changedFiles: string[];
  editCount: number;
  diff?: string;
  workspaceEdit?: unknown;
  violations: SafetyViolation[];
}

const DIFF_LINE_CAP = 200;

export function generateDiff(filePath: string, before: string, after: string): string {
  const patch = createPatch(filePath, before, after, "original", "modified");
  const lines = patch.split("\n");
  if (lines.length > DIFF_LINE_CAP) {
    return lines.slice(0, DIFF_LINE_CAP).join("\n") +
      `\n... (truncated, ${lines.length - DIFF_LINE_CAP} more lines)`;
  }
  return patch;
}

function applyEditsToFile(
  parsed: ParsedWorkspaceEdit
): Map<string, { before: string; after: string }> {
  const byFile = new Map<string, Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }>>();

  for (const edit of parsed.edits) {
    const list = byFile.get(edit.filePath) ?? [];
    list.push({ range: edit.range, newText: edit.newText });
    byFile.set(edit.filePath, list);
  }

  const results = new Map<string, { before: string; after: string }>();

  for (const [filePath, edits] of byFile) {
    let original: string;
    try {
      original = readFileSync(filePath, "utf-8");
    } catch {
      original = "";
    }

    let modified: string;
    try {
      modified = applyTextEdits(original, edits);
    } catch {
      modified = original;
    }

    results.set(filePath, { before: original, after: modified });
  }

  return results;
}

export function workspaceEditToPreview(
  parsed: ParsedWorkspaceEdit,
  _workspacePath: string,
  options?: ValidationOptions & { includeDiff?: boolean }
): WorkspaceEditPreview {
  const includeDiff = options?.includeDiff !== false;
  const validation = validateWorkspaceEdit(parsed, _workspacePath, options);

  const preview: WorkspaceEditPreview = {
    safe: validation.safe,
    changedFiles: validation.changedFiles,
    editCount: validation.editCount,
    violations: validation.violations,
  };

  if (includeDiff && validation.safe && validation.editCount > 0) {
    const fileResults = applyEditsToFile(parsed);
    const patches: string[] = [];
    for (const [filePath, { before, after }] of fileResults) {
      if (before !== after) {
        patches.push(generateDiff(filePath, before, after));
      }
    }
    preview.diff = patches.join("\n");
  }

  return preview;
}

export function buildWorkspaceEditPreview(
  raw: unknown,
  workspacePath: string,
  options?: ValidationOptions & { includeDiff?: boolean }
): WorkspaceEditPreview {
  const parsed = parseWorkspaceEdit(raw, workspacePath);
  const preview = workspaceEditToPreview(parsed, workspacePath, options);
  preview.workspaceEdit = raw;
  return preview;
}

export function buildValidateWorkspaceEditResult(
  raw: unknown,
  workspacePath: string,
  options?: ValidationOptions
) {
  const parsed = parseWorkspaceEdit(raw, workspacePath);
  const validation = validateWorkspaceEdit(parsed, workspacePath, options);
  return {
    safe: validation.safe,
    changedFiles: validation.changedFiles,
    editCount: validation.editCount,
    violations: validation.violations,
    hasResourceOperations: parsed.hasResourceOperations,
    resourceOperations: parsed.resourceOperations,
    unsupportedSchemes: parsed.unsupportedSchemes,
  };
}

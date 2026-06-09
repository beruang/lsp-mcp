import { readFileSync } from "node:fs";
import { createPatch } from "diff";
import { applyTextEdits } from "./applyTextEdits.js";
import type { WorkspaceEdit, TextEdit } from "../safety/workspaceEdit.js";

const DIFF_LINE_CAP = 200;

/**
 * Generate a unified diff for a WorkspaceEdit.
 * Reads current file content from disk, applies edits in memory,
 * and returns a combined unified diff.
 */
export function workspaceEditToDiff(edit: WorkspaceEdit, _workspacePath: string): string {
  const fileMap = new Map<string, TextEdit[]>();

  if (edit.changes) {
    for (const [uri, edits] of Object.entries(edit.changes)) {
      const existing = fileMap.get(uri) ?? [];
      existing.push(...edits);
      fileMap.set(uri, existing);
    }
  }

  if (edit.documentChanges) {
    for (const dc of edit.documentChanges) {
      const existing = fileMap.get(dc.textDocument.uri) ?? [];
      existing.push(...dc.edits);
      fileMap.set(dc.textDocument.uri, existing);
    }
  }

  if (fileMap.size === 0) return "";

  const patches: string[] = [];

  for (const [absPath, edits] of fileMap) {
    let original: string;
    try {
      original = readFileSync(absPath, "utf-8");
    } catch {
      // File doesn't exist (new file creation via rename)
      original = "";
    }

    let modified: string;
    try {
      modified = applyTextEdits(original, edits);
    } catch {
      modified = original;
    }

    const patch = createPatch(absPath, original, modified, "original", "renamed");
    // Cap at DIFF_LINE_CAP lines
    const lines = patch.split("\n");
    if (lines.length > DIFF_LINE_CAP) {
      patches.push(lines.slice(0, DIFF_LINE_CAP).join("\n") + `\n... (truncated, ${lines.length - DIFF_LINE_CAP} more lines)`);
    } else {
      patches.push(patch);
    }
  }

  return patches.join("\n");
}

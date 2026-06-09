import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { safeResolve } from "./paths.js";

export interface Violation {
  type: string;
  message: string;
  filePath?: string;
}

export interface TextEdit {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  newText: string;
}

export interface WorkspaceEdit {
  changes?: Record<string, TextEdit[]>;
  documentChanges?: Array<{
    textDocument: { uri: string; version?: number };
    edits: TextEdit[];
  }>;
}

export interface ValidationResult {
  safe: boolean;
  violations: Violation[];
  changedFiles: string[];
}

export async function validateWorkspaceEdit(
  edit: WorkspaceEdit | null | undefined,
  workspacePath: string
): Promise<ValidationResult> {
  const violations: Violation[] = [];
  const changedFiles: string[] = [];

  if (!edit) {
    violations.push({ type: "null_edit", message: "WorkspaceEdit is null or undefined" });
    return { safe: false, violations, changedFiles: [] };
  }

  const uris = new Set<string>();

  if (edit.changes) {
    for (const uri of Object.keys(edit.changes)) {
      uris.add(uri);
    }
  }

  if (edit.documentChanges) {
    for (const dc of edit.documentChanges) {
      uris.add(dc.textDocument.uri);
    }
  }

  if (uris.size === 0) {
    violations.push({ type: "empty_edit", message: "WorkspaceEdit contains no changes" });
    return { safe: false, violations, changedFiles: [] };
  }

  for (const uri of uris) {
    // Must be file:// scheme
    if (!uri.startsWith("file://")) {
      violations.push({ type: "non_file_scheme", message: `URI scheme not file://: ${uri}` });
      continue;
    }

    let absPath: string;
    try {
      absPath = fileURLToPath(uri);
    } catch {
      violations.push({ type: "invalid_uri", message: `Cannot parse URI: ${uri}` });
      continue;
    }

    // Check it's within workspace
    try {
      await safeResolve(workspacePath, absPath);
    } catch {
      violations.push({ type: "out_of_workspace", message: `Path outside workspace: ${absPath}`, filePath: absPath });
      continue;
    }

    // Check it's not a directory
    try {
      const s = statSync(absPath);
      if (s.isDirectory()) {
        violations.push({ type: "is_directory", message: `Path is a directory: ${absPath}`, filePath: absPath });
        continue;
      }
    } catch {
      // File may not exist yet (rename can create new files) — that's OK
    }

    changedFiles.push(absPath);
  }

  return { safe: violations.length === 0, violations, changedFiles };
}

export function countEdits(edit: WorkspaceEdit): number {
  let count = 0;
  if (edit.changes) {
    for (const edits of Object.values(edit.changes)) {
      count += edits.length;
    }
  }
  if (edit.documentChanges) {
    for (const dc of edit.documentChanges) {
      count += dc.edits.length;
    }
  }
  return count;
}

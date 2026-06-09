import { fileURLToPath } from "node:url";
import { resolve, relative, isAbsolute } from "node:path";

export interface Range {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

export interface NormalizedTextEdit {
  filePath: string;
  range: Range;
  newText: string;
}

export interface ResourceOperation {
  kind: "create" | "rename" | "delete";
  uri: string;
}

export interface ParsedWorkspaceEdit {
  edits: NormalizedTextEdit[];
  changedFiles: string[];
  editCount: number;
  hasResourceOperations: boolean;
  resourceOperations: ResourceOperation[];
  unsupportedSchemes: string[];
}

function uriToFilePath(uri: string): string | null {
  if (!uri.startsWith("file://")) return null;
  try {
    return fileURLToPath(uri);
  } catch {
    return null;
  }
}

function isResourceOperation(kind: string): kind is "create" | "rename" | "delete" {
  return kind === "create" || kind === "rename" || kind === "delete";
}

function isWorkspaceBound(filePath: string, workspacePath: string): boolean {
  const rel = relative(workspacePath, filePath);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

function parseChanges(
  changes: Record<string, Array<{ range: Range; newText: string }>>,
  workspacePath: string,
  unsupportedSchemes: string[]
): NormalizedTextEdit[] {
  const edits: NormalizedTextEdit[] = [];

  for (const [uri, textEdits] of Object.entries(changes)) {
    const filePath = uriToFilePath(uri);
    if (!filePath) {
      unsupportedSchemes.push(uri);
      continue;
    }
    const absPath = resolve(workspacePath, filePath);
    if (!isWorkspaceBound(absPath, workspacePath)) continue;

    for (const edit of textEdits) {
      edits.push({ filePath: absPath, range: edit.range, newText: edit.newText });
    }
  }

  return edits;
}

interface TextDocumentEditEntry {
  textDocument: { uri: string; version?: number };
  edits: Array<{ range: Range; newText: string }>;
}

function parseDocumentChanges(
  documentChanges: Array<{ kind?: string; textDocument?: { uri: string; version?: number }; edits?: Array<{ range: Range; newText: string }> }>,
  workspacePath: string,
  unsupportedSchemes: string[],
  resourceOperations: ResourceOperation[]
): NormalizedTextEdit[] {
  const edits: NormalizedTextEdit[] = [];

  for (const dc of documentChanges) {
    // Resource operations: CreateFile, RenameFile, DeleteFile
    if (dc.kind && isResourceOperation(dc.kind)) {
      const uri = (dc as any).uri ?? "";
      resourceOperations.push({ kind: dc.kind, uri });
      continue;
    }

    // TextDocumentEdit
    if (dc.textDocument && dc.edits) {
      const entry = dc as unknown as TextDocumentEditEntry;
      const filePath = uriToFilePath(entry.textDocument.uri);
      if (!filePath) {
        unsupportedSchemes.push(entry.textDocument.uri);
        continue;
      }
      const absPath = resolve(workspacePath, filePath);
      if (!isWorkspaceBound(absPath, workspacePath)) continue;

      for (const edit of entry.edits) {
        edits.push({ filePath: absPath, range: edit.range, newText: edit.newText });
      }
    }
  }

  return edits;
}

export function extractChangedFiles(edits: NormalizedTextEdit[]): string[] {
  const set = new Set(edits.map((e) => e.filePath));
  return [...set].sort();
}

export function countEdits(edits: NormalizedTextEdit[] | { changes?: Record<string, unknown>; documentChanges?: unknown[] }): number {
  if (Array.isArray(edits)) {
    return edits.length;
  }
  let count = 0;
  if (edits.changes) {
    for (const v of Object.values(edits.changes)) {
      if (Array.isArray(v)) count += v.length;
    }
  }
  if (edits.documentChanges) {
    for (const dc of edits.documentChanges) {
      const e = dc as { edits?: unknown[] };
      if (e.edits && Array.isArray(e.edits)) count += e.edits.length;
    }
  }
  return count;
}

export function parseWorkspaceEdit(
  raw: unknown,
  workspacePath: string
): ParsedWorkspaceEdit {
  const unsupportedSchemes: string[] = [];
  const resourceOperations: ResourceOperation[] = [];
  const edits: NormalizedTextEdit[] = [];

  if (!raw || typeof raw !== "object") {
    return {
      edits: [],
      changedFiles: [],
      editCount: 0,
      hasResourceOperations: false,
      resourceOperations: [],
      unsupportedSchemes: [],
    };
  }

  const obj = raw as Record<string, unknown>;

  if (obj.changes && typeof obj.changes === "object") {
    edits.push(
      ...parseChanges(
        obj.changes as Record<string, Array<{ range: Range; newText: string }>>,
        workspacePath,
        unsupportedSchemes
      )
    );
  }

  if (obj.documentChanges && Array.isArray(obj.documentChanges)) {
    edits.push(
      ...parseDocumentChanges(
        obj.documentChanges as Array<{
          kind?: string;
          textDocument?: { uri: string; version?: number };
          edits?: Array<{ range: Range; newText: string }>;
        }>,
        workspacePath,
        unsupportedSchemes,
        resourceOperations
      )
    );
  }

  return {
    edits,
    changedFiles: extractChangedFiles(edits),
    editCount: edits.length,
    hasResourceOperations: resourceOperations.length > 0,
    resourceOperations,
    unsupportedSchemes: [...new Set(unsupportedSchemes)],
  };
}

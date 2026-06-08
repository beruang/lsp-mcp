import { pathToFileURL, fileURLToPath } from "node:url";
import { relative } from "path";
import { SymbolKind } from "vscode-languageserver-types";

/**
 * Convert an absolute path to a file:// URI string.
 */
export function fileToUri(p: string): string {
  return pathToFileURL(p).toString();
}

/**
 * Convert a file:// URI back to a path relative to the workspace root.
 */
export function uriToRel(workspacePath: string, uri: string): string {
  // Decode file:// URL to filesystem path using the standard Node.js conversion
  const filePath = fileURLToPath(uri);
  return relative(workspacePath, filePath);
}

// ─── Types shared with LSP ───────────────────────────────────────────────────

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface NormalizedLocation {
  filePath: string;
  range: Range;
}

// ─── locationFromLsp ─────────────────────────────────────────────────────────

interface LspLocation {
  uri: string;
  range: Range;
}

interface LspLocationLink {
  targetUri: string;
  targetRange: Range;
  targetSelectionRange?: Range;
}

/**
 * Normalize an LSP Location or LocationLink into a workspace-relative path + range.
 * Returns null for null/undefined input.
 */
export function locationFromLsp(
  workspacePath: string,
  loc: LspLocation | LspLocationLink | null | undefined
): NormalizedLocation | null {
  if (!loc) return null;

  // LocationLink shape: targetUri + targetRange (+ optional targetSelectionRange)
  if ("targetUri" in loc) {
    const filePath = uriToRel(workspacePath, loc.targetUri);
    return { filePath, range: loc.targetRange };
  }

  // Location shape: uri + range
  const filePath = uriToRel(workspacePath, loc.uri);
  return { filePath, range: loc.range };
}

// ─── hoverToString ────────────────────────────────────────────────────────────

type MarkedString = string | { language: string; value: string };

interface MarkupContent {
  kind: "markdown" | "plaintext";
  value: string;
}

interface Hover {
  contents: MarkedString | MarkedString[] | MarkupContent;
  range?: Range;
}

/**
 * Normalize an LSP Hover response into a simple { contents, range? } shape.
 * - MarkupContent → use .value
 * - MarkedString (string) → use as-is
 * - MarkedString[] → join with "\n\n"
 * - null/undefined → { contents: null }
 */
export function hoverToString(
  hover: Hover | null | undefined
): { contents: string | null; range?: Range } {
  if (!hover) return { contents: null };

  const { contents, range } = hover;

  if (!contents) return { contents: null };

  let strContents: string;
  if (typeof contents === "string") {
    strContents = contents;
  } else if (Array.isArray(contents)) {
    strContents = contents
      .map((item) => (typeof item === "string" ? item : item.value))
      .join("\n\n");
  } else {
    strContents = contents.value;
  }

  // Only include range when it is defined
  if (range) {
    return { contents: strContents, range };
  }
  return { contents: strContents };
}

// ─── symbolKindToString ───────────────────────────────────────────────────────

/**
 * Convert an LSP numeric SymbolKind to a lowercase string name.
 * Falls back to String(kind) for unknown values.
 */
export function symbolKindToString(kind: number | string | undefined): string {
  if (typeof kind === "string") return kind.toLowerCase();
  if (kind === undefined) return "unknown";
  // SymbolKind is a reverse-mapped enum: { File: 1, Module: 2, ... }
  // Iterate to find the name for a given numeric value
  for (const [name, value] of Object.entries(SymbolKind)) {
    if (value === kind) return name.toLowerCase();
  }
  return String(kind);
}

// ─── referencesFromLsp ────────────────────────────────────────────────────────

interface LspReferencesParams {
  textDocument: { uri: string };
  position: Position;
  context: { includeDeclaration: boolean };
}

/**
 * Normalize LSP references response into sorted NormalizedLocation array.
 */
export function referencesFromLsp(
  workspacePath: string,
  refs: LspLocation[] | null | undefined
): NormalizedLocation[] {
  if (!refs) return [];
  const normalized = refs
    .map((ref) => locationFromLsp(workspacePath, ref))
    .filter((loc): loc is NonNullable<typeof loc> => loc !== null);

  // Sort by filePath then range.start
  normalized.sort((a, b) => {
    const cmp = a.filePath.localeCompare(b.filePath);
    if (cmp !== 0) return cmp;
    if (a.range.start.line !== b.range.start.line) {
      return a.range.start.line - b.range.start.line;
    }
    return a.range.start.character - b.range.start.character;
  });

  return normalized;
}

// ─── documentSymbolsFromLsp ──────────────────────────────────────────────────

export interface NormalizedDocumentSymbol {
  name: string;
  kind: string;
  range: Range;
  selectionRange?: Range;
  children?: NormalizedDocumentSymbol[];
  containerName?: string;
  detail?: string;
  filePath?: string;
}

// DocumentSymbol shape (hierarchical, has children)
interface LspDocumentSymbol {
  name: string;
  kind: number | string;
  range: Range;
  selectionRange?: Range;
  children?: LspDocumentSymbol[];
  containerName?: string;
  detail?: string;
}

// SymbolInformation shape (flat, has containerName and location)
interface LspSymbolInformation {
  name: string;
  kind: number | string;
  location: LspLocation;
  containerName?: string;
  detail?: string;
}

/**
 * Normalize LSP document symbols response.
 * Handles both DocumentSymbol[] (hierarchical) and SymbolInformation[] (flat) shapes.
 */
export function documentSymbolsFromLsp(
  workspacePath: string,
  syms: LspDocumentSymbol[] | LspSymbolInformation[] | null | undefined
): NormalizedDocumentSymbol[] {
  if (!syms) return [];

  // Detect which shape we're dealing with
  const isDocumentSymbol = (sym: unknown): sym is LspDocumentSymbol => {
    return typeof sym === "object" && sym !== null && "range" in sym && !("location" in sym);
  };

  return syms.map((sym) => {
    if (isDocumentSymbol(sym)) {
      const result: NormalizedDocumentSymbol = {
        name: sym.name,
        kind: symbolKindToString(sym.kind),
        range: sym.range,
      };
      if (sym.selectionRange) result.selectionRange = sym.selectionRange;
      if (sym.children) result.children = documentSymbolsFromLsp(workspacePath, sym.children);
      if (sym.containerName) result.containerName = sym.containerName;
      if (sym.detail) result.detail = sym.detail;
      return result;
    } else {
      // SymbolInformation shape: has location instead of range
      const info = sym as LspSymbolInformation;
      const result: NormalizedDocumentSymbol = {
        name: info.name,
        kind: symbolKindToString(info.kind),
        range: info.location.range,
        containerName: info.containerName,
        filePath: uriToRel(workspacePath, info.location.uri),
      };
      if (info.detail) result.detail = info.detail;
      return result;
    }
  });
}

// ─── workspaceSymbolsFromLsp ──────────────────────────────────────────────────

export interface NormalizedWorkspaceSymbol {
  name: string;
  kind: string;
  filePath?: string;
  range?: Range;
  containerName?: string;
  language: string;
}

/**
 * Normalize LSP workspace symbols response.
 */
export function workspaceSymbolsFromLsp(
  workspacePath: string,
  syms: LspSymbolInformation[] | null | undefined,
  language: string
): NormalizedWorkspaceSymbol[] {
  if (!syms) return [];

  return syms.map((sym) => {
    const result: NormalizedWorkspaceSymbol = {
      name: sym.name,
      kind: symbolKindToString(sym.kind),
      language,
    };
    if (sym.containerName) result.containerName = sym.containerName;
    // SymbolInformation has a location with uri and range
    if (sym.location) {
      result.filePath = uriToRel(workspacePath, sym.location.uri);
      result.range = sym.location.range;
    }
    return result;
  });
}

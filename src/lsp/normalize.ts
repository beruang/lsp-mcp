import { pathToFileURL, fileURLToPath } from "node:url";
import { relative } from "path";

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

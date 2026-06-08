import type { LspClient } from "../lsp/LspClient.js";
import { hoverToString, locationFromLsp, referencesFromLsp, documentSymbolsFromLsp } from "../lsp/normalize.js";
import type { Position, NormalizedLocation, NormalizedDocumentSymbol } from "../lsp/normalize.js";
import { LIMITS, clampResults } from "../safety/limits.js";

export interface InspectSymbolInput {
  filePath: string;
  position: Position;
  maxReferences?: number;
}

export interface InspectSymbolOutput {
  filePath: string;
  position: Position;
  hover: { contents: string | null; range?: { start: Position; end: Position } } | null;
  definitions: NormalizedLocation[];
  references: {
    referenceCount: number;
    returned: number;
    truncated: boolean;
    items: NormalizedLocation[];
  };
  enclosingSymbols: Array<{ name: string; kind: string; range: { start: Position; end: Position } }>;
  riskHints: string[];
  warnings?: string[];
}

interface EnclosingSymbol {
  name: string;
  kind: string;
  range: { start: Position; end: Position };
}

export async function inspectSymbol(
  client: LspClient,
  workspacePath: string,
  uri: string,
  filePath: string,
  position: Position,
  maxReferences: number = LIMITS.REFERENCES_MAX
): Promise<InspectSymbolOutput> {
  const warnings: string[] = [];
  let hover: InspectSymbolOutput["hover"] = null;
  let definitions: NormalizedLocation[] = [];
  let referenceItems: NormalizedLocation[] = [];
  let allDocumentSymbols: NormalizedDocumentSymbol[] = [];

  // ── 1. Hover (shortest timeout first) ─────────────────────────────────────
  try {
    const rawHover = await client.request("textDocument/hover", {
      textDocument: { uri }, position,
    }, LIMITS.TIMEOUTS.HOVER_MS) as any;
    hover = hoverToString(rawHover);
  } catch (err) {
    warnings.push(`hover failed: ${String(err)}`);
  }

  // ── 2. Definition ─────────────────────────────────────────────────────────
  try {
    const rawDefs = await client.request("textDocument/definition", {
      textDocument: { uri }, position,
    }, LIMITS.TIMEOUTS.DEFINITION_MS) as any[];

    if (rawDefs && Array.isArray(rawDefs)) {
      definitions = rawDefs
        .map((loc) => locationFromLsp(workspacePath, loc))
        .filter((loc): loc is NonNullable<typeof loc> => loc !== null);
    }
  } catch (err) {
    warnings.push(`definition failed: ${String(err)}`);
  }

  // ── 3. References ─────────────────────────────────────────────────────────
  try {
    const rawRefs = await client.request("textDocument/references", {
      textDocument: { uri },
      position,
      context: { includeDeclaration: true },
    }, LIMITS.TIMEOUTS.REFERENCES_MS) as any[];

    if (rawRefs && Array.isArray(rawRefs)) {
      referenceItems = referencesFromLsp(workspacePath, rawRefs);
    }
  } catch (err) {
    warnings.push(`references failed: ${String(err)}`);
  }

  // ── 4. Document Symbols ───────────────────────────────────────────────────
  try {
    const rawSyms = await client.request("textDocument/documentSymbol", {
      textDocument: { uri },
    }, LIMITS.TIMEOUTS.DOCUMENT_SYMBOLS_MS) as any;
    allDocumentSymbols = documentSymbolsFromLsp(workspacePath, rawSyms);
  } catch (err) {
    warnings.push(`documentSymbols failed: ${String(err)}`);
  }

  // ── 5. Enclosing symbols ──────────────────────────────────────────────────
  const enclosingSymbols = findEnclosingSymbols(allDocumentSymbols, position);

  // ── 6. Risk hints ─────────────────────────────────────────────────────────
  const riskHints = computeRiskHints({
    referenceItems,
    definitions,
    filePath,
    enclosingSymbols,
  });

  const refClamped = clampResults(referenceItems, maxReferences);

  const result: InspectSymbolOutput = {
    filePath,
    position,
    hover,
    definitions,
    references: {
      referenceCount: referenceItems.length,
      returned: refClamped.returned,
      truncated: refClamped.truncated,
      items: refClamped.items,
    },
    enclosingSymbols,
    riskHints,
  };

  if (warnings.length > 0) {
    result.warnings = warnings;
  }

  return result;
}

function findEnclosingSymbols(
  symbols: NormalizedDocumentSymbol[],
  position: Position
): EnclosingSymbol[] {
  const result: EnclosingSymbol[] = [];

  for (const sym of symbols) {
    if (containsPosition(sym.range, position)) {
      result.push({
        name: sym.name,
        kind: sym.kind,
        range: sym.range,
      });

      if (sym.children && sym.children.length > 0) {
        const childEnclosing = findEnclosingSymbols(sym.children, position);
        result.push(...childEnclosing);
      }
      // Stop at first match — we go depth-first (outermost first)
      break;
    }
  }

  return result;
}

function containsPosition(range: { start: Position; end: Position }, position: Position): boolean {
  if (position.line < range.start.line) return false;
  if (position.line > range.end.line) return false;
  if (position.line === range.start.line && position.character < range.start.character) return false;
  if (position.line === range.end.line && position.character > range.end.character) return false;
  return true;
}

interface RiskContext {
  referenceItems: NormalizedLocation[];
  definitions: NormalizedLocation[];
  filePath: string;
  enclosingSymbols: EnclosingSymbol[];
}

function computeRiskHints(ctx: RiskContext): string[] {
  const hints: string[] = [];

  // References count hints
  if (ctx.referenceItems.length === 0) {
    hints.push("Symbol has no references.");
  } else {
    const files = new Set(ctx.referenceItems.map((r) => r.filePath));
    if (files.size > 1) {
      hints.push("Symbol has references across multiple files.");
    } else if (files.size === 1) {
      hints.push(`Symbol has references in ${[...files][0]}.`);
    }
  }

  // Definition is outside current file
  if (ctx.definitions.length > 0) {
    const hasOutsideDef = ctx.definitions.some((d) => d.filePath !== ctx.filePath);
    if (hasOutsideDef) {
      hints.push("Definition is outside current file.");
    }
  }

  // Enclosing symbol hints
  for (const enc of ctx.enclosingSymbols) {
    if (enc.kind === "class" || enc.kind === "interface") {
      hints.push("Symbol appears inside a public class/interface.");
      break;
    }
  }

  // Top-level symbol (no enclosing) → likely exported
  if (ctx.enclosingSymbols.length === 0) {
    hints.push("Symbol appears to be exported.");
  }

  return hints;
}

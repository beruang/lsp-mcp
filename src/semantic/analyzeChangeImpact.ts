import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { LspClientManager } from "../lsp/LspClientManager.js";
import { safeResolve } from "../safety/paths.js";
import { routeLanguage } from "../config/languageServers.js";
import { fileToUri, hoverToString, locationFromLsp, referencesFromLsp } from "../lsp/normalize.js";
import { ensureOpen } from "../lsp/documentStore.js";
import { diagnosticsCache } from "../lsp/diagnosticsCache.js";
import { LIMITS } from "../safety/limits.js";
import { toolError, ErrorCodes } from "../mcp/toolErrors.js";
import { classifyRisk, generateRecommendations } from "./riskHeuristics.js";

export interface AnalyzeChangeImpactInput {
  filePath: string;
  position: { line: number; character: number };
  changeKind?: "rename" | "signature_change" | "behavior_change" | "type_change" | "visibility_change" | "delete_symbol" | "move_symbol" | "unknown";
  maxReferences?: number;
  includeCallers?: boolean;
  includeCallees?: boolean;
  includeImplementations?: boolean;
}

export async function analyzeChangeImpact(
  clientManager: LspClientManager,
  workspacePath: string,
  input: AnalyzeChangeImpactInput
) {
  const changeKind = input.changeKind ?? "unknown";
  const maxReferences = input.maxReferences ?? LIMITS.CHANGE_IMPACT_REFS_MAX;
  const includeCallers = input.includeCallers ?? true;
  const includeCallees = input.includeCallees ?? true;
  const includeImplementations = input.includeImplementations ?? true;

  // Validate path
  let resolvedPath: string;
  try { resolvedPath = await safeResolve(workspacePath, input.filePath); } catch {
    return { error: toolError(ErrorCodes.PATH_OUTSIDE_WORKSPACE, `Path outside workspace: ${input.filePath}`) };
  }

  const ext = extname(resolvedPath);
  const lang = routeLanguage(ext);
  if (!lang) return { error: toolError(ErrorCodes.UNSUPPORTED_LANGUAGE, `No LSP server for: ${ext}`) };

  try { await stat(resolvedPath); } catch {
    return { error: toolError(ErrorCodes.FILE_NOT_FOUND, `File not found: ${resolvedPath}`) };
  }

  const rootUri = fileToUri(workspacePath);
  const client = await clientManager.getClientForLanguage(lang, { workspacePath, rootUri });
  if (!client) return { error: toolError(ErrorCodes.LSP_SERVER_UNAVAILABLE, `No LSP server for: ${lang}`) };

  const { uri } = await ensureOpen(client, resolvedPath, lang);
  const caps = client.getCapabilities();

  const result: Record<string, unknown> = {
    symbol: { filePath: resolvedPath, position: input.position },
  };

  // ── Core: hover + definition + references + diagnostics ──────────────────

  // Hover
  try {
    const raw = await client.request("textDocument/hover", {
      textDocument: { uri },
      position: input.position,
    }, LIMITS.TIMEOUTS.HOVER_MS) as any;
    result.symbol = { ...result.symbol as object, hover: hoverToString(raw).contents };
  } catch { result.symbol = { ...result.symbol as object, hover: null }; }

  // Definitions
  try {
    const raw = await client.request("textDocument/definition", {
      textDocument: { uri },
      position: input.position,
    }, LIMITS.TIMEOUTS.DEFINITION_MS) as any;
    const locs: unknown[] = [];
    if (Array.isArray(raw)) {
      for (const item of raw) { const loc = locationFromLsp(workspacePath, item); if (loc) locs.push(loc); }
    } else if (raw) { const loc = locationFromLsp(workspacePath, raw); if (loc) locs.push(loc); }
    result.definitions = locs;
  } catch { result.definitions = []; }

  // References
  let refCount = 0;
  let refFiles: string[] = [];
  let refTruncated = false;
  try {
    const raw = await client.request("textDocument/references", {
      textDocument: { uri },
      position: input.position,
      context: { includeDeclaration: false },
    }, LIMITS.TIMEOUTS.REFERENCES_MS) as any;
    const locs = referencesFromLsp(workspacePath, raw);
    refCount = locs.length;
    refTruncated = locs.length > maxReferences;
    const limited = locs.slice(0, maxReferences);
    refFiles = [...new Set(limited.map(l => l.filePath))];
    result.references = { count: refCount, returned: Math.min(refCount, maxReferences), truncated: refTruncated, files: refFiles };
  } catch { result.references = { count: 0, returned: 0, truncated: false, files: [] }; }

  // Diagnostics near symbol
  try {
    const allDiags = diagnosticsCache.all();
    result.diagnosticsNearSymbol = allDiags.filter(d => d.filePath === resolvedPath);
  } catch { result.diagnosticsNearSymbol = []; }

  // ── Optional: type definitions ───────────────────────────────────────────

  if (caps.typeDefinitionProvider) {
    try {
      const raw = await client.request("textDocument/typeDefinition", {
        textDocument: { uri },
        position: input.position,
      }, LIMITS.TIMEOUTS.TYPE_DEFINITION_MS) as any;
      const locs: unknown[] = [];
      if (Array.isArray(raw)) {
        for (const item of raw) { const loc = locationFromLsp(workspacePath, item); if (loc) locs.push(loc); }
      } else if (raw) { const loc = locationFromLsp(workspacePath, raw); if (loc) locs.push(loc); }
      result.typeDefinitions = locs;
    } catch { result.typeDefinitions = []; }
  } else {
    result.typeDefinitions = [];
  }

  // ── Optional: implementations ────────────────────────────────────────────

  let implCount = 0;
  if (includeImplementations && caps.implementationProvider) {
    try {
      const raw = await client.request("textDocument/implementation", {
        textDocument: { uri },
        position: input.position,
      }, LIMITS.TIMEOUTS.IMPLEMENTATION_MS) as any;
      const locs: unknown[] = [];
      if (Array.isArray(raw)) {
        for (const item of raw) { const loc = locationFromLsp(workspacePath, item); if (loc) locs.push(loc); }
      } else if (raw) { const loc = locationFromLsp(workspacePath, raw); if (loc) locs.push(loc); }
      result.implementations = locs;
      implCount = locs.length;
    } catch { result.implementations = []; }
  } else {
    result.implementations = [];
  }

  // ── Optional: call hierarchy ─────────────────────────────────────────────

  if ((includeCallers || includeCallees) && caps.callHierarchyProvider) {
    try {
      const chRaw = await client.request("textDocument/prepareCallHierarchy", {
        textDocument: { uri },
        position: input.position,
      }, LIMITS.TIMEOUTS.PREPARE_CALL_HIERARCHY_MS) as any;

      const items = Array.isArray(chRaw) ? chRaw : (chRaw ? [chRaw] : []);
      const cacheModule = await import("../hierarchy/callHierarchyCache.js");
      const cache = cacheModule.callHierarchyCache;

      let incomingCount = 0;
      let outgoingCount = 0;
      const incomingSample: unknown[] = [];
      const outgoingSample: unknown[] = [];

      if (items.length > 0 && items[0]) {
        const normalized = {
          id: "",
          name: items[0].name ?? "",
          kind: "function",
          filePath: resolvedPath,
          range: items[0].range ?? { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
          selectionRange: items[0].selectionRange ?? items[0].range ?? { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        };
        cache.set(items[0], normalized, workspacePath, lang);

        if (includeCallers) {
          try {
            const incoming = await client.request("callHierarchy/incomingCalls", { item: items[0] }, LIMITS.TIMEOUTS.INCOMING_CALLS_MS) as any;
            if (Array.isArray(incoming)) {
              incomingCount = incoming.length;
              incomingSample.push(...incoming.slice(0, 5).map((entry: any) => ({
                name: entry.from?.name ?? "unknown",
                kind: entry.from?.kind ?? "unknown",
                fromRanges: (entry.fromRanges ?? []).slice(0, 3),
              })));
            }
          } catch { /* optional */ }
        }

        if (includeCallees) {
          try {
            const outgoing = await client.request("callHierarchy/outgoingCalls", { item: items[0] }, LIMITS.TIMEOUTS.OUTGOING_CALLS_MS) as any;
            if (Array.isArray(outgoing)) {
              outgoingCount = outgoing.length;
              outgoingSample.push(...outgoing.slice(0, 5).map((entry: any) => ({
                name: entry.to?.name ?? "unknown",
                kind: entry.to?.kind ?? "unknown",
                fromRanges: (entry.fromRanges ?? []).slice(0, 3),
              })));
            }
          } catch { /* optional */ }
        }

        // item cached via set() above
      }

      result.callHierarchy = {
        available: true,
        incomingCount,
        outgoingCount,
        incomingSample,
        outgoingSample,
      };
    } catch {
      result.callHierarchy = { available: false, reason: "call hierarchy request failed" };
    }
  } else {
    result.callHierarchy = { available: false, reason: "call hierarchy not supported or not requested" };
  }

  // ── Risk assessment ──────────────────────────────────────────────────────

  const definitions = (result.definitions as unknown[] | undefined) ?? [];
  const definitionsOutsideFile = definitions.some((d: any) => d.filePath !== resolvedPath);

  const risks = classifyRisk({
    referenceCount: refCount,
    affectedFiles: refFiles.length,
    incomingCallers: (result.callHierarchy as any)?.incomingCount ?? 0,
    implementationCount: implCount,
    hasNearbyDiagnostics: ((result.diagnosticsNearSymbol as unknown[] | undefined) ?? []).length > 0,
    definitionsOutsideFile,
  });

  result.risks = risks;
  result.recommendations = generateRecommendations(risks, changeKind);

  return result;
}

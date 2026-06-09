import { stat, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LspClientManager } from "../lsp/LspClientManager.js";
import { languageServers, routeLanguage } from "../config/languageServers.js";
import { safeResolve } from "../safety/paths.js";
import { LIMITS, clampResults } from "../safety/limits.js";
import { ensureOpen } from "../lsp/documentStore.js";
import { locationFromLsp, hoverToString, fileToUri, referencesFromLsp, documentSymbolsFromLsp, workspaceSymbolsFromLsp } from "../lsp/normalize.js";
import { diagnosticsCache, waitConfig } from "../lsp/diagnosticsCache.js";
import type { NormalizedDiagnostic } from "../lsp/diagnosticsCache.js";
import { buildDiagnosticsSummary } from "../composite/diagnosticsSummary.js";
import { validateWorkspaceEdit, countEdits } from "../safety/workspaceEdit.js";
import { workspaceEditToDiff } from "../diff/workspaceEditToDiff.js";
import { inspectSymbol } from "../composite/inspectSymbol.js";
import { toolError, ErrorCodes } from "./toolErrors.js";
import { buildWorkspaceEditPreview, buildValidateWorkspaceEditResult } from "../workspaceEdit/previewWorkspaceEdit.js";
import { WorkspaceEditPreviewInputSchema, ValidateWorkspaceEditInputSchema } from "./schemas.js";
import { formatDocument, formatRange } from "../formatting/formatPreview.js";
import { waitForDiagnostics } from "../diagnostics/waitForDiagnostics.js";
import { snapshotStore } from "../diagnostics/snapshotStore.js";
import { compareDiagnostics } from "../diagnostics/compareDiagnostics.js";
import { prepareRename } from "../refactor/prepareRename.js";
import { codeActionCache } from "../codeActions/codeActionCache.js";
import { normalizeCodeAction } from "../codeActions/normalizeCodeAction.js";

/**
 * Shared context passed to every tool registration.
 * Phase-1 only needs the workspace root; later phases will extend this.
 */
export interface ToolContext {
  workspacePath: string;
}

/** Module-level LSP client manager (singleton per server lifetime). */
const clientManager = new LspClientManager();

/**
 * Register all MCP tools exposed by the server.
 *
 * This is the single registration entrypoint for the project. Subsequent
 * phases add more tools here using the same additive pattern (one
 * `server.tool(...)` call per tool).
 */
export function registerAllTools(
  server: McpServer,
  ctx: ToolContext
): void {
  // Health check tool — reports server status and available capabilities.
  server.tool(
    "lsp_health_check",
    "Return server health status and available LSP capabilities across all registered language servers.",
    {},
    async () => {
      const { workspacePath } = ctx;
      const rootUri = fileToUri(workspacePath);

      const languageStatuses: Record<string, unknown> = {};
      for (const [lang] of Object.entries(languageServers)) {
        try {
          const client = await clientManager.getClientForLanguage(lang, { workspacePath, rootUri });
          if (client) {
            const caps = client.getCapabilities();
            languageStatuses[lang] = {
              connected: true,
              capabilities: {
                hover: !!caps.hoverProvider,
                definition: !!caps.definitionProvider,
                references: !!caps.referencesProvider,
                documentSymbols: !!caps.documentSymbolProvider,
                workspaceSymbols: !!caps.workspaceSymbolProvider,
                diagnostics: !!caps.diagnosticProvider,
                rename: !!caps.renameProvider,
                prepareRename: typeof caps.renameProvider === "object" && !!(caps.renameProvider as Record<string, unknown>).prepareProvider,
                codeActions: !!caps.raw.codeActionProvider,
                codeActionResolve: typeof caps.raw.codeActionProvider === "object" && !!(caps.raw.codeActionProvider as Record<string, unknown>).resolveProvider,
                formatting: !!caps.raw.documentFormattingProvider,
                rangeFormatting: !!caps.raw.documentRangeFormattingProvider,
                organizeImports: true, // via source.organizeImports code action
              },
            };
          } else {
            languageStatuses[lang] = { connected: false };
          }
        } catch {
          languageStatuses[lang] = { connected: false, error: "Failed to connect" };
        }
      }

      const payload = {
        ok: true,
        version: "2.0.0",
        workspace: workspacePath,
        v2Tools: [
          "lsp_workspace_edit_preview",
          "lsp_validate_workspace_edit",
          "lsp_prepare_rename",
          "lsp_code_actions_preview",
          "lsp_resolve_code_action",
          "lsp_format_preview",
          "lsp_range_format_preview",
          "lsp_organize_imports_preview",
          "lsp_wait_for_diagnostics",
          "lsp_snapshot_diagnostics",
          "lsp_compare_diagnostics",
        ],
        languages: languageStatuses,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      };
    }
  );

  // ── lsp_hover ───────────────────────────────────────────────────────────────

  server.tool(
    "lsp_hover",
    "Request textDocument/hover from the LSP server and return normalized contents.",
    {
      filePath: z.string().describe("Absolute or workspace-relative path to the file."),
      position: z.object({
        line: z.number().int().nonnegative().describe("Zero-based line number."),
        character: z.number().int().nonnegative().describe("Zero-based UTF-16 character offset."),
      }).describe("Line/character position (zero-based) in the file."),
    },
    async (args: { filePath: string; position: { line: number; character: number } }) => {
      const { filePath, position } = args;
      const { workspacePath } = ctx;

      // 1. Validate filePath is inside workspace
      let resolvedPath: string;
      try {
        resolvedPath = await safeResolve(workspacePath, filePath);
      } catch {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.PATH_OUTSIDE_WORKSPACE, `Path is outside workspace: ${filePath}`), null, 2) }],
        };
      }

      // 2. Route extension to language
      const ext = extname(resolvedPath);
      const lang = routeLanguage(ext);
      if (!lang) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.UNSUPPORTED_LANGUAGE, `No LSP server registered for extension: ${ext}`), null, 2) }],
        };
      }

      // 3. Ensure file exists on disk
      try {
        await stat(resolvedPath);
      } catch (err: unknown) {
        if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.FILE_NOT_FOUND, `File not found: ${resolvedPath}`), null, 2) }],
          };
        }
        throw err;
      }

      // 4. Get or create LSP client
      const rootUri = fileToUri(workspacePath);
      const client = await clientManager.getClientForLanguage(lang, { workspacePath, rootUri });
      if (!client) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_SERVER_UNAVAILABLE, `No LSP server available for language: ${lang}`), null, 2) }],
        };
      }

      // 5. Ensure document is open
      const { uri } = await ensureOpen(client, resolvedPath, lang);

      // 6. Check capability
      const caps = client.getCapabilities();
      if (!caps.hoverProvider) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_CAPABILITY_UNSUPPORTED, "hoverProvider not supported by this LSP server"), null, 2) }],
        };
      }

      // 7. Send hover request
      let hoverResult: ReturnType<typeof hoverToString>;
      try {
        const raw = await client.request("textDocument/hover", { textDocument: { uri }, position }, LIMITS.TIMEOUTS.HOVER_MS) as any;
        hoverResult = hoverToString(raw);
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_REQUEST_FAILED, String(err)), null, 2) }],
        };
      }

      const payload = {
        filePath: resolvedPath,
        position,
        contents: hoverResult.contents,
        ...(hoverResult.range ? { range: hoverResult.range } : {}),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      };
    }
  );

  // ── lsp_definition ─────────────────────────────────────────────────────────

  server.tool(
    "lsp_definition",
    "Request textDocument/definition from the LSP server and return normalized locations.",
    {
      filePath: z.string().describe("Absolute or workspace-relative path to the file."),
      position: z.object({
        line: z.number().int().nonnegative().describe("Zero-based line number."),
        character: z.number().int().nonnegative().describe("Zero-based UTF-16 character offset."),
      }).describe("Line/character position (zero-based) in the file."),
      maxResults: z.number().int().nonnegative().default(50).describe("Maximum number of results to return."),
    },
    async (args: { filePath: string; position: { line: number; character: number }; maxResults?: number }) => {
      const { filePath, position, maxResults = 50 } = args;
      const { workspacePath } = ctx;

      // 1. Validate filePath is inside workspace
      let resolvedPath: string;
      try {
        resolvedPath = await safeResolve(workspacePath, filePath);
      } catch {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.PATH_OUTSIDE_WORKSPACE, `Path is outside workspace: ${filePath}`), null, 2) }],
        };
      }

      // 2. Route extension to language
      const ext = extname(resolvedPath);
      const lang = routeLanguage(ext);
      if (!lang) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.UNSUPPORTED_LANGUAGE, `No LSP server registered for extension: ${ext}`), null, 2) }],
        };
      }

      // 3. Ensure file exists on disk
      try {
        await stat(resolvedPath);
      } catch (err: unknown) {
        if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.FILE_NOT_FOUND, `File not found: ${resolvedPath}`), null, 2) }],
          };
        }
        throw err;
      }

      // 4. Get or create LSP client
      const rootUri = fileToUri(workspacePath);
      const client = await clientManager.getClientForLanguage(lang, { workspacePath, rootUri });
      if (!client) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_SERVER_UNAVAILABLE, `No LSP server available for language: ${lang}`), null, 2) }],
        };
      }

      // 5. Ensure document is open
      const { uri } = await ensureOpen(client, resolvedPath, lang);

      // 6. Check capability
      const caps = client.getCapabilities();
      if (!caps.definitionProvider) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_CAPABILITY_UNSUPPORTED, "definitionProvider not supported by this LSP server"), null, 2) }],
        };
      }

      // 7. Send definition request
      let rawLocs: unknown[];
      try {
        rawLocs = await client.request("textDocument/definition", { textDocument: { uri }, position }, LIMITS.TIMEOUTS.DEFINITION_MS) as any[];
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_REQUEST_FAILED, String(err)), null, 2) }],
        };
      }

      if (!rawLocs || !Array.isArray(rawLocs)) {
        rawLocs = [];
      }

      const normalized = rawLocs
        .map((loc) => locationFromLsp(workspacePath, loc as Parameters<typeof locationFromLsp>[1]))
        .filter((loc): loc is NonNullable<typeof loc> => loc !== null);

      const truncated = normalized.length > maxResults;
      const items = normalized.slice(0, maxResults);

      const payload = {
        locations: items,
        returned: items.length,
        truncated,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      };
    }
  );

  // ── lsp_references ─────────────────────────────────────────────────────────

  server.tool(
    "lsp_references",
    "Request textDocument/references from the LSP server and return normalized locations.",
    {
      filePath: z.string().describe("Absolute or workspace-relative path to the file."),
      position: z.object({
        line: z.number().int().nonnegative().describe("Zero-based line number."),
        character: z.number().int().nonnegative().describe("Zero-based UTF-16 character offset."),
      }).describe("Line/character position (zero-based) in the file."),
      includeDeclaration: z.boolean().default(true).describe("Whether to include the declaration in the results."),
      maxResults: z.number().int().nonnegative().default(LIMITS.REFERENCES_MAX).describe("Maximum number of results to return."),
    },
    async (args: { filePath: string; position: { line: number; character: number }; includeDeclaration?: boolean; maxResults?: number }) => {
      const { filePath, position, includeDeclaration = true, maxResults = LIMITS.REFERENCES_MAX } = args;
      const { workspacePath } = ctx;

      // 1. Validate filePath is inside workspace
      let resolvedPath: string;
      try {
        resolvedPath = await safeResolve(workspacePath, filePath);
      } catch {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.PATH_OUTSIDE_WORKSPACE, `Path is outside workspace: ${filePath}`), null, 2) }],
        };
      }

      // 2. Route extension to language
      const ext = extname(resolvedPath);
      const lang = routeLanguage(ext);
      if (!lang) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.UNSUPPORTED_LANGUAGE, `No LSP server registered for extension: ${ext}`), null, 2) }],
        };
      }

      // 3. Ensure file exists on disk
      try {
        await stat(resolvedPath);
      } catch (err: unknown) {
        if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.FILE_NOT_FOUND, `File not found: ${resolvedPath}`), null, 2) }],
          };
        }
        throw err;
      }

      // 4. Get or create LSP client
      const rootUri = fileToUri(workspacePath);
      const client = await clientManager.getClientForLanguage(lang, { workspacePath, rootUri });
      if (!client) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_SERVER_UNAVAILABLE, `No LSP server available for language: ${lang}`), null, 2) }],
        };
      }

      // 5. Ensure document is open
      const { uri } = await ensureOpen(client, resolvedPath, lang);

      // 6. Check capability
      const caps = client.getCapabilities();
      if (!caps.referencesProvider) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_CAPABILITY_UNSUPPORTED, "referencesProvider not supported by this LSP server"), null, 2) }],
        };
      }

      // 7. Send references request
      let rawRefs: unknown[];
      try {
        rawRefs = await client.request("textDocument/references", {
          textDocument: { uri },
          position,
          context: { includeDeclaration },
        }, LIMITS.TIMEOUTS.REFERENCES_MS) as any[];
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_REQUEST_FAILED, String(err)), null, 2) }],
        };
      }

      if (!rawRefs || !Array.isArray(rawRefs)) {
        rawRefs = [];
      }

      const normalized = referencesFromLsp(workspacePath, rawRefs as Parameters<typeof referencesFromLsp>[1]);
      const { items, truncated, returned } = clampResults(normalized, maxResults);

      const payload = {
        references: items,
        referenceCount: normalized.length,
        returned,
        truncated,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      };
    }
  );

  // ── lsp_document_symbols ───────────────────────────────────────────────────

  server.tool(
    "lsp_document_symbols",
    "Request textDocument/documentSymbol from the LSP server and return normalized symbols.",
    {
      filePath: z.string().describe("Absolute or workspace-relative path to the file."),
    },
    async (args: { filePath: string }) => {
      const { filePath } = args;
      const { workspacePath } = ctx;

      // 1. Validate filePath is inside workspace
      let resolvedPath: string;
      try {
        resolvedPath = await safeResolve(workspacePath, filePath);
      } catch {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.PATH_OUTSIDE_WORKSPACE, `Path is outside workspace: ${filePath}`), null, 2) }],
        };
      }

      // 2. Route extension to language
      const ext = extname(resolvedPath);
      const lang = routeLanguage(ext);
      if (!lang) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.UNSUPPORTED_LANGUAGE, `No LSP server registered for extension: ${ext}`), null, 2) }],
        };
      }

      // 3. Ensure file exists on disk
      try {
        await stat(resolvedPath);
      } catch (err: unknown) {
        if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.FILE_NOT_FOUND, `File not found: ${resolvedPath}`), null, 2) }],
          };
        }
        throw err;
      }

      // 4. Get or create LSP client
      const rootUri = fileToUri(workspacePath);
      const client = await clientManager.getClientForLanguage(lang, { workspacePath, rootUri });
      if (!client) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_SERVER_UNAVAILABLE, `No LSP server available for language: ${lang}`), null, 2) }],
        };
      }

      // 5. Ensure document is open
      const { uri } = await ensureOpen(client, resolvedPath, lang);

      // 6. Check capability
      const caps = client.getCapabilities();
      if (!caps.documentSymbolProvider) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_CAPABILITY_UNSUPPORTED, "documentSymbolProvider not supported by this LSP server"), null, 2) }],
        };
      }

      // 7. Send document symbols request
      let rawSyms: unknown;
      try {
        rawSyms = await client.request("textDocument/documentSymbol", { textDocument: { uri } }, LIMITS.TIMEOUTS.DOCUMENT_SYMBOLS_MS) as any;
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_REQUEST_FAILED, String(err)), null, 2) }],
        };
      }

      const symbols = documentSymbolsFromLsp(workspacePath, rawSyms as Parameters<typeof documentSymbolsFromLsp>[1]);

      const payload = {
        filePath: resolvedPath,
        symbols,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      };
    }
  );

  // ── lsp_workspace_symbols ──────────────────────────────────────────────────

  server.tool(
    "lsp_workspace_symbols",
    "Request workspace/symbol from the LSP server and return normalized symbols.",
    {
      query: z.string().describe("Search query string."),
      language: z.enum(["typescript", "python", "auto"]).default("auto").describe("Language to search in, or 'auto' for all."),
      maxResults: z.number().int().nonnegative().default(LIMITS.WORKSPACE_SYMBOLS_MAX).describe("Maximum number of results to return."),
    },
    async (args: { query: string; language?: "typescript" | "python" | "auto"; maxResults?: number }) => {
      const { query, language = "auto", maxResults = LIMITS.WORKSPACE_SYMBOLS_MAX } = args;
      const { workspacePath } = ctx;

      // 1. Validate query
      if (!query || query.trim() === "") {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_REQUEST_FAILED, "Query cannot be empty"), null, 2) }],
        };
      }

      //2. Get clients to query
      const rootUri = fileToUri(workspacePath);
      const allSymbols: ReturnType<typeof workspaceSymbolsFromLsp> = [];

      if (language === "auto") {
        // Query all registered language servers
        for (const [lang] of Object.entries(languageServers)) {
          const client = await clientManager.getClientForLanguage(lang, { workspacePath, rootUri });
          if (!client) continue;

          const caps = client.getCapabilities();
          if (!caps.workspaceSymbolProvider) continue;

          let rawSyms: unknown;
          try {
            rawSyms = await client.request("workspace/symbol", { query }, LIMITS.TIMEOUTS.WORKSPACE_SYMBOLS_MS) as any;
          } catch {
            continue;
          }

          const syms = workspaceSymbolsFromLsp(workspacePath, rawSyms as Parameters<typeof workspaceSymbolsFromLsp>[1], lang);
          allSymbols.push(...syms);
        }
      } else {
        // Query specific language
        const client = await clientManager.getClientForLanguage(language, { workspacePath, rootUri });
        if (!client) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_SERVER_UNAVAILABLE, `No LSP server available for language: ${language}`), null, 2) }],
          };
        }

        const caps = client.getCapabilities();
        if (!caps.workspaceSymbolProvider) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_CAPABILITY_UNSUPPORTED, "workspaceSymbolProvider not supported by this LSP server"), null, 2) }],
          };
        }

        let rawSyms: unknown;
        try {
          rawSyms = await client.request("workspace/symbol", { query }, LIMITS.TIMEOUTS.WORKSPACE_SYMBOLS_MS) as any;
        } catch (err: unknown) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_REQUEST_FAILED, String(err)), null, 2) }],
          };
        }

        const syms = workspaceSymbolsFromLsp(workspacePath, rawSyms as Parameters<typeof workspaceSymbolsFromLsp>[1], language);
        allSymbols.push(...syms);
      }

      const { items, truncated, returned } = clampResults(allSymbols, maxResults);

      const payload = {
        symbols: items,
        returned,
        truncated,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      };
    }
  );

  // ── lsp_diagnostics ──────────────────────────────────────────────────────────

  server.tool(
    "lsp_diagnostics",
    "Return cached diagnostics for a file or the whole workspace. Triggers warm-up if workspaceWide is requested and cache is empty.",
    {
      filePath: z.string().optional().describe("Absolute or workspace-relative path to a file."),
      workspaceWide: z.boolean().default(false).describe("If true, warm the workspace and return diagnostics for all files."),
      severity: z.enum(["error", "warning", "info", "hint", "all"]).default("all").describe("Filter by severity."),
      maxResults: z.number().int().nonnegative().default(LIMITS.DIAGNOSTICS_MAX).describe("Maximum number of results to return."),
    },
    async (args: { filePath?: string; workspaceWide?: boolean; severity?: string; maxResults?: number }) => {
      const { filePath, workspaceWide = false, severity = "all", maxResults = LIMITS.DIAGNOSTICS_MAX } = args;
      const { workspacePath } = ctx;

      const startMs = Date.now();
      let waitedMs = 0;
      let warmedUp = false;

      if (filePath) {
        // Single-file path
        let resolvedPath: string;
        try {
          resolvedPath = await safeResolve(workspacePath, filePath);
        } catch {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.PATH_OUTSIDE_WORKSPACE, `Path is outside workspace: ${filePath}`), null, 2) }],
          };
        }

        const ext = extname(resolvedPath);
        const lang = routeLanguage(ext);
        if (!lang) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.UNSUPPORTED_LANGUAGE, `No LSP server registered for extension: ${ext}`), null, 2) }],
          };
        }

        try {
          await stat(resolvedPath);
        } catch (err: unknown) {
          if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
            return {
              content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.FILE_NOT_FOUND, `File not found: ${resolvedPath}`), null, 2) }],
            };
          }
          throw err;
        }

        const rootUri = fileToUri(workspacePath);
        const client = await clientManager.getClientForLanguage(lang, { workspacePath, rootUri });
        if (!client) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_SERVER_UNAVAILABLE, `No LSP server available for language: ${lang}`), null, 2) }],
          };
        }

        const { uri } = await ensureOpen(client, resolvedPath, lang);

        // Wait for diagnostics to arrive
        await diagnosticsCache.awaitDiagnostics(uri, waitConfig[lang] ?? 2_000);
        waitedMs = Date.now() - startMs;

        let diags = diagnosticsCache.get(uri);
        if (severity !== "all") {
          diags = diags.filter((d) => d.severity === severity);
        }
        const { items, truncated, returned } = clampResults(diags, maxResults);

        return {
          content: [{ type: "text" as const, text: JSON.stringify({ diagnostics: items, returned, truncated, waitedMs }, null, 2) }],
        };
      }

      // workspaceWide or all
      if (workspaceWide) {
        const allDiags = diagnosticsCache.all();
        if (allDiags.length === 0) {
          warmedUp = true;
          // Walk workspace and didOpen all source files
          const extSet = new Set<string>();
          for (const entry of Object.values(languageServers)) {
            for (const e of entry.extensions) extSet.add(e);
          }

          const rootUri = fileToUri(workspacePath);
          try {
            const files = await walkSourceFiles(workspacePath, extSet);
            for (const f of files) {
              const e = extname(f);
              const l = routeLanguage(e);
              if (!l) continue;
              try {
                const c = await clientManager.getClientForLanguage(l, { workspacePath, rootUri });
                if (c) await ensureOpen(c, f, l);
              } catch {
                // skip files that fail to open
              }
            }
          } catch {
            // walk may fail if workspace is not readable; that's OK
          }

          await diagnosticsCache.awaitAllDiagnostics(5_000);
          waitedMs = Date.now() - startMs;
        } else {
          waitedMs = 0;
        }

        let diags = diagnosticsCache.all();
        if (severity !== "all") {
          diags = diags.filter((d) => d.severity === severity);
        }
        const { items, truncated, returned } = clampResults(diags, maxResults);

        const payload: Record<string, unknown> = { diagnostics: items, returned, truncated, waitedMs };
        if (warmedUp) payload.warmedUp = true;

        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        };
      }

      // Neither filePath nor workspaceWide — return all cached
      let diags = diagnosticsCache.all();
      if (severity !== "all") {
        diags = diags.filter((d) => d.severity === severity);
      }
      const { items, truncated, returned } = clampResults(diags, maxResults);

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ diagnostics: items, returned, truncated, waitedMs: 0 }, null, 2) }],
      };
    }
  );

  // ── lsp_diagnostics_summary ─────────────────────────────────────────────────

  server.tool(
    "lsp_diagnostics_summary",
    "Return a summary of cached diagnostics grouped by severity, file, source, and message with a likely root cause.",
    {
      filePath: z.string().optional().describe("Absolute or workspace-relative path to a file, or omit for all cached diagnostics."),
      workspaceWide: z.boolean().default(false).describe("If true, warm the workspace before summarizing."),
    },
    async (args: { filePath?: string; workspaceWide?: boolean }) => {
      const { filePath, workspaceWide = false } = args;
      const { workspacePath } = ctx;

      let diags: NormalizedDiagnostic[];

      if (filePath) {
        let resolvedPath: string;
        try {
          resolvedPath = await safeResolve(workspacePath, filePath);
        } catch {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.PATH_OUTSIDE_WORKSPACE, `Path is outside workspace: ${filePath}`), null, 2) }],
          };
        }

        const ext = extname(resolvedPath);
        const lang = routeLanguage(ext);
        if (!lang) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.UNSUPPORTED_LANGUAGE, `No LSP server registered for extension: ${ext}`), null, 2) }],
          };
        }

        try {
          await stat(resolvedPath);
        } catch (err: unknown) {
          if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
            return {
              content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.FILE_NOT_FOUND, `File not found: ${resolvedPath}`), null, 2) }],
            };
          }
          throw err;
        }

        const rootUri = fileToUri(workspacePath);
        const client = await clientManager.getClientForLanguage(lang, { workspacePath, rootUri });
        if (!client) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_SERVER_UNAVAILABLE, `No LSP server available for language: ${lang}`), null, 2) }],
          };
        }

        const { uri } = await ensureOpen(client, resolvedPath, lang);
        await diagnosticsCache.awaitDiagnostics(uri, waitConfig[lang] ?? 2_000);
        diags = diagnosticsCache.get(uri);
      } else if (workspaceWide) {
        const allDiags = diagnosticsCache.all();
        if (allDiags.length === 0) {
          const extSet = new Set<string>();
          for (const entry of Object.values(languageServers)) {
            for (const e of entry.extensions) extSet.add(e);
          }
          const rootUri = fileToUri(workspacePath);
          try {
            const files = await walkSourceFiles(workspacePath, extSet);
            for (const f of files) {
              const e = extname(f);
              const l = routeLanguage(e);
              if (!l) continue;
              try {
                const c = await clientManager.getClientForLanguage(l, { workspacePath, rootUri });
                if (c) await ensureOpen(c, f, l);
              } catch {
                // skip
              }
            }
          } catch {
            // walk may fail
          }
          await diagnosticsCache.awaitAllDiagnostics(5_000);
        }
        diags = diagnosticsCache.all();
      } else {
        diags = diagnosticsCache.all();
      }

      const summary = buildDiagnosticsSummary(diags);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
      };
    }
  );

  // ── lsp_rename_preview ──────────────────────────────────────────────────────

  server.tool(
    "lsp_rename_preview",
    "Preview a rename operation. Returns the WorkspaceEdit and a unified diff. No files are written to disk.",
    {
      filePath: z.string().describe("Absolute or workspace-relative path to the file."),
      position: z.object({
        line: z.number().int().nonnegative().describe("Zero-based line number."),
        character: z.number().int().nonnegative().describe("Zero-based UTF-16 character offset."),
      }).describe("Line/character position (zero-based) of the symbol to rename."),
      newName: z.string().min(1).describe("The new name for the symbol."),
      includeDiff: z.boolean().default(true).describe("Whether to include a unified diff in the response."),
    },
    async (args: { filePath: string; position: { line: number; character: number }; newName: string; includeDiff?: boolean }) => {
      const { filePath, position, newName, includeDiff = true } = args;
      const { workspacePath } = ctx;

      // 1. Validate filePath is inside workspace
      let resolvedPath: string;
      try {
        resolvedPath = await safeResolve(workspacePath, filePath);
      } catch {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.PATH_OUTSIDE_WORKSPACE, `Path is outside workspace: ${filePath}`), null, 2) }],
        };
      }

      // 2. Route extension to language
      const ext = extname(resolvedPath);
      const lang = routeLanguage(ext);
      if (!lang) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.UNSUPPORTED_LANGUAGE, `No LSP server registered for extension: ${ext}`), null, 2) }],
        };
      }

      // 3. Ensure file exists on disk
      try {
        await stat(resolvedPath);
      } catch (err: unknown) {
        if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.FILE_NOT_FOUND, `File not found: ${resolvedPath}`), null, 2) }],
          };
        }
        throw err;
      }

      // 4. Get or create LSP client
      const rootUri = fileToUri(workspacePath);
      const client = await clientManager.getClientForLanguage(lang, { workspacePath, rootUri });
      if (!client) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_SERVER_UNAVAILABLE, `No LSP server available for language: ${lang}`), null, 2) }],
        };
      }

      // 5. Ensure document is open
      const { uri } = await ensureOpen(client, resolvedPath, lang);

      // 6. Check renameProvider capability
      const caps = client.getCapabilities();
      if (!caps.renameProvider) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_CAPABILITY_UNSUPPORTED, "renameProvider not supported by this LSP server"), null, 2) }],
        };
      }

      // 7. Prepare rename first
      let prepareResult: any;
      try {
        prepareResult = await client.request("textDocument/prepareRename", { textDocument: { uri }, position }, LIMITS.TIMEOUTS.RENAME_MS);
      } catch {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_REQUEST_FAILED, "prepareRename failed"), null, 2) }],
        };
      }

      if (!prepareResult) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ canRename: false, changedFiles: [], editCount: 0, safe: true, violations: [{ type: "cannot_rename", message: "Symbol cannot be renamed at this position" }] }, null, 2) }],
        };
      }

      // 8. Call textDocument/rename
      let renameResult: any;
      try {
        renameResult = await client.request("textDocument/rename", {
          textDocument: { uri },
          position,
          newName,
        }, LIMITS.TIMEOUTS.RENAME_MS);
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_REQUEST_FAILED, String(err)), null, 2) }],
        };
      }

      if (!renameResult) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ canRename: false, changedFiles: [], editCount: 0, safe: true, violations: [{ type: "rename_returned_null", message: "Rename returned null" }] }, null, 2) }],
        };
      }

      // 9. Validate the WorkspaceEdit
      const validation = await validateWorkspaceEdit(renameResult, workspacePath);
      const editCount = countEdits(renameResult);

      // 10. Generate diff if requested and safe
      let diff: string | undefined;
      if (includeDiff && validation.safe) {
        diff = workspaceEditToDiff(renameResult, workspacePath);
      }

      const payload = {
        canRename: true,
        changedFiles: validation.changedFiles,
        editCount,
        workspaceEdit: renameResult,
        ...(diff !== undefined ? { diff } : {}),
        safe: validation.safe,
        violations: validation.violations,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      };
    }
  );

  // ── lsp_inspect_symbol ──────────────────────────────────────────────────────

  server.tool(
    "lsp_inspect_symbol",
    "Return hover, definitions, references, enclosing symbols, and risk hints for a symbol at a position.",
    {
      filePath: z.string().describe("Absolute or workspace-relative path to the file."),
      position: z.object({
        line: z.number().int().nonnegative().describe("Zero-based line number."),
        character: z.number().int().nonnegative().describe("Zero-based UTF-16 character offset."),
      }).describe("Line/character position (zero-based) of the symbol to inspect."),
      maxReferences: z.number().int().nonnegative().default(50).describe("Maximum number of references to return."),
    },
    async (args: { filePath: string; position: { line: number; character: number }; maxReferences?: number }) => {
      const { filePath, position, maxReferences = 50 } = args;
      const { workspacePath } = ctx;

      // 1. Validate filePath is inside workspace
      let resolvedPath: string;
      try {
        resolvedPath = await safeResolve(workspacePath, filePath);
      } catch {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.PATH_OUTSIDE_WORKSPACE, `Path is outside workspace: ${filePath}`), null, 2) }],
        };
      }

      // 2. Route extension to language
      const ext = extname(resolvedPath);
      const lang = routeLanguage(ext);
      if (!lang) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.UNSUPPORTED_LANGUAGE, `No LSP server registered for extension: ${ext}`), null, 2) }],
        };
      }

      // 3. Ensure file exists on disk
      try {
        await stat(resolvedPath);
      } catch (err: unknown) {
        if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.FILE_NOT_FOUND, `File not found: ${resolvedPath}`), null, 2) }],
          };
        }
        throw err;
      }

      // 4. Get or create LSP client
      const rootUri = fileToUri(workspacePath);
      const client = await clientManager.getClientForLanguage(lang, { workspacePath, rootUri });
      if (!client) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_SERVER_UNAVAILABLE, `No LSP server available for language: ${lang}`), null, 2) }],
        };
      }

      // 5. Ensure document is open
      const { uri } = await ensureOpen(client, resolvedPath, lang);

      // 6. Run the inspect composite
      try {
        const result = await inspectSymbol(client, workspacePath, uri, resolvedPath, position, maxReferences);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_REQUEST_FAILED, String(err)), null, 2) }],
        };
      }
    }
  );

  // ── lsp_workspace_edit_preview ──────────────────────────────────────────────

  server.tool(
    "lsp_workspace_edit_preview",
    "Parse, validate, and preview a raw LSP WorkspaceEdit. Returns a unified diff without writing any files to disk.",
    {
      workspaceEdit: WorkspaceEditPreviewInputSchema.shape.workspaceEdit,
      includeDiff: z.boolean().default(true).describe("Whether to include a unified diff."),
      maxFiles: z.number().int().positive().optional().describe("Max changed files before rejection."),
      maxEdits: z.number().int().positive().optional().describe("Max edits before rejection."),
    },
    async (args: { workspaceEdit: unknown; includeDiff?: boolean; maxFiles?: number; maxEdits?: number }) => {
      const { workspaceEdit, includeDiff = true, maxFiles, maxEdits } = args;
      const { workspacePath } = ctx;

      const preview = buildWorkspaceEditPreview(workspaceEdit, workspacePath, {
        includeDiff,
        maxFiles,
        maxEdits,
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(preview, null, 2) }],
      };
    }
  );

  // ── lsp_validate_workspace_edit ────────────────────────────────────────────

  server.tool(
    "lsp_validate_workspace_edit",
    "Validate a raw LSP WorkspaceEdit without generating a diff. Returns violations only.",
    {
      workspaceEdit: ValidateWorkspaceEditInputSchema.shape.workspaceEdit,
      maxFiles: z.number().int().positive().optional().describe("Max changed files before rejection."),
      maxEdits: z.number().int().positive().optional().describe("Max edits before rejection."),
    },
    async (args: { workspaceEdit: unknown; maxFiles?: number; maxEdits?: number }) => {
      const { workspaceEdit, maxFiles, maxEdits } = args;
      const { workspacePath } = ctx;

      const result = buildValidateWorkspaceEditResult(workspaceEdit, workspacePath, {
        maxFiles,
        maxEdits,
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ── lsp_prepare_rename ────────────────────────────────────────────────────

  server.tool(
    "lsp_prepare_rename",
    "Check rename viability at a position. Returns range and placeholder if the symbol can be renamed.",
    {
      filePath: z.string().describe("Absolute or workspace-relative path to the file."),
      position: z.object({
        line: z.number().int().nonnegative().describe("Zero-based line number."),
        character: z.number().int().nonnegative().describe("Zero-based UTF-16 character offset."),
      }).describe("Line/character position (zero-based) of the symbol to check."),
    },
    async (args: { filePath: string; position: { line: number; character: number } }) => {
      const { filePath, position } = args;
      const { workspacePath } = ctx;

      let resolvedPath: string;
      try {
        resolvedPath = await safeResolve(workspacePath, filePath);
      } catch {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.PATH_OUTSIDE_WORKSPACE, `Path is outside workspace: ${filePath}`), null, 2) }],
        };
      }

      const ext = extname(resolvedPath);
      const lang = routeLanguage(ext);
      if (!lang) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.UNSUPPORTED_LANGUAGE, `No LSP server registered for extension: ${ext}`), null, 2) }],
        };
      }

      try {
        await stat(resolvedPath);
      } catch (err: unknown) {
        if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.FILE_NOT_FOUND, `File not found: ${resolvedPath}`), null, 2) }],
          };
        }
        throw err;
      }

      const rootUri = fileToUri(workspacePath);
      const client = await clientManager.getClientForLanguage(lang, { workspacePath, rootUri });
      if (!client) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_SERVER_UNAVAILABLE, `No LSP server available for language: ${lang}`), null, 2) }],
        };
      }

      const { uri } = await ensureOpen(client, resolvedPath, lang);

      try {
        const result = await prepareRename(client, uri, position);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_REQUEST_FAILED, String(err)), null, 2) }],
        };
      }
    }
  );

  // ── lsp_code_actions_preview ───────────────────────────────────────────────

  server.tool(
    "lsp_code_actions_preview",
    "Return available LSP code actions (quickfixes, refactors, source actions) for a range or diagnostic, with safe edit previews. No commands are executed and no files are written.",
    {
      filePath: z.string().describe("Absolute or workspace-relative path to the file."),
      range: z.object({
        start: z.object({ line: z.number().int().nonnegative(), character: z.number().int().nonnegative() }),
        end: z.object({ line: z.number().int().nonnegative(), character: z.number().int().nonnegative() }),
      }).optional().describe("Selection range."),
      only: z.array(z.string()).optional().describe("Filter by code action kinds."),
      diagnosticIndexes: z.array(z.number().int().nonnegative()).optional().describe("Indexes of diagnostics to target."),
      maxActions: z.number().int().positive().default(20).describe("Max actions to return."),
      includeDiff: z.boolean().default(true).describe("Include diffs for edit actions."),
    },
    async (args: { filePath: string; range?: { start: { line: number; character: number }; end: { line: number; character: number } }; only?: string[]; diagnosticIndexes?: number[]; maxActions?: number; includeDiff?: boolean }) => {
      const { filePath, range, only, diagnosticIndexes, maxActions = 20, includeDiff = true } = args;
      const { workspacePath } = ctx;

      let resolvedPath: string;
      try {
        resolvedPath = await safeResolve(workspacePath, filePath);
      } catch {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.PATH_OUTSIDE_WORKSPACE, `Path is outside workspace: ${filePath}`), null, 2) }],
        };
      }

      const ext = extname(resolvedPath);
      const lang = routeLanguage(ext);
      if (!lang) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.UNSUPPORTED_LANGUAGE, `No LSP server registered for extension: ${ext}`), null, 2) }],
        };
      }

      try {
        await stat(resolvedPath);
      } catch (err: unknown) {
        if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.FILE_NOT_FOUND, `File not found: ${resolvedPath}`), null, 2) }],
          };
        }
        throw err;
      }

      const rootUri = fileToUri(workspacePath);
      const client = await clientManager.getClientForLanguage(lang, { workspacePath, rootUri });
      if (!client) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_SERVER_UNAVAILABLE, `No LSP server available for language: ${lang}`), null, 2) }],
        };
      }

      const caps = client.getCapabilities();
      if (!caps.raw.codeActionProvider) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_CAPABILITY_UNSUPPORTED, "codeActionProvider not supported by this LSP server"), null, 2) }],
        };
      }

      const { uri } = await ensureOpen(client, resolvedPath, lang);

      // Build diagnostics context
      const diagnostics: Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; message: string; severity?: number; code?: string | number; source?: string }> = [];
      if (diagnosticIndexes && diagnosticIndexes.length > 0) {
        const cachedDiags = diagnosticsCache.get(uri);
        for (const idx of diagnosticIndexes) {
          if (idx >= 0 && idx < cachedDiags.length) {
            diagnostics.push({
              range: cachedDiags[idx].range,
              message: cachedDiags[idx].message,
              severity: cachedDiags[idx].severity === "error" ? 1 : cachedDiags[idx].severity === "warning" ? 2 : cachedDiags[idx].severity === "info" ? 3 : 4,
              code: cachedDiags[idx].code,
              source: cachedDiags[idx].source,
            });
          }
        }
      }

      // Determine range
      let targetRange = range;
      if (!targetRange) {
        targetRange = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
      }

      let rawActions: unknown[];
      try {
        rawActions = await client.request("textDocument/codeAction", {
          textDocument: { uri },
          range: targetRange,
          context: { diagnostics, only },
        }, LIMITS.TIMEOUTS.DEFINITION_MS) as unknown[];
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_REQUEST_FAILED, String(err)), null, 2) }],
        };
      }

      if (!rawActions || !Array.isArray(rawActions)) {
        rawActions = [];
      }

      const truncated = rawActions.length > maxActions;
      const limited = rawActions.slice(0, maxActions);

      const actions = limited.map((raw) => {
        const normalized = normalizeCodeAction(raw as any);

        // Cache unresolved actions for later resolution
        const cachedId = codeActionCache.store(raw, {
          workspacePath,
          language: lang,
          filePath: resolvedPath,
        });
        normalized.cachedActionId = cachedId;
        normalized.isCached = true;

        // If the action has an edit, validate and generate diff
        if (normalized.hasEdit) {
          const ca = raw as Record<string, unknown>;
          if (ca.edit) {
            const preview = buildWorkspaceEditPreview(ca.edit, workspacePath, { includeDiff });
            normalized.safe = preview.safe;
            normalized.changedFiles = preview.changedFiles;
            normalized.editCount = preview.editCount;
            normalized.diff = preview.diff;
            normalized.workspaceEdit = ca.edit;
            normalized.violations = preview.violations;
          }
        }

        return normalized;
      });

      const payload = { actions, returned: actions.length, truncated };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      };
    }
  );

  // ── lsp_resolve_code_action ────────────────────────────────────────────────

  server.tool(
    "lsp_resolve_code_action",
    "Resolve a lazy code action from the cache and return a validated edit preview.",
    {
      actionId: z.string().describe("Cached action ID from lsp_code_actions_preview."),
      includeDiff: z.boolean().default(true).describe("Whether to include a unified diff."),
    },
    async (args: { actionId: string; includeDiff?: boolean }) => {
      const { actionId, includeDiff = true } = args;
      const { workspacePath } = ctx;

      // Look up in cache
      const cached = codeActionCache.get(actionId);
      if (!cached) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError("code_action_not_found", `Code action not found: ${actionId}`), null, 2) }],
        };
      }

      // Check expiry
      if (Date.now() > cached.expiresAt) {
        codeActionCache.delete(actionId);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError("code_action_expired", `Code action expired: ${actionId}`), null, 2) }],
        };
      }

      // Check resolve capability
      const rootUri = fileToUri(workspacePath);
      const client = await clientManager.getClientForLanguage(cached.language, { workspacePath, rootUri });
      if (!client) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_SERVER_UNAVAILABLE, "LSP server unavailable"), null, 2) }],
        };
      }

      const caps = client.getCapabilities();
      const codeActionCaps = caps.raw.codeActionProvider;
      const hasResolve = typeof codeActionCaps === "object" && (codeActionCaps as Record<string, unknown>).resolveProvider === true;
      if (!hasResolve) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_CAPABILITY_UNSUPPORTED, "codeAction/resolve not supported by this LSP server"), null, 2) }],
        };
      }

      // Call codeAction/resolve
      let resolved: unknown;
      try {
        resolved = await client.request("codeAction/resolve", cached.rawAction, LIMITS.TIMEOUTS.DEFINITION_MS);
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_REQUEST_FAILED, String(err)), null, 2) }],
        };
      }

      // Normalize and validate
      const normalized = normalizeCodeAction(resolved as any, actionId);
      if (normalized.hasEdit) {
        const ca = resolved as Record<string, unknown>;
        if (ca.edit) {
          const preview = buildWorkspaceEditPreview(ca.edit, workspacePath, { includeDiff });
          normalized.safe = preview.safe;
          normalized.changedFiles = preview.changedFiles;
          normalized.editCount = preview.editCount;
          normalized.diff = preview.diff;
          normalized.workspaceEdit = ca.edit;
          normalized.violations = preview.violations;
        }
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(normalized, null, 2) }],
      };
    }
  );

  // ── lsp_format_preview ────────────────────────────────────────────────────

  server.tool(
    "lsp_format_preview",
    "Preview formatting changes for a file. Returns a unified diff without writing any files.",
    {
      filePath: z.string().describe("Absolute or workspace-relative path to the file."),
      tabSize: z.number().int().positive().default(2).describe("Tab size."),
      insertSpaces: z.boolean().default(true).describe("Use spaces instead of tabs."),
      includeDiff: z.boolean().default(true).describe("Whether to include a unified diff."),
    },
    async (args: { filePath: string; tabSize?: number; insertSpaces?: boolean; includeDiff?: boolean }) => {
      const { filePath, tabSize = 2, insertSpaces = true, includeDiff = true } = args;
      const { workspacePath } = ctx;

      let resolvedPath: string;
      try {
        resolvedPath = await safeResolve(workspacePath, filePath);
      } catch {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.PATH_OUTSIDE_WORKSPACE, `Path is outside workspace: ${filePath}`), null, 2) }],
        };
      }

      const ext = extname(resolvedPath);
      const lang = routeLanguage(ext);
      if (!lang) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.UNSUPPORTED_LANGUAGE, `No LSP server registered for extension: ${ext}`), null, 2) }],
        };
      }

      const rootUri = fileToUri(workspacePath);
      const client = await clientManager.getClientForLanguage(lang, { workspacePath, rootUri });
      if (!client) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_SERVER_UNAVAILABLE, `No LSP server available for language: ${lang}`), null, 2) }],
        };
      }

      const { uri } = await ensureOpen(client, resolvedPath, lang);

      try {
        const result = await formatDocument(client, uri, workspacePath, { tabSize, insertSpaces, includeDiff });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_REQUEST_FAILED, String(err)), null, 2) }],
        };
      }
    }
  );

  // ── lsp_range_format_preview ──────────────────────────────────────────────

  server.tool(
    "lsp_range_format_preview",
    "Preview formatting changes for a range within a file. Returns a unified diff without writing any files.",
    {
      filePath: z.string().describe("Absolute or workspace-relative path to the file."),
      range: z.object({
        start: z.object({ line: z.number().int().nonnegative(), character: z.number().int().nonnegative() }),
        end: z.object({ line: z.number().int().nonnegative(), character: z.number().int().nonnegative() }),
      }).describe("Range to format."),
      tabSize: z.number().int().positive().default(2).describe("Tab size."),
      insertSpaces: z.boolean().default(true).describe("Use spaces instead of tabs."),
      includeDiff: z.boolean().default(true).describe("Whether to include a unified diff."),
    },
    async (args: { filePath: string; range: { start: { line: number; character: number }; end: { line: number; character: number } }; tabSize?: number; insertSpaces?: boolean; includeDiff?: boolean }) => {
      const { filePath, range, tabSize = 2, insertSpaces = true, includeDiff = true } = args;
      const { workspacePath } = ctx;

      let resolvedPath: string;
      try {
        resolvedPath = await safeResolve(workspacePath, filePath);
      } catch {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.PATH_OUTSIDE_WORKSPACE, `Path is outside workspace: ${filePath}`), null, 2) }],
        };
      }

      const ext = extname(resolvedPath);
      const lang = routeLanguage(ext);
      if (!lang) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.UNSUPPORTED_LANGUAGE, `No LSP server registered for extension: ${ext}`), null, 2) }],
        };
      }

      const rootUri = fileToUri(workspacePath);
      const client = await clientManager.getClientForLanguage(lang, { workspacePath, rootUri });
      if (!client) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_SERVER_UNAVAILABLE, `No LSP server available for language: ${lang}`), null, 2) }],
        };
      }

      const { uri } = await ensureOpen(client, resolvedPath, lang);

      try {
        const result = await formatRange(client, uri, range, workspacePath, { tabSize, insertSpaces, includeDiff });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_REQUEST_FAILED, String(err)), null, 2) }],
        };
      }
    }
  );

  // ── lsp_organize_imports_preview ──────────────────────────────────────────

  server.tool(
    "lsp_organize_imports_preview",
    "Preview import organization changes using source.organizeImports code action. Returns a unified diff without writing files.",
    {
      filePath: z.string().describe("Absolute or workspace-relative path to the file."),
      includeDiff: z.boolean().default(true).describe("Whether to include a unified diff."),
    },
    async (args: { filePath: string; includeDiff?: boolean }) => {
      const { filePath, includeDiff = true } = args;
      const { workspacePath } = ctx;

      let resolvedPath: string;
      try {
        resolvedPath = await safeResolve(workspacePath, filePath);
      } catch {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.PATH_OUTSIDE_WORKSPACE, `Path is outside workspace: ${filePath}`), null, 2) }],
        };
      }

      const ext = extname(resolvedPath);
      const lang = routeLanguage(ext);
      if (!lang) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.UNSUPPORTED_LANGUAGE, `No LSP server registered for extension: ${ext}`), null, 2) }],
        };
      }

      const rootUri = fileToUri(workspacePath);
      const client = await clientManager.getClientForLanguage(lang, { workspacePath, rootUri });
      if (!client) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_SERVER_UNAVAILABLE, `No LSP server available for language: ${lang}`), null, 2) }],
        };
      }

      const { uri } = await ensureOpen(client, resolvedPath, lang);

      // Call code actions with source.organizeImports filter
      let rawActions: unknown[];
      try {
        rawActions = await client.request("textDocument/codeAction", {
          textDocument: { uri },
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
          context: { diagnostics: [], only: ["source.organizeImports"] },
        }, LIMITS.TIMEOUTS.DEFINITION_MS) as unknown[];
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.LSP_REQUEST_FAILED, String(err)), null, 2) }],
        };
      }

      if (!rawActions || !Array.isArray(rawActions)) {
        rawActions = [];
      }

      const actions = rawActions.map((raw) => {
        const normalized = normalizeCodeAction(raw as any);
        if (normalized.hasEdit) {
          const ca = raw as Record<string, unknown>;
          if (ca.edit) {
            const preview = buildWorkspaceEditPreview(ca.edit, workspacePath, { includeDiff });
            normalized.safe = preview.safe;
            normalized.changedFiles = preview.changedFiles;
            normalized.editCount = preview.editCount;
            normalized.diff = preview.diff;
            normalized.workspaceEdit = ca.edit;
            normalized.violations = preview.violations;
          }
        }
        return normalized;
      });

      const preferredActionId = actions.length === 1 && actions[0].safe ? actions[0].id : undefined;

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ actions, preferredActionId, returned: actions.length }, null, 2) }],
      };
    }
  );

  // ── lsp_wait_for_diagnostics ──────────────────────────────────────────────

  server.tool(
    "lsp_wait_for_diagnostics",
    "Wait for diagnostics to arrive after a document sync or external edit. Useful for agent synchronization loops.",
    {
      filePath: z.string().optional().describe("File path to wait for diagnostics on. Omit for workspace-wide."),
      workspaceWide: z.boolean().default(false).describe("Wait for any diagnostic event workspace-wide."),
      timeoutMs: z.number().int().positive().default(5000).describe("Max wait time in ms."),
      settleMs: z.number().int().nonnegative().default(250).describe("Quiet period after first event in ms."),
    },
    async (args: { filePath?: string; workspaceWide?: boolean; timeoutMs?: number; settleMs?: number }) => {
      const { filePath, workspaceWide = false, timeoutMs = 5000, settleMs = 250 } = args;
      const { workspacePath } = ctx;

      // Determine URI to wait for
      let uri: string | undefined;
      if (filePath) {
        let resolvedPath: string;
        try {
          resolvedPath = await safeResolve(workspacePath, filePath);
        } catch {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.PATH_OUTSIDE_WORKSPACE, `Path is outside workspace: ${filePath}`), null, 2) }],
          };
        }
        const ext = extname(resolvedPath);
        const lang = routeLanguage(ext);
        if (!lang) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.UNSUPPORTED_LANGUAGE, `No LSP server registered for extension: ${ext}`), null, 2) }],
          };
        }
        const rootUri = fileToUri(workspacePath);
        const client = await clientManager.getClientForLanguage(lang, { workspacePath, rootUri });
        if (client) {
          const doc = await ensureOpen(client, resolvedPath, lang);
          uri = doc.uri;
        }
      }

      const effectiveUri = uri ?? fileToUri(workspacePath);
      // Use any available client
      const firstLang = Object.keys(languageServers)[0];
      const rootUri = fileToUri(workspacePath);
      const client = firstLang ? await clientManager.getClientForLanguage(firstLang, { workspacePath, rootUri }) : null;

      const result = await waitForDiagnostics(client ?? undefined as any, effectiveUri, {
        timeoutMs,
        settleMs,
        workspaceWide: workspaceWide || !filePath,
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ── lsp_snapshot_diagnostics ──────────────────────────────────────────────

  server.tool(
    "lsp_snapshot_diagnostics",
    "Take a snapshot of current diagnostic state. Returns a snapshot ID for later comparison.",
    {
      name: z.string().optional().describe("Optional label for this snapshot."),
      filePath: z.string().optional().describe("Filter to a single file. Omit for all diagnostics."),
    },
    async (args: { name?: string; filePath?: string }) => {
      const { name, filePath } = args;
      const { workspacePath } = ctx;

      let diags = diagnosticsCache.all();
      if (filePath) {
        let resolvedPath: string;
        try {
          resolvedPath = await safeResolve(workspacePath, filePath);
        } catch {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(toolError(ErrorCodes.PATH_OUTSIDE_WORKSPACE, `Path is outside workspace: ${filePath}`), null, 2) }],
          };
        }
        const rootUri = fileToUri(workspacePath);
        const ext = extname(resolvedPath);
        const lang = routeLanguage(ext);
        if (lang) {
          const client = await clientManager.getClientForLanguage(lang, { workspacePath, rootUri });
          if (client) {
            const { uri } = await ensureOpen(client, resolvedPath, lang);
            diags = diagnosticsCache.get(uri);
          }
        }
      }

      const snapshot = snapshotStore.create(diags, workspacePath, name);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(snapshot, null, 2) }],
      };
    }
  );

  // ── lsp_compare_diagnostics ───────────────────────────────────────────────

  server.tool(
    "lsp_compare_diagnostics",
    "Compare two diagnostic snapshots to identify fixed, introduced, and unchanged diagnostics.",
    {
      beforeId: z.string().describe("Snapshot ID to compare from."),
      afterId: z.string().describe("Snapshot ID to compare to."),
    },
    async (args: { beforeId: string; afterId: string }) => {
      const { beforeId, afterId } = args;

      const before = snapshotStore.get(beforeId);
      if (!before) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError("diagnostic_snapshot_not_found", `Snapshot not found: ${beforeId}`), null, 2) }],
        };
      }

      const after = snapshotStore.get(afterId);
      if (!after) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(toolError("diagnostic_snapshot_not_found", `Snapshot not found: ${afterId}`), null, 2) }],
        };
      }

      const result = compareDiagnostics(before.diagnostics, after.diagnostics, beforeId, afterId);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Touch `ctx` so the parameter is considered used; later phases will need it.
  void ctx;
}

async function walkSourceFiles(dir: string, extensions: Set<string>): Promise<string[]> {
  const files: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkSourceFiles(full, extensions)));
    } else if (entry.isFile() && extensions.has(extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

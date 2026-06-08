import { stat, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LspClientManager } from "../lsp/LspClientManager.js";
import { languageServers, routeLanguage } from "../config/languageServers.js";
import { safeResolve } from "../safety/paths.js";
import { LIMITS, clampResults } from "../safety/limits.js";
import { ensureOpen } from "../lsp/documentStore.js";
import { locationFromLsp, hoverToString, fileToUri, referencesFromLsp, documentSymbolsFromLsp, workspaceSymbolsFromLsp, diagnosticSeverityToString } from "../lsp/normalize.js";
import { diagnosticsCache } from "../lsp/diagnosticsCache.js";
import type { NormalizedDiagnostic } from "../lsp/diagnosticsCache.js";
import { buildDiagnosticsSummary } from "../composite/diagnosticsSummary.js";
import { validateWorkspaceEdit, countEdits } from "../safety/workspaceEdit.js";
import { workspaceEditToDiff } from "../diff/workspaceEditToDiff.js";
import { toolError, ErrorCodes } from "./toolErrors.js";

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
  // Sanity-check tool. Returns a fixed payload so a client can verify the
  // transport, the Zod schema path, and the JSON response format work end-to-end.
  server.tool(
    "lsp_health_check",
    "Return a fixed stub payload so MCP clients can verify the transport and response format. Real health checks land in phase-2.",
    {},
    async () => {
      const payload = { ok: true, message: "phase-1 stub" };
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(payload, null, 2),
          },
        ],
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        for (const [lang, entry] of Object.entries(languageServers)) {
          const client = await clientManager.getClientForLanguage(lang, { workspacePath, rootUri });
          if (!client) continue;

          const caps = client.getCapabilities();
          if (!caps.workspaceSymbolProvider) continue;

          let rawSyms: unknown;
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        await diagnosticsCache.awaitDiagnostics(uri, 2_000);
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
        await diagnosticsCache.awaitDiagnostics(uri, 2_000);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

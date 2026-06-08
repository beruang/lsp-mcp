import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LspClientManager } from "../lsp/LspClientManager.js";
import { languageServers, routeLanguage } from "../config/languageServers.js";
import { safeResolve } from "../safety/paths.js";
import { LIMITS, clampResults } from "../safety/limits.js";
import { ensureOpen } from "../lsp/documentStore.js";
import { locationFromLsp, hoverToString, fileToUri, referencesFromLsp, documentSymbolsFromLsp, workspaceSymbolsFromLsp } from "../lsp/normalize.js";
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

  // Touch `ctx` so the parameter is considered used; later phases will need it.
  void ctx;
}

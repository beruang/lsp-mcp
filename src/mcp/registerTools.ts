import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LspClientManager } from "../lsp/LspClientManager.js";
import { languageServers, routeLanguage } from "../config/languageServers.js";
import { safeResolve } from "../safety/paths.js";
import { LIMITS } from "../safety/limits.js";
import { ensureOpen } from "../lsp/documentStore.js";
import { locationFromLsp, hoverToString, fileToUri } from "../lsp/normalize.js";
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

  // Touch `ctx` so the parameter is considered used; later phases will need it.
  void ctx;
}

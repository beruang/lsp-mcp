import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Shared context passed to every tool registration.
 * Phase-1 only needs the workspace root; later phases will extend this.
 */
export interface ToolContext {
  workspacePath: string;
}

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

  // Touch `ctx` so the parameter is considered used; later phases will need it.
  void ctx;
}

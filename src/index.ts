import { existsSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./mcp/registerTools.js";

function resolveWorkspacePath(): string {
  const fromEnv = process.env.WORKSPACE_PATH;
  if (fromEnv && fromEnv.length > 0) {
    if (existsSync(fromEnv)) {
      return fromEnv;
    }
    // Per spec §6 + phase-1 spec: if WORKSPACE_PATH is set but missing, warn
    // on stderr and fall back to process.cwd(). stdout is reserved for MCP.
    console.error(
      `[mcp-lsp-v3] WORKSPACE_PATH="${fromEnv}" does not exist; falling back to process.cwd() (${process.cwd()})`
    );
  } else if (fromEnv !== undefined) {
    console.error(
      `[mcp-lsp-v3] WORKSPACE_PATH is empty; falling back to process.cwd() (${process.cwd()})`
    );
  }
  return process.cwd();
}

async function main(): Promise<void> {
  const workspacePath = resolveWorkspacePath();

  const server = new McpServer(
    {
      name: "mcp-lsp-v3",
      version: "0.3.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  registerAllTools(server, { workspacePath });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Per phase-1 spec: log readiness to stderr only.
  console.error(`MCP server ready, workspace=${workspacePath}`);
}

main().catch((err) => {
  console.error("[mcp-lsp-v3] fatal error during startup:", err);
  process.exit(1);
});

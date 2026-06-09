import { access } from "node:fs/promises";
import type { LspClientManager } from "../lsp/LspClientManager.js";
import type { LspServerState } from "../lsp/LspState.js";

export type ReadinessResult = {
  ready: boolean;
  workspace: { path: string; exists: boolean; readable: boolean };
  servers: Array<{
    language: string;
    state: LspServerState;
    healthy: boolean;
  }>;
  checks: Array<{ name: string; passed: boolean; message?: string }>;
};

export async function checkReadiness(
  workspacePath: string,
  manager: LspClientManager,
  initServers: boolean,
  rootUri: string
): Promise<ReadinessResult> {
  const checks: ReadinessResult["checks"] = [];

  // Check workspace
  let workspaceExists = false;
  let workspaceReadable = false;
  try {
    await access(workspacePath);
    workspaceExists = true;
    workspaceReadable = true;
    checks.push({ name: "workspace_exists", passed: true });
  } catch {
    checks.push({ name: "workspace_exists", passed: false, message: `Path not accessible: ${workspacePath}` });
  }

  // Check language servers
  const servers: ReadinessResult["servers"] = [];
  const allStates = manager.getAllStates();

  for (const status of allStates) {
    if (initServers && status.state === "not_started") {
      // Initialize lazily if requested
      try {
        const client = await manager.getClientForLanguage(status.language, { workspacePath, rootUri });
        const newState = client ? client.state.state : "not_started";
        servers.push({
          language: status.language,
          state: newState,
          healthy: newState === "running",
        });
        checks.push({ name: `server_${status.language}`, passed: newState === "running", message: `Initialized: ${newState}` });
        continue;
      } catch (e) {
        servers.push({ language: status.language, state: "failed", healthy: false });
        checks.push({ name: `server_${status.language}`, passed: false, message: String(e) });
        continue;
      }
    }

    servers.push({
      language: status.language,
      state: status.state,
      healthy: status.state === "running",
    });
    checks.push({
      name: `server_${status.language}`,
      passed: status.state === "running",
      message: status.state === "not_started" ? "Not started" : undefined,
    });
  }

  const ready = workspaceExists && workspaceReadable && servers.some((s) => s.healthy);

  return { ready, workspace: { path: workspacePath, exists: workspaceExists, readable: workspaceReadable }, servers, checks };
}

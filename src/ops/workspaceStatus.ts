import type { LspClientManager } from "../lsp/LspClientManager.js";
import type { LspServerRuntimeStatus } from "../lsp/LspState.js";
import { getEffectiveConfig } from "../config/runtimeConfig.js";

export type WorkspaceInfo = {
  path: string;
  active: boolean;
  languageServers: LspServerRuntimeStatus[];
};

export type WorkspaceStatusResult = {
  workspace: WorkspaceInfo;
};

export function listWorkspaces(manager: LspClientManager): WorkspaceInfo[] {
  // Foundation: single-workspace only. Returns the current workspace.
  const config = getEffectiveConfig();
  return [
    {
      path: config.workspacePath,
      active: true,
      languageServers: manager.getAllStates(),
    },
  ];
}

export function workspaceStatus(
  manager: LspClientManager,
  workspacePath: string
): WorkspaceStatusResult {
  const config = getEffectiveConfig();
  const isActive = config.workspacePath === workspacePath;

  return {
    workspace: {
      path: workspacePath,
      active: isActive,
      languageServers: isActive ? manager.getAllStates() : [],
    },
  };
}

import type { LspClientManager } from "../lsp/LspClientManager.js";
import type { LspServerRuntimeStatus } from "../lsp/LspState.js";
import { languageServers } from "../config/languageServers.js";

export async function shutdownServer(
  manager: LspClientManager,
  language: string,
  forceTimeoutMs: number
): Promise<LspServerRuntimeStatus> {
  const entry = languageServers[language];
  if (!entry) {
    throw new Error(`server_not_found: No language server configured for "${language}"`);
  }

  const client = manager.getClient(language);
  if (!client) {
    return manager.getState(language);
  }

  // Handle crashed/failed state — skip graceful shutdown, just remove
  if (client.state.state === "crashed" || client.state.state === "failed" || client.state.state === "stopped") {
    manager.removeClient(language);
    const status = {
      language,
      command: entry.command,
      args: entry.args,
      state: "stopped" as const,
      restartCount: client.state.restartCount,
      crashCount: client.state.crashCount,
      openDocumentCount: 0,
      pendingRequestCount: 0,
      diagnosticsFileCount: 0,
      capabilitiesKnown: false,
    };
    return status;
  }

  // Graceful shutdown for running/starting/initializing
  try {
    const shutdownPromise = client.shutdown();
    const timeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error("shutdown_timeout")), forceTimeoutMs)
    );
    await Promise.race([shutdownPromise, timeout]);
  } catch {
    // Force kill on timeout
  }

  // Transition to stopped; force if needed
  const stateStr = client.state.state as string;
  if (stateStr !== "stopped") {
    client.state.transition("stopping");
    client.state.transition("stopped");
    if ((client.state.state as string) !== "stopped") {
      client.state.state = "stopped";
    }
  }

  manager.removeClient(language);
  const status = client.state.getRuntimeStatus();
  // Override state to stopped for the response
  status.state = "stopped";
  return status;
}

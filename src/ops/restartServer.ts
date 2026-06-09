import type { LspClientManager } from "../lsp/LspClientManager.js";
import type { LspServerRuntimeStatus } from "../lsp/LspState.js";
import { languageServers } from "../config/languageServers.js";

const RESTART_WINDOW_MS = 60_000;
const MAX_RESTARTS_PER_WINDOW = 3;

const restartTimestamps = new Map<string, number[]>();

function checkRateLimit(language: string): boolean {
  const now = Date.now();
  const timestamps = restartTimestamps.get(language) ?? [];
  const recent = timestamps.filter((t) => now - t < RESTART_WINDOW_MS);
  return recent.length < MAX_RESTARTS_PER_WINDOW;
}

function recordRestart(language: string): void {
  const now = Date.now();
  const timestamps = restartTimestamps.get(language) ?? [];
  timestamps.push(now);
  restartTimestamps.set(language, timestamps);
}

export type RestartResult = {
  status: LspServerRuntimeStatus;
  reopenedDocuments: number;
};

export async function restartServer(
  manager: LspClientManager,
  language: string,
  workspacePath: string,
  rootUri: string,
  reopenDocuments: boolean,
  shutdownTimeoutMs: number
): Promise<RestartResult> {
  const entry = languageServers[language];
  if (!entry) {
    throw new Error(`server_not_found: No language server configured for "${language}"`);
  }

  if (!checkRateLimit(language)) {
    throw new Error(`restart_rate_limited: Max ${MAX_RESTARTS_PER_WINDOW} restarts per ${RESTART_WINDOW_MS / 1000}s for "${language}"`);
  }

  recordRestart(language);

  // Shutdown existing client if running
  const existing = manager.getClient(language);
  if (existing) {
    try {
      const shutdownPromise = existing.shutdown();
      const timeout = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("shutdown_timeout")), shutdownTimeoutMs)
      );
      await Promise.race([shutdownPromise, timeout]);
    } catch {
      // Kill forced — remove from cache so we can restart
    }
    manager.removeClient(language);
  }

  // Spawn new client
  const client = await manager.getClientForLanguage(language, { workspacePath, rootUri });
  if (!client) {
    throw new Error(`lsp_server_unavailable: Failed to restart "${language}"`);
  }

  // Reopen documents
  const reopenedDocuments = 0;
  if (reopenDocuments) {
    // Document store integration will come in Phase 4
  }

  return {
    status: client.state.getRuntimeStatus(),
    reopenedDocuments,
  };
}

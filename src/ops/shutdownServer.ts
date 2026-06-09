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
    // Already not running — idempotent
    const state = manager.getState(language);
    return state;
  }

  try {
    const shutdownPromise = client.shutdown();
    const timeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error("shutdown_timeout")), forceTimeoutMs)
    );
    await Promise.race([shutdownPromise, timeout]);
  } catch {
    // Force kill on timeout
  }

  manager.removeClient(language);
  return manager.getState(language);
}

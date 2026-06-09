import type { LspClientManager } from "../lsp/LspClientManager.js";
import { getEffectiveConfig } from "../config/runtimeConfig.js";
import { isMethodSafe } from "./methodSafety.js";
import { languageServers } from "../config/languageServers.js";

export type RawRequestResult = {
  method: string;
  language: string;
  result: unknown;
  durationMs: number;
};

export async function rawRequest(
  manager: LspClientManager,
  language: string,
  method: string,
  params: unknown,
  workspacePath: string,
  rootUri: string
): Promise<RawRequestResult> {
  const config = getEffectiveConfig();
  if (!config.debug.rawRequestEnabled) {
    throw new Error("raw_request_disabled: lsp_raw_request is disabled. Enable via LSP_RAW_REQUEST_ENABLED env var or lsp_update_runtime_config.");
  }

  if (!isMethodSafe(method)) {
    throw new Error(`method_denied: LSP method "${method}" is blocked by the safety denylist.`);
  }

  const entry = languageServers[language];
  if (!entry) {
    throw new Error(`server_not_found: No language server configured for "${language}"`);
  }

  let client = manager.getClient(language);
  if (!client) {
    const c = await manager.getClientForLanguage(language, { workspacePath, rootUri });
    client = c ?? undefined;
  }
  if (!client) {
    throw new Error(`lsp_server_unavailable: Failed to get client for "${language}"`);
  }

  const startedAt = Date.now();
  const result = await client.request(method, params);
  return {
    method,
    language,
    result,
    durationMs: Date.now() - startedAt,
  };
}

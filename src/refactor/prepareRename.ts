import type { LspClient } from "../lsp/LspClient.js";
import { LIMITS } from "../safety/limits.js";

export interface PrepareRenameResult {
  canRename: boolean;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  placeholder?: string;
  reason?: string;
}

/**
 * Check rename viability and return range/placeholder via LSP prepareRename.
 */
export async function prepareRename(
  client: LspClient,
  uri: string,
  position: { line: number; character: number }
): Promise<PrepareRenameResult> {
  const caps = client.getCapabilities();

  // Check renameProvider capability
  if (!caps.renameProvider) {
    return { canRename: false, reason: "renameProvider not supported by this LSP server" };
  }

  // Check if prepareProvider is available
  const hasPrepareProvider =
    typeof caps.renameProvider === "object" &&
    (caps.renameProvider as Record<string, unknown>).prepareProvider === true;

  if (!hasPrepareProvider) {
    return { canRename: true };
  }

  // Call textDocument/prepareRename
  let prepareResult: unknown;
  try {
    prepareResult = await client.request(
      "textDocument/prepareRename",
      { textDocument: { uri }, position },
      LIMITS.TIMEOUTS.RENAME_MS
    );
  } catch {
    return { canRename: false, reason: "prepareRename request failed" };
  }

  if (!prepareResult) {
    return { canRename: false, reason: "No renameable symbol at this position." };
  }

  // Normalize response
  if (typeof prepareResult === "object" && prepareResult !== null) {
    const pr = prepareResult as Record<string, unknown>;

    // { range, placeholder }
    if (pr.range) {
      const range = pr.range as { start: { line: number; character: number }; end: { line: number; character: number } };
      const result: PrepareRenameResult = { canRename: true, range };
      if (typeof pr.placeholder === "string") {
        result.placeholder = pr.placeholder;
      }
      return result;
    }

    // Range shape: { start: { line, character }, end: { line, character } }
    if (pr.start && pr.end) {
      return {
        canRename: true,
        range: {
          start: pr.start as { line: number; character: number },
          end: pr.end as { line: number; character: number },
        },
      };
    }
  }

  return { canRename: true };
}

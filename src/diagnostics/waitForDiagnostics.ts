import { diagnosticsCache } from "../lsp/diagnosticsCache.js";
import type { NormalizedDiagnostic } from "../lsp/diagnosticsCache.js";
import type { LspClient } from "../lsp/LspClient.js";

export interface WaitForDiagnosticsResult {
  timedOut: boolean;
  waitedMs: number;
  diagnosticCount: number;
  filesWithDiagnostics: string[];
  diagnostics: NormalizedDiagnostic[];
}

export interface WaitOptions {
  timeoutMs?: number;
  settleMs?: number;
  workspaceWide?: boolean;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_SETTLE_MS = 250;

/**
 * Wait for diagnostics to arrive after a document sync or external edit.
 * Uses polling against the existing diagnostics cache.
 */
export async function waitForDiagnostics(
  client: LspClient,
  uri: string,
  options?: WaitOptions
): Promise<WaitForDiagnosticsResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const settleMs = options?.settleMs ?? DEFAULT_SETTLE_MS;
  const workspaceWide = options?.workspaceWide ?? false;

  const startTime = Date.now();

  // Open/sync file to trigger diagnostics
  try {
    // File is already open from the caller; diagnostics arrive asynchronously
  } catch {
    // ignore
  }

  // Wait for initial diagnostics
  const initialDiags = await new Promise<NormalizedDiagnostic[]>((resolve) => {
    const check = () => {
      const diags = workspaceWide ? diagnosticsCache.all() : diagnosticsCache.get(uri);
      if (diags.length > 0 || Date.now() - startTime >= timeoutMs) {
        resolve(diags);
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });

  // Settle: wait for quiet period
  if (settleMs > 0 && initialDiags.length > 0) {
    await new Promise<void>((resolve) => {
      let lastCount = initialDiags.length;
      const settleStart = Date.now();

      const check = () => {
        const current = workspaceWide ? diagnosticsCache.all() : diagnosticsCache.get(uri);
        if (current.length !== lastCount) {
          lastCount = current.length;
          // Reset settle timer
          if (Date.now() - startTime < timeoutMs) {
            setTimeout(check, settleMs);
            return;
          }
        }
        if (Date.now() - settleStart >= settleMs || Date.now() - startTime >= timeoutMs) {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      setTimeout(check, settleMs);
    });
  }

  const waitedMs = Date.now() - startTime;
  const timedOut = waitedMs >= timeoutMs;

  const finalDiags = workspaceWide ? diagnosticsCache.all() : diagnosticsCache.get(uri);
  const fileSet = new Set(finalDiags.map((d) => d.filePath));

  return {
    timedOut,
    waitedMs,
    diagnosticCount: finalDiags.length,
    filesWithDiagnostics: [...fileSet],
    diagnostics: finalDiags.slice(0, 500),
  };
}

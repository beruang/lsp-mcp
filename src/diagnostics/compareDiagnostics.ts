import type { NormalizedDiagnostic } from "../lsp/diagnosticsCache.js";

export interface CompareResult {
  beforeId: string;
  afterId: string;
  beforeCount: number;
  afterCount: number;
  fixed: NormalizedDiagnostic[];
  introduced: NormalizedDiagnostic[];
  unchanged: NormalizedDiagnostic[];
  fixedCount: number;
  introducedCount: number;
  unchangedCount: number;
  regressed: boolean;
  beforeErrorCount: number;
  afterErrorCount: number;
}

function diagnosticKey(d: NormalizedDiagnostic): string {
  return [
    d.filePath,
    d.range.start.line,
    d.range.start.character,
    d.range.end.line,
    d.range.end.character,
    d.severity,
    d.source ?? "",
    d.code ?? "",
    d.message,
  ].join("|");
}

function errorCount(diags: NormalizedDiagnostic[]): number {
  return diags.filter((d) => d.severity === "error").length;
}

export function compareDiagnostics(
  before: NormalizedDiagnostic[],
  after: NormalizedDiagnostic[],
  beforeId: string,
  afterId: string
): CompareResult {
  const beforeKeys = new Map<string, NormalizedDiagnostic>();
  for (const d of before) {
    beforeKeys.set(diagnosticKey(d), d);
  }

  const afterKeys = new Map<string, NormalizedDiagnostic>();
  for (const d of after) {
    afterKeys.set(diagnosticKey(d), d);
  }

  const fixed: NormalizedDiagnostic[] = [];
  const introduced: NormalizedDiagnostic[] = [];
  const unchanged: NormalizedDiagnostic[] = [];

  for (const [key, diag] of beforeKeys) {
    if (afterKeys.has(key)) {
      unchanged.push(diag);
    } else {
      fixed.push(diag);
    }
  }

  for (const [key, diag] of afterKeys) {
    if (!beforeKeys.has(key)) {
      introduced.push(diag);
    }
  }

  const beforeErrorCount = errorCount(before);
  const afterErrorCount = errorCount(after);
  const regressed = introduced.length > 0 || afterErrorCount > beforeErrorCount;

  return {
    beforeId,
    afterId,
    beforeCount: before.length,
    afterCount: after.length,
    fixed,
    introduced,
    unchanged,
    fixedCount: fixed.length,
    introducedCount: introduced.length,
    unchangedCount: unchanged.length,
    regressed,
    beforeErrorCount,
    afterErrorCount,
  };
}

import { diagnosticsCache } from "../lsp/diagnosticsCache.js";
import { LIMITS } from "../safety/limits.js";

interface RootCauseCandidate {
  message: string;
  count: number;
  files: string[];
  source?: string;
  code?: string | number;
  confidence: "low" | "medium" | "high";
  reason: string;
}

interface SuggestedFix {
  priority: number;
  filePath?: string;
  message: string;
  reason: string;
}

export function explainDiagnostics(opts: {
  filePath?: string;
  workspaceWide?: boolean;
  maxDiagnostics?: number;
}): { summary: string; total: number; rootCauseCandidates: RootCauseCandidate[]; suggestedFixOrder: SuggestedFix[] } {
  const maxDiags = opts.maxDiagnostics ?? LIMITS.EXPLAIN_DIAGNOSTICS_MAX;

  // Collect diagnostics
  let allDiags = diagnosticsCache.all();
  if (allDiags.length === 0) {
    return { summary: "No diagnostics in workspace.", total: 0, rootCauseCandidates: [], suggestedFixOrder: [] };
  }

  // Filter by file if specified
  if (opts.filePath) {
    allDiags = allDiags.filter(d => d.filePath === opts.filePath);
  }

  const total = allDiags.length;

  // Group by diagnostic code
  const byCode = new Map<string, typeof allDiags>();
  const byMessage = new Map<string, typeof allDiags>();

  for (const d of allDiags) {
    const codeKey = String(d.code ?? d.message);
    if (!byCode.has(codeKey)) byCode.set(codeKey, []);
    byCode.get(codeKey)!.push(d);

    const msgKey = d.message.toLowerCase();
    if (!byMessage.has(msgKey)) byMessage.set(msgKey, []);
    byMessage.get(msgKey)!.push(d);
  }

  // Build root cause candidates
  const candidates: RootCauseCandidate[] = [];

  for (const [code, diags] of byCode) {
    const files = [...new Set(diags.map(d => d.filePath))];
    const count = diags.length;

    let confidence: RootCauseCandidate["confidence"] = "low";
    let reason = "";

    if (count >= 5 && files.length >= 3) {
      confidence = "high";
      reason = `Same diagnostic code "${code}" repeated ${count} times across ${files.length} files.`;
    } else if (count >= 3) {
      confidence = "medium";
      reason = `Same diagnostic code "${code}" repeated ${count} times.`;
    } else if (count === 1 && files.length === 1) {
      confidence = "low";
      reason = "Isolated diagnostic.";
    } else {
      confidence = "medium";
      reason = `Diagnostic code "${code}" appears ${count} times in ${files.length} files.`;
    }

    candidates.push({
      message: diags[0].message,
      count,
      files: files.slice(0, 10),
      source: diags[0].source,
      code: diags[0].code,
      confidence,
      reason,
    });
  }

  // Sort by confidence (high > medium > low), then by count descending
  const order = { high: 0, medium: 1, low: 2 };
  candidates.sort((a, b) => order[a.confidence] - order[b.confidence] || b.count - a.count);

  // Generate fix order
  const fixOrder: SuggestedFix[] = [];
  let priority = 1;
  for (const c of candidates) {
    fixOrder.push({
      priority: priority++,
      filePath: c.files[0],
      message: c.message,
      reason: c.reason,
    });
  }

  const summary = `${total} diagnostics across ${new Set(allDiags.map(d => d.filePath)).size} files. ${candidates.filter(c => c.confidence === "high").length} high-confidence root cause candidates.`;

  return {
    summary,
    total,
    rootCauseCandidates: candidates.slice(0, maxDiags),
    suggestedFixOrder: fixOrder.slice(0, maxDiags),
  };
}

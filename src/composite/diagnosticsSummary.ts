import type { NormalizedDiagnostic } from "../lsp/diagnosticsCache.js";

interface SeverityGroup {
  severity: string;
  count: number;
}

interface FileGroup {
  filePath: string;
  count: number;
}

interface MessageGroup {
  message: string;
  count: number;
  severity: string;
  source?: string;
}

interface SourceGroup {
  source: string;
  count: number;
}

export interface DiagnosticsSummary {
  total: number;
  bySeverity: SeverityGroup[];
  byFile: FileGroup[];
  bySource: SourceGroup[];
  topMessages: MessageGroup[];
  likelyRootCause: string | null;
}

const ROOT_CAUSE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /Cannot find module ['"]([^'"]+)['"]/, label: "missing_module" },
  { pattern: /Cannot find name ['"]([^'"]+)['"]/, label: "missing_symbol" },
  { pattern: /Property ['"]([^'"]+)['"] does not exist/, label: "missing_property" },
  { pattern: /Type ['"]([^'"]+)['"] is not assignable/, label: "type_mismatch" },
  { pattern: /is declared but (its value is never read|never used)/, label: "unused" },
];

function inferLikelyRootCause(diags: NormalizedDiagnostic[]): string | null {
  const errors = diags.filter((d) => d.severity === "error");
  if (errors.length === 0) return null;

  for (const { pattern, label } of ROOT_CAUSE_PATTERNS) {
    const match = errors.find((d) => pattern.test(d.message));
    if (match) return label;
  }

  return "unknown_error";
}

function groupBySeverity(diags: NormalizedDiagnostic[]): SeverityGroup[] {
  const map = new Map<string, number>();
  for (const d of diags) {
    map.set(d.severity, (map.get(d.severity) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([severity, count]) => ({ severity, count }))
    .sort((a, b) => b.count - a.count);
}

function groupByFile(diags: NormalizedDiagnostic[]): FileGroup[] {
  const map = new Map<string, number>();
  for (const d of diags) {
    map.set(d.filePath, (map.get(d.filePath) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([filePath, count]) => ({ filePath, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

function groupBySource(diags: NormalizedDiagnostic[]): SourceGroup[] {
  const map = new Map<string, number>();
  for (const d of diags) {
    const source = d.source ?? "unknown";
    map.set(source, (map.get(source) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
}

function topMessages(diags: NormalizedDiagnostic[], limit = 10): MessageGroup[] {
  const map = new Map<string, { count: number; severity: string; source?: string }>();
  for (const d of diags) {
    const key = `${d.severity}::${d.message}`;
    const existing = map.get(key);
    if (existing) {
      existing.count++;
    } else {
      map.set(key, { count: 1, severity: d.severity, source: d.source });
    }
  }
  return [...map.entries()]
    .map(([key, val]) => ({ message: key.split("::")[1], count: val.count, severity: val.severity, source: val.source }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function buildDiagnosticsSummary(diags: NormalizedDiagnostic[]): DiagnosticsSummary {
  return {
    total: diags.length,
    bySeverity: groupBySeverity(diags),
    byFile: groupByFile(diags),
    bySource: groupBySource(diags),
    topMessages: topMessages(diags),
    likelyRootCause: inferLikelyRootCause(diags),
  };
}

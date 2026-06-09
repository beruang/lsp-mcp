export interface ChangeImpactRisk {
  level: "low" | "medium" | "high";
  message: string;
  evidence?: unknown;
}

export function classifyRisk(signals: {
  referenceCount: number;
  affectedFiles: number;
  incomingCallers: number;
  implementationCount: number;
  hasNearbyDiagnostics: boolean;
  definitionsOutsideFile: boolean;
}): ChangeImpactRisk[] {
  const risks: ChangeImpactRisk[] = [];

  // High-risk signals
  if (signals.referenceCount > 100) {
    risks.push({ level: "high", message: `High reference count (${signals.referenceCount} references) — renaming or signature change will impact many call sites.`, evidence: { referenceCount: signals.referenceCount } });
  }
  if (signals.incomingCallers > 20) {
    risks.push({ level: "high", message: `Many incoming callers (${signals.incomingCallers}) — signature change will require updating many call sites.`, evidence: { incomingCallers: signals.incomingCallers } });
  }
  if (signals.implementationCount > 5) {
    risks.push({ level: "high", message: `Many implementations (${signals.implementationCount}) — changing the interface/trait contract will affect all implementors.`, evidence: { implementationCount: signals.implementationCount } });
  }
  if (signals.affectedFiles > 10) {
    risks.push({ level: "high", message: `Symbol referenced in ${signals.affectedFiles} files — change has wide blast radius.`, evidence: { affectedFiles: signals.affectedFiles } });
  }

  // Medium-risk signals
  if (signals.referenceCount > 20 && signals.referenceCount <= 100) {
    risks.push({ level: "medium", message: `Moderate reference count (${signals.referenceCount} references).`, evidence: { referenceCount: signals.referenceCount } });
  }
  if (signals.affectedFiles > 3 && signals.affectedFiles <= 10) {
    risks.push({ level: "medium", message: `Symbol referenced in ${signals.affectedFiles} files.`, evidence: { affectedFiles: signals.affectedFiles } });
  }
  if (signals.hasNearbyDiagnostics) {
    risks.push({ level: "medium", message: "Existing diagnostics near symbol — fix these before making structural changes." });
  }
  if (signals.definitionsOutsideFile) {
    risks.push({ level: "medium", message: "Symbol defined outside current file — changes affect multiple files." });
  }

  // Low-risk (default when no flags triggered)
  if (risks.length === 0) {
    risks.push({ level: "low", message: "Few references, no cross-file usage, no nearby diagnostics." });
  }

  return risks;
}

export function generateRecommendations(risks: ChangeImpactRisk[], changeKind: string): string[] {
  const recs: string[] = [];

  const hasHigh = risks.some(r => r.level === "high");
  const hasMedium = risks.some(r => r.level === "medium");

  if (changeKind === "rename" || changeKind === "signature_change") {
    recs.push("Use lsp_rename_preview instead of manual rename to ensure all references are updated.");
  }
  if (changeKind === "signature_change" || changeKind === "behavior_change") {
    recs.push("Inspect incoming calls with lsp_incoming_calls before changing the signature.");
  }
  if (changeKind === "signature_change" || changeKind === "type_change" || changeKind === "delete_symbol") {
    recs.push("Inspect implementations with lsp_implementation before changing the interface/trait contract.");
  }
  if (hasHigh || hasMedium) {
    recs.push("Snapshot diagnostics with lsp_snapshot_diagnostics before and after editing to validate the change.");
    recs.push("Run typecheck after applying the patch externally to catch cascading errors.");
  }
  if (changeKind === "delete_symbol" && hasHigh) {
    recs.push("Symbol has many references — consider deprecation before deletion.");
  }
  if (changeKind === "visibility_change" && hasMedium) {
    recs.push("Changing visibility may break external consumers — check caller list for cross-module references.");
  }

  if (recs.length === 0) {
    recs.push("Low-risk change — standard edit workflow should suffice.");
  }

  return recs;
}

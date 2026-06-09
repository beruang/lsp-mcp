import type { NormalizedTextEdit } from "./parseWorkspaceEdit.js";
import type { SafetyViolation } from "./validateWorkspaceEdit.js";

function offset(edit: NormalizedTextEdit): number {
  return edit.range.start.line * 1_000_000 + edit.range.start.character;
}

function endOffset(edit: NormalizedTextEdit): number {
  return edit.range.end.line * 1_000_000 + edit.range.end.character;
}

export function detectOverlappingEdits(edits: NormalizedTextEdit[]): SafetyViolation[] {
  const violations: SafetyViolation[] = [];
  const byFile = new Map<string, NormalizedTextEdit[]>();

  for (const edit of edits) {
    const list = byFile.get(edit.filePath) ?? [];
    list.push(edit);
    byFile.set(edit.filePath, list);
  }

  for (const [filePath, fileEdits] of byFile) {
    if (fileEdits.length < 2) continue;
    const sorted = [...fileEdits].sort((a, b) => offset(a) - offset(b));
    for (let i = 0; i < sorted.length - 1; i++) {
      if (endOffset(sorted[i]) > offset(sorted[i + 1])) {
        violations.push({
          type: "overlapping_edits",
          message: `Overlapping edits in ${filePath}`,
          filePath,
        });
      }
    }
  }

  return violations;
}

interface Range {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

interface TextEdit {
  range: Range;
  newText: string;
}

class OverlappingEditsError extends Error {
  constructor() {
    super("Overlapping text edits detected");
    this.name = "OverlappingEditsError";
  }
}

/**
 * Apply a sorted list of non-overlapping TextEdits to original text.
 * Edits are applied in reverse order so earlier offsets remain valid.
 */
export function applyTextEdits(original: string, edits: TextEdit[]): string {
  if (edits.length === 0) return original;

  // Sort by position descending so we can apply from end to start
  const sorted = [...edits].sort((a, b) => {
    const lineCmp = b.range.start.line - a.range.start.line;
    if (lineCmp !== 0) return lineCmp;
    return b.range.start.character - a.range.start.character;
  });

  let result = original;

  // Detect overlapping edits
  for (let i = 0; i < sorted.length - 1; i++) {
    if (rangesOverlap(sorted[i].range, sorted[i + 1].range)) {
      throw new OverlappingEditsError();
    }
  }

  for (const edit of sorted) {
    const { start, end } = offsetRange(result, edit.range);
    result = result.slice(0, start) + edit.newText + result.slice(end);
  }

  return result;
}

function rangesOverlap(a: Range, b: Range): boolean {
  const aStart = a.start.line * 1_000_000 + a.start.character;
  const aEnd = a.end.line * 1_000_000 + a.end.character;
  const bStart = b.start.line * 1_000_000 + b.start.character;
  const bEnd = b.end.line * 1_000_000 + b.end.character;

  return aStart < bEnd && bStart < aEnd;
}

function offsetRange(text: string, range: Range): { start: number; end: number } {
  const lines = text.split("\n");
  let offset = 0;
  for (let i = 0; i < range.start.line; i++) {
    offset += lines[i].length + 1; // +1 for newline
  }
  const start = offset + range.start.character;

  let endOffset = 0;
  for (let i = 0; i < range.end.line; i++) {
    endOffset += lines[i].length + 1;
  }
  const end = endOffset + range.end.character;

  return { start, end };
}

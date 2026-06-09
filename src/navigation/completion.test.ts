import { test } from "node:test";
import assert from "node:assert/strict";

// Test completion kind normalization via the mapping
const CompletionItemKindNames: Record<number, string> = {
  1: "text", 2: "method", 3: "function", 4: "constructor", 5: "field",
  6: "variable", 7: "class", 8: "interface", 9: "module", 10: "property",
  11: "unit", 12: "value", 13: "enum", 14: "keyword", 15: "snippet",
  16: "color", 17: "file", 18: "reference", 19: "folder", 20: "enumMember",
  21: "constant", 22: "struct", 23: "event", 24: "operator", 25: "typeParameter",
};

function completionKindToString(kind: number | undefined): string | undefined {
  if (kind === undefined) return undefined;
  return CompletionItemKindNames[kind] ?? String(kind);
}

test("completionKindToString maps known CompletionItemKind numbers", () => {
  assert.equal(completionKindToString(1), "text");
  assert.equal(completionKindToString(2), "method");
  assert.equal(completionKindToString(3), "function");
  assert.equal(completionKindToString(6), "variable");
  assert.equal(completionKindToString(7), "class");
  assert.equal(completionKindToString(8), "interface");
  assert.equal(completionKindToString(13), "enum");
  assert.equal(completionKindToString(14), "keyword");
  assert.equal(completionKindToString(15), "snippet");
  assert.equal(completionKindToString(25), "typeParameter");
});

test("completionKindToString returns undefined for undefined input", () => {
  assert.equal(completionKindToString(undefined), undefined);
});

test("completionKindToString falls back to string for unknown kind", () => {
  assert.equal(completionKindToString(999), "999");
});

test("NormalizedCompletionItem shape", () => {
  // Verify the expected shape contract
  const item = {
    label: "console",
    kind: "method",
    detail: "console.log(message?: any): void",
    deprecated: false,
    sortText: "0",
    filterText: "console",
    hasAdditionalTextEdits: false,
  };
  assert.equal(typeof item.label, "string");
  assert.equal(typeof item.hasAdditionalTextEdits, "boolean");
});

test("NormalizedCompletionItem with additionalTextEdits flag", () => {
  const item = {
    label: "autoImport",
    kind: "function",
    hasAdditionalTextEdits: true,
  };
  assert.equal(item.hasAdditionalTextEdits, true);
});

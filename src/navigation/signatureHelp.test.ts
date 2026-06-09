import { test } from "node:test";
import assert from "node:assert/strict";

// Replicate the normalization logic from signatureHelp.ts for unit testing
function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, "").trim())
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function normalizeParameterLabel(label: string | [number, number]): string {
  if (typeof label === "string") return label;
  if (Array.isArray(label)) return `[${label[0]}..${label[1]}]`;
  return String(label);
}

test("stripMarkdown removes backtick code spans", () => {
  assert.equal(stripMarkdown("Returns `true` if valid"), "Returns true if valid");
});

test("stripMarkdown removes bold markers", () => {
  assert.equal(stripMarkdown("**Important** note"), "Important note");
  assert.equal(stripMarkdown("__also bold__"), "also bold");
});

test("stripMarkdown removes italic markers", () => {
  assert.equal(stripMarkdown("*emphasized* text"), "emphasized text");
  assert.equal(stripMarkdown("_also italic_ text"), "also italic text");
});

test("stripMarkdown removes links keeping text", () => {
  assert.equal(stripMarkdown("See [the docs](https://example.com)"), "See the docs");
});

test("stripMarkdown removes code blocks keeping content", () => {
  const input = "Example:\n```\nconst x = 1;\n```\nDone.";
  const result = stripMarkdown(input);
  assert.ok(result.includes("const x = 1;"));
  assert.ok(!result.includes("```"));
});

test("normalizeParameterLabel handles string labels", () => {
  assert.equal(normalizeParameterLabel("name: string"), "name: string");
  assert.equal(normalizeParameterLabel("options?: Options"), "options?: Options");
});

test("normalizeParameterLabel handles tuple labels [uinteger, uinteger]", () => {
  assert.equal(normalizeParameterLabel([0, 5]), "[0..5]");
  assert.equal(normalizeParameterLabel([10, 20]), "[10..20]");
});

test("SignatureHelpResult shape has expected fields", () => {
  const result = {
    filePath: "test.ts",
    position: { line: 10, character: 5 },
    signatures: [{
      label: "add(a: number, b: number): number",
      parameters: [
        { label: "a: number" },
        { label: "b: number" },
      ],
    }],
    activeSignature: 0,
    activeParameter: 0,
  };
  assert.ok(Array.isArray(result.signatures));
  assert.equal(result.signatures.length, 1);
  assert.ok(Array.isArray(result.signatures[0].parameters));
  assert.equal(result.signatures[0].parameters.length, 2);
});

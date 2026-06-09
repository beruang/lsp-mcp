import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { applyTextEdits } from "./applyTextEdits.js";

describe("applyTextEdits", () => {
  test("no edits returns original text", () => {
    const result = applyTextEdits("hello world", []);
    assert.equal(result, "hello world");
  });

  test("single edit replaces text", () => {
    const result = applyTextEdits("hello world", [
      { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, newText: "goodbye" },
    ]);
    assert.equal(result, "goodbye world");
  });

  test("multiple non-overlapping edits apply correctly", () => {
    const original = "line1\nline2\nline3\n";
    const edits = [
      { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, newText: "L1" },
      { range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } }, newText: "L2" },
    ];
    const result = applyTextEdits(original, edits);
    assert.equal(result, "L1\nL2\nline3\n");
  });

  test("throws on overlapping edits", () => {
    const original = "hello world";
    const edits = [
      { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } }, newText: "hi" },
      { range: { start: { line: 0, character: 3 }, end: { line: 0, character: 8 } }, newText: "there" },
    ];
    assert.throws(() => applyTextEdits(original, edits), { name: "OverlappingEditsError" });
  });

  test("multi-line edit works", () => {
    const original = "function oldName() {\n  return 1;\n}";
    const result = applyTextEdits(original, [
      { range: { start: { line: 0, character: 9 }, end: { line: 0, character: 16 } }, newText: "newName" },
    ]);
    assert.equal(result, "function newName() {\n  return 1;\n}");
  });
});

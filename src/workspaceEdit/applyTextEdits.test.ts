import { describe, it } from "node:test";
import assert from "node:assert";
import { applyTextEdits } from "./applyTextEdits.js";

describe("applyTextEdits", () => {
  it("applies a single edit", () => {
    const result = applyTextEdits("hello world", [
      { range: { start: { line: 0, character: 6 }, end: { line: 0, character: 11 } }, newText: "there" },
    ]);
    assert.strictEqual(result, "hello there");
  });

  it("applies multiple edits in reverse order", () => {
    const result = applyTextEdits("abc\ndef\nghi", [
      { range: { start: { line: 2, character: 0 }, end: { line: 2, character: 3 } }, newText: "xyz" },
      { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }, newText: "123" },
    ]);
    assert.strictEqual(result, "123\ndef\nxyz");
  });

  it("applies edit at position 0", () => {
    const result = applyTextEdits("abc", [
      { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "prepend-" },
    ]);
    assert.strictEqual(result, "prepend-abc");
  });

  it("applies edit at end of file", () => {
    const result = applyTextEdits("abc", [
      { range: { start: { line: 0, character: 3 }, end: { line: 0, character: 3 } }, newText: "-suffix" },
    ]);
    assert.strictEqual(result, "abc-suffix");
  });

  it("returns original for empty edits", () => {
    const result = applyTextEdits("abc", []);
    assert.strictEqual(result, "abc");
  });

  it("replaces entire line", () => {
    const result = applyTextEdits("line1\nline2\nline3", [
      { range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } }, newText: "replaced" },
    ]);
    assert.strictEqual(result, "line1\nreplaced\nline3");
  });

  it("throws on overlapping edits", () => {
    assert.throws(() => {
      applyTextEdits("hello world", [
        { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } }, newText: "hi" },
        { range: { start: { line: 0, character: 4 }, end: { line: 0, character: 10 } }, newText: "earth" },
      ]);
    });
  });

  it("handles multiline edit", () => {
    const result = applyTextEdits("line1\nline2\nline3", [
      { range: { start: { line: 0, character: 0 }, end: { line: 2, character: 5 } }, newText: "replacement" },
    ]);
    assert.strictEqual(result, "replacement");
  });
});

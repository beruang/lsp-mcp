import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { fileToUri, uriToRel, locationFromLsp, hoverToString } from "./normalize.js";

const WS = "/workspace";

describe("locationFromLsp", () => {
  test("Location shape returns workspace-relative path and range", () => {
    const abs = "/workspace/fixtures/sample-ts/src/util.ts";
    const loc = { uri: fileToUri(abs), range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } } };
    const result = locationFromLsp(WS, loc);
    assert.deepEqual(result, {
      filePath: "fixtures/sample-ts/src/util.ts",
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } },
    });
  });

  test("LocationLink shape returns workspace-relative path and targetRange", () => {
    const abs = "/workspace/fixtures/sample-ts/src/util.ts";
    const loc = {
      targetUri: fileToUri(abs),
      targetRange: { start: { line: 0, character: 13 }, end: { line: 0, character: 20 } },
      targetSelectionRange: { start: { line: 0, character: 13 }, end: { line: 0, character: 20 } },
    };
    const result = locationFromLsp(WS, loc);
    assert.deepEqual(result, {
      filePath: "fixtures/sample-ts/src/util.ts",
      range: { start: { line: 0, character: 13 }, end: { line: 0, character: 20 } },
    });
  });

  test("null input returns null", () => {
    assert.equal(locationFromLsp(WS, null), null);
  });

  test("undefined input returns null", () => {
    assert.equal(locationFromLsp(WS, undefined), null);
  });
});

describe("hoverToString", () => {
  test("MarkupContent with markdown returns value", () => {
    const result = hoverToString({ contents: { kind: "markdown", value: "**T**" } });
    assert.deepEqual(result, { contents: "**T**" });
  });

  test("MarkedString string returns as-is", () => {
    const result = hoverToString({ contents: "string content" });
    assert.deepEqual(result, { contents: "string content" });
  });

  test("MarkedString array joins with double newline", () => {
    const result = hoverToString({
      contents: [{ language: "ts", value: "x" }, "y"],
    });
    assert.deepEqual(result, { contents: "x\n\ny" });
  });

  test("null returns null contents", () => {
    assert.deepEqual(hoverToString(null), { contents: null });
  });

  test("undefined returns null contents", () => {
    assert.deepEqual(hoverToString(undefined), { contents: null });
  });

  test("hover with range preserves it", () => {
    const result = hoverToString({
      contents: "hello",
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
    });
    assert.deepEqual(result, {
      contents: "hello",
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
    });
  });
});

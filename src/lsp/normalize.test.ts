import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { fileToUri, locationFromLsp, hoverToString, symbolKindToString, documentSymbolsFromLsp } from "./normalize.js";
import { clampResults } from "../safety/limits.js";
import { SymbolKind } from "vscode-languageserver-types";

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

describe("symbolKindToString", () => {
  test("SymbolKind.Function (12) returns 'function'", () => {
    assert.equal(symbolKindToString(SymbolKind.Function), "function");
  });

  test("SymbolKind.Variable (13) returns 'variable'", () => {
    assert.equal(symbolKindToString(SymbolKind.Variable), "variable");
  });

  test("unknown numeric returns string of the number", () => {
    assert.equal(symbolKindToString(999), "999");
  });

  test("undefined returns 'unknown'", () => {
    assert.equal(symbolKindToString(undefined), "unknown");
  });

  test("string value is lowercased", () => {
    assert.equal(symbolKindToString("Function"), "function");
  });
});

describe("documentSymbolsFromLsp", () => {
  test("DocumentSymbol shape returns kind as 'function'", () => {
    const syms = [{
      name: "foo",
      kind: SymbolKind.Function,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
      selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
    }];
    const result = documentSymbolsFromLsp(WS, syms);
    assert.equal(result.length, 1);
    assert.equal(result[0].kind, "function");
    assert.equal(result[0].name, "foo");
  });

  test("SymbolInformation shape with containerName returns containerName and filePath", () => {
    const abs = "/workspace/fixtures/sample-ts/src/util.ts";
    const syms = [{
      name: "bar",
      kind: SymbolKind.Variable,
      location: { uri: fileToUri(abs), range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } } },
      containerName: "Outer",
    }];
    const result = documentSymbolsFromLsp(WS, syms);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "bar");
    assert.equal(result[0].kind, "variable");
    assert.equal(result[0].containerName, "Outer");
    assert.equal(result[0].filePath, "fixtures/sample-ts/src/util.ts");
  });

  test("null input returns empty array", () => {
    assert.deepEqual(documentSymbolsFromLsp(WS, null), []);
  });

  test("undefined input returns empty array", () => {
    assert.deepEqual(documentSymbolsFromLsp(WS, undefined), []);
  });
});

describe("clampResults", () => {
  test("returns all items when below max", () => {
    const arr = [1, 2, 3];
    const result = clampResults(arr, 5);
    assert.deepEqual(result, { items: arr, truncated: false, returned: 3 });
  });

  test("truncates when above max", () => {
    const arr = [1, 2, 3, 4, 5, 6];
    const result = clampResults(arr, 4);
    assert.deepEqual(result, { items: [1, 2, 3, 4], truncated: true, returned: 4 });
  });

  test("exact max returns non-truncated", () => {
    const arr = [1, 2, 3];
    const result = clampResults(arr, 3);
    assert.deepEqual(result, { items: arr, truncated: false, returned: 3 });
  });
});

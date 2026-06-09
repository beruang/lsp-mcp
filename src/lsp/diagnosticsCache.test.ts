import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { diagnosticsCache } from "./diagnosticsCache.js";
import type { NormalizedDiagnostic } from "./diagnosticsCache.js";

const diag: NormalizedDiagnostic = {
  filePath: "src/index.ts",
  severity: "error",
  message: "Cannot find name 'foo'",
  source: "ts",
  code: 2304,
  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
};

const diag2: NormalizedDiagnostic = {
  filePath: "src/util.ts",
  severity: "warning",
  message: "Unused variable",
  source: "ts",
  code: 6133,
  range: { start: { line: 1, character: 0 }, end: { line: 1, character: 10 } },
};

describe("diagnosticsCache", () => {
  test("get returns empty array for unknown URI", () => {
    diagnosticsCache.clear();
    assert.deepEqual(diagnosticsCache.get("file:///unknown.ts"), []);
  });

  test("set and get round-trip", () => {
    diagnosticsCache.clear();
    diagnosticsCache.set("file:///src/index.ts", [diag]);
    assert.deepEqual(diagnosticsCache.get("file:///src/index.ts"), [diag]);
  });

  test("set replaces previous diagnostics for the same URI", () => {
    diagnosticsCache.clear();
    diagnosticsCache.set("file:///src/index.ts", [diag]);
    diagnosticsCache.set("file:///src/index.ts", [diag2]);
    assert.deepEqual(diagnosticsCache.get("file:///src/index.ts"), [diag2]);
  });

  test("all returns all diagnostics across URIs", () => {
    diagnosticsCache.clear();
    diagnosticsCache.set("file:///src/index.ts", [diag]);
    diagnosticsCache.set("file:///src/util.ts", [diag2]);
    const all = diagnosticsCache.all();
    assert.equal(all.length, 2);
  });

  test("clear removes all entries", () => {
    diagnosticsCache.clear();
    diagnosticsCache.set("file:///src/index.ts", [diag]);
    diagnosticsCache.clear();
    assert.equal(diagnosticsCache.all().length, 0);
  });

  test("awaitDiagnostics resolves with cache contents after timeout", async () => {
    diagnosticsCache.clear();
    diagnosticsCache.set("file:///src/index.ts", [diag]);
    const start = Date.now();
    const result = await diagnosticsCache.awaitDiagnostics("file:///src/index.ts", 100);
    const elapsed = Date.now() - start;
    assert.deepEqual(result, [diag]);
    assert.ok(elapsed >= 90, `Expected >= 90ms but got ${elapsed}ms`);
  });

  test("awaitAllDiagnostics resolves with all cache contents after timeout", async () => {
    diagnosticsCache.clear();
    diagnosticsCache.set("file:///a.ts", [diag]);
    diagnosticsCache.set("file:///b.ts", [diag2]);
    const start = Date.now();
    const result = await diagnosticsCache.awaitAllDiagnostics(100);
    const elapsed = Date.now() - start;
    assert.equal(result.length, 2);
    assert.ok(elapsed >= 90, `Expected >= 90ms but got ${elapsed}ms`);
  });
});

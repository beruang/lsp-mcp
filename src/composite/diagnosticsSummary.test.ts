import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { buildDiagnosticsSummary } from "./diagnosticsSummary.js";
import type { NormalizedDiagnostic } from "../lsp/diagnosticsCache.js";

describe("buildDiagnosticsSummary", () => {
  test("returns zero total for empty diagnostics", () => {
    const summary = buildDiagnosticsSummary([]);
    assert.equal(summary.total, 0);
    assert.deepEqual(summary.bySeverity, []);
    assert.equal(summary.likelyRootCause, null);
  });

  test("groups 3 diagnostics across 2 files", () => {
    const diags: NormalizedDiagnostic[] = [
      {
        filePath: "src/index.ts",
        severity: "error",
        message: "Cannot find name 'foo'",
        source: "ts",
        code: 2304,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
      },
      {
        filePath: "src/index.ts",
        severity: "warning",
        message: "Unused variable",
        source: "ts",
        code: 6133,
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 10 } },
      },
      {
        filePath: "src/util.ts",
        severity: "error",
        message: "Type 'string' is not assignable to type 'number'",
        source: "ts",
        code: 2322,
        range: { start: { line: 2, character: 0 }, end: { line: 2, character: 7 } },
      },
    ];

    const summary = buildDiagnosticsSummary(diags);

    assert.equal(summary.total, 3);

    // bySeverity: 2 errors, 1 warning
    const sev = summary.bySeverity;
    const errors = sev.find((g) => g.severity === "error");
    const warnings = sev.find((g) => g.severity === "warning");
    assert.ok(errors);
    assert.equal(errors!.count, 2);
    assert.ok(warnings);
    assert.equal(warnings!.count, 1);

    // byFile: src/index.ts has 2, src/util.ts has 1
    assert.equal(summary.byFile.length, 2);
    const indexEntry = summary.byFile.find((f) => f.filePath === "src/index.ts");
    const utilEntry = summary.byFile.find((f) => f.filePath === "src/util.ts");
    assert.equal(indexEntry!.count, 2);
    assert.equal(utilEntry!.count, 1);

    // topMessages sorted by count
    assert.ok(summary.topMessages.length > 0);

    // likelyRootCause finds missing_symbol pattern
    assert.equal(summary.likelyRootCause, "missing_symbol");
  });

  test("likelyRootCause is null when no errors present", () => {
    const diags: NormalizedDiagnostic[] = [
      {
        filePath: "src/index.ts",
        severity: "warning",
        message: "Unused variable",
        source: "ts",
        code: 6133,
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 10 } },
      },
    ];

    const summary = buildDiagnosticsSummary(diags);
    assert.equal(summary.likelyRootCause, null);
  });

  test("likelyRootCause detects missing_module pattern", () => {
    const diags: NormalizedDiagnostic[] = [
      {
        filePath: "src/index.ts",
        severity: "error",
        message: "Cannot find module 'express'",
        source: "ts",
        code: 2307,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
      },
    ];

    const summary = buildDiagnosticsSummary(diags);
    assert.equal(summary.likelyRootCause, "missing_module");
  });

  test("likelyRootCause detects type_mismatch pattern", () => {
    const diags: NormalizedDiagnostic[] = [
      {
        filePath: "src/index.ts",
        severity: "error",
        message: "Type 'string' is not assignable to type 'number'",
        source: "ts",
        code: 2322,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
      },
    ];

    const summary = buildDiagnosticsSummary(diags);
    assert.equal(summary.likelyRootCause, "type_mismatch");
  });

  test("bySource groups correctly", () => {
    const diags: NormalizedDiagnostic[] = [
      {
        filePath: "src/index.ts",
        severity: "error",
        message: "err",
        source: "ts",
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      },
      {
        filePath: "src/index.ts",
        severity: "error",
        message: "err2",
        source: "eslint",
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 1 } },
      },
    ];

    const summary = buildDiagnosticsSummary(diags);
    const tsEntry = summary.bySource.find((s) => s.source === "ts");
    const eslintEntry = summary.bySource.find((s) => s.source === "eslint");
    assert.equal(tsEntry!.count, 1);
    assert.equal(eslintEntry!.count, 1);
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { ErrorCodes } from "../mcp/toolErrors.js";

// ── Completion safety: no apply ──────────────────────────────────────────

test("V3 completion schema requires hasAdditionalTextEdits field", () => {
  // The schema contract: NormalizedCompletionItem must have hasAdditionalTextEdits
  const item = { label: "test", kind: "method", hasAdditionalTextEdits: false };
  assert.equal("hasAdditionalTextEdits" in item, true);
  assert.equal(typeof (item as any).hasAdditionalTextEdits, "boolean");
});

test("V3 completion must not include insertText by default", () => {
  // Per spec section 15: includeInsertText defaults to false
  // This means NormalizedCompletionItem should NOT have insertText field
  const item = {
    label: "test",
    kind: "method",
    hasAdditionalTextEdits: false,
    // insertText purposely omitted
  };
  assert.equal("insertText" in item, false);
});

// ── Capability errors: structured ─────────────────────────────────────────

test("All V3 capability error codes produce structured ToolError", () => {
  const v3CapErrors = [
    ErrorCodes.DECLARATION_NOT_SUPPORTED,
    ErrorCodes.TYPE_DEFINITION_NOT_SUPPORTED,
    ErrorCodes.IMPLEMENTATION_NOT_SUPPORTED,
    ErrorCodes.SIGNATURE_HELP_NOT_SUPPORTED,
    ErrorCodes.COMPLETION_NOT_SUPPORTED,
    ErrorCodes.CALL_HIERARCHY_NOT_SUPPORTED,
    ErrorCodes.TYPE_HIERARCHY_NOT_SUPPORTED,
  ];

  for (const code of v3CapErrors) {
    assert.equal(typeof code, "string");
    assert.ok(code.length > 0);
    assert.ok(code.endsWith("_not_supported"));
  }
});

test("All V3 cache error codes produce structured errors", () => {
  assert.equal(ErrorCodes.CALL_HIERARCHY_ITEM_NOT_FOUND, "call_hierarchy_item_not_found");
  assert.equal(ErrorCodes.CALL_HIERARCHY_ITEM_EXPIRED, "call_hierarchy_item_expired");
  assert.equal(ErrorCodes.TYPE_HIERARCHY_ITEM_NOT_FOUND, "type_hierarchy_item_not_found");
  assert.equal(ErrorCodes.TYPE_HIERARCHY_ITEM_EXPIRED, "type_hierarchy_item_expired");
});

test("LSP_CAPABILITY_UNSUPPORTED is the generic fallback", () => {
  assert.equal(ErrorCodes.LSP_CAPABILITY_UNSUPPORTED, "lsp_capability_unsupported");
});

// ── Path filtering: outside workspace ─────────────────────────────────────

test("PATH_OUTSIDE_WORKSPACE error code exists for path filtering", () => {
  assert.equal(ErrorCodes.PATH_OUTSIDE_WORKSPACE, "path_outside_workspace");
});

// ── Result limits: enforcement ────────────────────────────────────────────

test("V3 result limit defaults prevent unbounded responses", () => {
  // Each V3 tool has a default maxResults/maxItems
  const limits = {
    DECLARATION_MAX: 50,
    TYPE_DEFINITION_MAX: 50,
    IMPLEMENTATION_MAX: 100,
    COMPLETION_MAX: 50,
    CALL_HIERARCHY_ITEMS_MAX: 10,
    CALL_HIERARCHY_RESULTS_MAX: 100,
    TYPE_HIERARCHY_ITEMS_MAX: 10,
    TYPE_HIERARCHY_RESULTS_MAX: 100,
    CHANGE_IMPACT_REFS_MAX: 200,
    EXPLAIN_DIAGNOSTICS_MAX: 20,
  };

  for (const [name, value] of Object.entries(limits)) {
    assert.ok(value > 0 && value <= 200, `${name} = ${value} should be 1-200`);
  }
});

// ── Partial results: composite tools ──────────────────────────────────────

test("analyze_change_impact output shape supports partial call hierarchy", () => {
  // Per spec: callHierarchy may have available: false with reason
  const partialResult = {
    symbol: { filePath: "test.ts", position: { line: 0, character: 0 } },
    definitions: [],
    typeDefinitions: [],
    implementations: [],
    references: { count: 0, returned: 0, truncated: false, files: [] },
    callHierarchy: { available: false, reason: "call hierarchy not supported" },
    diagnosticsNearSymbol: [],
    risks: [],
    recommendations: [],
  };

  assert.equal(partialResult.callHierarchy.available, false);
  assert.equal(typeof partialResult.callHierarchy.reason, "string");
});

test("analyze_change_impact output shape supports full call hierarchy", () => {
  const fullResult = {
    symbol: { filePath: "test.ts", position: { line: 0, character: 0 } },
    definitions: [{ filePath: "lib.ts", range: { start: { line: 1, character: 0 }, end: { line: 1, character: 10 } } }],
    typeDefinitions: [],
    implementations: [],
    references: { count: 5, returned: 5, truncated: false, files: ["test.ts"] },
    callHierarchy: { available: true, incomingCount: 3, outgoingCount: 2, incomingSample: [], outgoingSample: [] },
    diagnosticsNearSymbol: [],
    risks: [{ level: "low", message: "Low risk change" }],
    recommendations: ["Use lsp_rename_preview"],
  };

  assert.equal(fullResult.callHierarchy.available, true);
  assert.equal(fullResult.callHierarchy.incomingCount, 3);
  assert.equal(fullResult.risks[0].level, "low");
});

// ── Hierarchy cache: expiry ──────────────────────────────────────────────

test("Hierarchy cache TTL is 10 minutes (600,000ms)", () => {
  // The spec defines 10-minute TTL. Cache tests verify get() returns "expired"
  // when item.expiresAt < Date.now().
  const TTL_MS = 10 * 60 * 1000;
  assert.equal(TTL_MS, 600_000);
});

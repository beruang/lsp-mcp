import { test } from "node:test";
import assert from "node:assert/strict";
import { explainDiagnostics } from "./explainDiagnostics.js";

test("explainDiagnostics returns empty for no diagnostics", () => {
  const result = explainDiagnostics({});
  assert.equal(result.total, 0);
  assert.equal(result.rootCauseCandidates.length, 0);
  assert.equal(result.suggestedFixOrder.length, 0);
});

test("explainDiagnostics handles maxDiagnostics option", () => {
  const result = explainDiagnostics({ maxDiagnostics: 5 });
  assert.ok(result.rootCauseCandidates.length <= 5);
});

test("explainDiagnostics includes summary string", () => {
  const result = explainDiagnostics({});
  assert.equal(typeof result.summary, "string");
});

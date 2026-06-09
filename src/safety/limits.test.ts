import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITS } from "./limits.js";

test("V3 result limits are defined", () => {
  assert.equal(LIMITS.DECLARATION_MAX, 50);
  assert.equal(LIMITS.TYPE_DEFINITION_MAX, 50);
  assert.equal(LIMITS.IMPLEMENTATION_MAX, 100);
  assert.equal(LIMITS.COMPLETION_MAX, 50);
  assert.equal(LIMITS.CALL_HIERARCHY_ITEMS_MAX, 10);
  assert.equal(LIMITS.CALL_HIERARCHY_RESULTS_MAX, 100);
  assert.equal(LIMITS.TYPE_HIERARCHY_ITEMS_MAX, 10);
  assert.equal(LIMITS.TYPE_HIERARCHY_RESULTS_MAX, 100);
  assert.equal(LIMITS.CHANGE_IMPACT_REFS_MAX, 200);
  assert.equal(LIMITS.EXPLAIN_DIAGNOSTICS_MAX, 20);
});

test("V3 timeouts are defined", () => {
  assert.equal(LIMITS.TIMEOUTS.DECLARATION_MS, 5_000);
  assert.equal(LIMITS.TIMEOUTS.TYPE_DEFINITION_MS, 5_000);
  assert.equal(LIMITS.TIMEOUTS.IMPLEMENTATION_MS, 10_000);
  assert.equal(LIMITS.TIMEOUTS.SIGNATURE_HELP_MS, 3_000);
  assert.equal(LIMITS.TIMEOUTS.COMPLETION_MS, 5_000);
  assert.equal(LIMITS.TIMEOUTS.PREPARE_CALL_HIERARCHY_MS, 5_000);
  assert.equal(LIMITS.TIMEOUTS.INCOMING_CALLS_MS, 10_000);
  assert.equal(LIMITS.TIMEOUTS.OUTGOING_CALLS_MS, 10_000);
  assert.equal(LIMITS.TIMEOUTS.PREPARE_TYPE_HIERARCHY_MS, 5_000);
  assert.equal(LIMITS.TIMEOUTS.SUPERTYPES_MS, 10_000);
  assert.equal(LIMITS.TIMEOUTS.SUBTYPES_MS, 10_000);
  assert.equal(LIMITS.TIMEOUTS.ANALYZE_CHANGE_IMPACT_MS, 20_000);
  assert.equal(LIMITS.TIMEOUTS.FIX_DIAGNOSTIC_CANDIDATES_MS, 15_000);
  assert.equal(LIMITS.TIMEOUTS.EXPLAIN_DIAGNOSTICS_MS, 15_000);
});

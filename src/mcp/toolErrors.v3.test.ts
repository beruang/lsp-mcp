import { test } from "node:test";
import assert from "node:assert/strict";
import { ErrorCodes, toolError } from "./toolErrors.js";

test("V3 error codes are defined", () => {
  assert.equal(ErrorCodes.DECLARATION_NOT_SUPPORTED, "declaration_not_supported");
  assert.equal(ErrorCodes.TYPE_DEFINITION_NOT_SUPPORTED, "type_definition_not_supported");
  assert.equal(ErrorCodes.IMPLEMENTATION_NOT_SUPPORTED, "implementation_not_supported");
  assert.equal(ErrorCodes.SIGNATURE_HELP_NOT_SUPPORTED, "signature_help_not_supported");
  assert.equal(ErrorCodes.COMPLETION_NOT_SUPPORTED, "completion_not_supported");
  assert.equal(ErrorCodes.CALL_HIERARCHY_NOT_SUPPORTED, "call_hierarchy_not_supported");
  assert.equal(ErrorCodes.CALL_HIERARCHY_ITEM_NOT_FOUND, "call_hierarchy_item_not_found");
  assert.equal(ErrorCodes.CALL_HIERARCHY_ITEM_EXPIRED, "call_hierarchy_item_expired");
  assert.equal(ErrorCodes.TYPE_HIERARCHY_NOT_SUPPORTED, "type_hierarchy_not_supported");
  assert.equal(ErrorCodes.TYPE_HIERARCHY_ITEM_NOT_FOUND, "type_hierarchy_item_not_found");
  assert.equal(ErrorCodes.TYPE_HIERARCHY_ITEM_EXPIRED, "type_hierarchy_item_expired");
  assert.equal(ErrorCodes.CHANGE_IMPACT_ANALYSIS_INCOMPLETE, "change_impact_analysis_incomplete");
  assert.equal(ErrorCodes.DIAGNOSTIC_NOT_FOUND, "diagnostic_not_found");
});

test("lsp_capability_unsupported still exists", () => {
  assert.equal(ErrorCodes.LSP_CAPABILITY_UNSUPPORTED, "lsp_capability_unsupported");
});

test("toolError with V3 error codes", () => {
  const err = toolError(ErrorCodes.DIAGNOSTIC_NOT_FOUND, "No diagnostic matched");
  assert.deepEqual(err, { error: { code: "diagnostic_not_found", message: "No diagnostic matched" } });
});

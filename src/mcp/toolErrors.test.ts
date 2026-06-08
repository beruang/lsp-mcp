import { test } from "node:test";
import assert from "node:assert/strict";
import { toolError } from "./toolErrors.js";

test("toolError(code, message) returns the structured envelope without details", () => {
  const result = toolError("foo", "bar");
  assert.deepEqual(result, { error: { code: "foo", message: "bar" } });
});

test("toolError(code, message, details) includes the details field when provided", () => {
  const result = toolError("foo", "bar", { extra: 1 });
  assert.deepEqual(result, {
    error: { code: "foo", message: "bar", details: { extra: 1 } },
  });
});

test("toolError omits the details key when details is undefined", () => {
  const result = toolError("foo", "bar", undefined);
  assert.equal("details" in result.error, false);
});

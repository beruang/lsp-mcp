import { test } from "node:test";
import assert from "node:assert/strict";
import { withTimeout } from "./asyncTimeout.js";

test("withTimeout(Promise.resolve(1), 100, 'fast') returns 1", async () => {
  const result = await withTimeout(Promise.resolve(1), 100, "fast");
  assert.equal(result, 1);
});

test("withTimeout(new Promise((r) => setTimeout(() => r(2), 500)), 50, 'slow') rejects with a timeout: slow Error", async () => {
  await assert.rejects(
    withTimeout(new Promise((r) => setTimeout(() => r(2), 500)), 50, "slow"),
    (err: unknown) => {
      return err instanceof Error && err.message === "timeout: slow";
    }
  );
});
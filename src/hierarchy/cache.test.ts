import { test } from "node:test";
import assert from "node:assert/strict";
import { CallHierarchyCache, callHierarchyCache as globalCallCache } from "./callHierarchyCache.js";
import { TypeHierarchyCache, typeHierarchyCache as globalTypeCache } from "./typeHierarchyCache.js";

// ── Call Hierarchy ────────────────────────────────────────────────────────

test("CallHierarchyCache set returns UUID", () => {
  const cache = new CallHierarchyCache();
  const normalized = {
    id: "", name: "testFn", kind: "function",
    filePath: "src/test.ts",
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
  };
  const id = cache.set({ name: "testFn" }, normalized, "/ws", "typescript");
  assert.ok(id.length > 30);
  cache.dispose();
});

test("CallHierarchyCache get returns item with language", () => {
  const cache = new CallHierarchyCache();
  const normalized = {
    id: "", name: "fn", kind: "function",
    filePath: "x.ts", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
  };
  const id = cache.set({}, normalized, "/ws", "typescript");
  const result = cache.get(id);
  assert.notEqual(result, "not_found");
  assert.notEqual(result, "expired");
  if (typeof result !== "string") {
    assert.equal(result.normalizedItem.name, "fn");
    assert.equal(result.language, "typescript");
  }
  cache.dispose();
});

test("CallHierarchyCache not_found and expired", () => {
  const cache = new CallHierarchyCache();
  assert.equal(cache.get("nonexistent"), "not_found");

  const normalized = {
    id: "", name: "x", kind: "function",
    filePath: "x.ts", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
  };
  const id = cache.set({}, normalized, "/ws", "ts");
  const items = (cache as any).items;
  items.get(id).expiresAt = Date.now() - 1;
  assert.equal(cache.get(id), "expired");
  cache.dispose();
});

// ── Type Hierarchy ─────────────────────────────────────────────────────────

test("TypeHierarchyCache set and get", () => {
  const cache = new TypeHierarchyCache();
  const normalized = {
    id: "", name: "MyClass", kind: "class",
    filePath: "src/test.ts",
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
  };
  const id = cache.set({ name: "MyClass" }, normalized, "/ws", "typescript");
  assert.ok(id.length > 30);
  const result = cache.get(id);
  if (typeof result !== "string") {
    assert.equal(result.normalizedItem.name, "MyClass");
    assert.equal(result.language, "typescript");
  }
  cache.dispose();
});

test("TypeHierarchyCache not_found and expired", () => {
  const cache = new TypeHierarchyCache();
  assert.equal(cache.get("bad"), "not_found");

  const normalized = {
    id: "", name: "C", kind: "class",
    filePath: "x.ts", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
  };
  const id = cache.set({}, normalized, "/ws", "ts");
  const items = (cache as any).items;
  items.get(id).expiresAt = Date.now() - 1;
  assert.equal(cache.get(id), "expired");
  cache.dispose();
});

// Clean up module-level singletons
test("cleanup singletons", () => {
  globalCallCache.dispose();
  globalTypeCache.dispose();
});

import { describe, it } from "node:test";
import assert from "node:assert";
import { mkdirSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateWorkspaceEdit } from "./validateWorkspaceEdit.js";
import { detectOverlappingEdits } from "./overlappingEdits.js";
import type { ParsedWorkspaceEdit, NormalizedTextEdit } from "./parseWorkspaceEdit.js";

const tmp = join(tmpdir(), "mcp-lsp-v2-test-" + Date.now());
mkdirSync(tmp, { recursive: true });
const ws = tmp;

function makeFile(name: string): string {
  const p = join(ws, name);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, "content");
  return p;
}

const existingFile = makeFile("src/exists.ts");

function cleanup() {
  try { unlinkSync(existingFile); } catch {}
  try { rmdirSync(join(ws, "src")); } catch {}
  try { rmdirSync(ws); } catch {}
}

function parsed(overrides: Partial<ParsedWorkspaceEdit> = {}): ParsedWorkspaceEdit {
  return {
    edits: [],
    changedFiles: [],
    editCount: 0,
    hasResourceOperations: false,
    resourceOperations: [],
    unsupportedSchemes: [],
    ...overrides,
  };
}

function makeEdit(filePath: string, startLine: number, startChar: number, endLine: number, endChar: number): NormalizedTextEdit {
  return {
    filePath,
    range: { start: { line: startLine, character: startChar }, end: { line: endLine, character: endChar } },
    newText: "x",
  };
}

describe("validateWorkspaceEdit", () => {
  it("returns safe:true for valid in-workspace edit", () => {
    const result = validateWorkspaceEdit(
      parsed({ changedFiles: [existingFile], editCount: 1 }),
      ws
    );
    assert.strictEqual(result.safe, true);
    assert.strictEqual(result.violations.length, 0);
  });

  it("returns unsupported_scheme violation", () => {
    const result = validateWorkspaceEdit(
      parsed({ unsupportedSchemes: ["http://remote/file.ts"] }),
      ws
    );
    assert.strictEqual(result.safe, false);
    assert.strictEqual(result.violations[0].type, "unsupported_scheme");
  });

  it("detects file_not_found violation", () => {
    const result = validateWorkspaceEdit(
      parsed({ changedFiles: [join(ws, "nonexistent.ts")], editCount: 1 }),
      ws
    );
    assert.strictEqual(result.safe, false);
    assert.strictEqual(result.violations[0].type, "file_not_found");
  });

  it("detects too_many_files violation", () => {
    const files = Array.from({ length: 101 }, (_, i) => join(ws, `f${i}.ts`));
    const result = validateWorkspaceEdit(
      parsed({ changedFiles: files, editCount: 101 }),
      ws
    );
    assert.strictEqual(result.safe, false);
    assert.ok(result.violations.some((v) => v.type === "too_many_files"));
  });

  it("detects too_many_edits violation", () => {
    const result = validateWorkspaceEdit(
      parsed({ changedFiles: [existingFile], editCount: 1001 }),
      ws
    );
    assert.strictEqual(result.safe, false);
    assert.ok(result.violations.some((v) => v.type === "too_many_edits"));
  });

  it("detects overlapping_edits violation", () => {
    const edits: NormalizedTextEdit[] = [
      makeEdit(existingFile, 0, 0, 0, 10),
      makeEdit(existingFile, 0, 5, 0, 15),
    ];
    const result = validateWorkspaceEdit(
      parsed({ edits, changedFiles: [existingFile], editCount: 2 }),
      ws
    );
    assert.strictEqual(result.safe, false);
    assert.ok(result.violations.some((v) => v.type === "overlapping_edits"));
  });

  it("accumulates multiple violations", () => {
    const result = validateWorkspaceEdit(
      parsed({
        unsupportedSchemes: ["http://x.com/f.ts"],
        resourceOperations: [{ kind: "create", uri: "file:///new.ts" }],
        changedFiles: Array.from({ length: 101 }, (_, i) => join(ws, `f${i}.ts`)),
        editCount: 1001,
      }),
      ws
    );
    assert.strictEqual(result.safe, false);
    assert.ok(result.violations.length >= 4);
  });

  it("respects custom maxFiles option", () => {
    const files = Array.from({ length: 10 }, (_, i) => join(ws, `g${i}.ts`));
    const result = validateWorkspaceEdit(
      parsed({ changedFiles: files, editCount: 10 }),
      ws,
      { maxFiles: 5 }
    );
    assert.ok(result.violations.some((v) => v.type === "too_many_files"));
  });

  it("respects custom maxEdits option", () => {
    const result = validateWorkspaceEdit(
      parsed({ changedFiles: [existingFile], editCount: 50 }),
      ws,
      { maxEdits: 10 }
    );
    assert.ok(result.violations.some((v) => v.type === "too_many_edits"));
  });

  it("rejects resource operations", () => {
    const result = validateWorkspaceEdit(
      parsed({ resourceOperations: [{ kind: "create", uri: "file:///new.ts" }], hasResourceOperations: true }),
      ws
    );
    assert.strictEqual(result.safe, false);
    assert.ok(result.violations.some((v) => v.type === "unsupported_resource_operation"));
  });

  it("empty parsed edit returns safe:true", () => {
    const result = validateWorkspaceEdit(parsed(), ws);
    assert.strictEqual(result.safe, true);
  });
});

describe("detectOverlappingEdits", () => {
  it("returns empty for non-overlapping edits", () => {
    const edits: NormalizedTextEdit[] = [
      makeEdit(existingFile, 0, 0, 0, 5),
      makeEdit(existingFile, 0, 10, 0, 15),
    ];
    const violations = detectOverlappingEdits(edits);
    assert.strictEqual(violations.length, 0);
  });

  it("returns violations for overlapping edits", () => {
    const edits: NormalizedTextEdit[] = [
      makeEdit(existingFile, 0, 0, 0, 10),
      makeEdit(existingFile, 0, 5, 0, 15),
    ];
    const violations = detectOverlappingEdits(edits);
    assert.strictEqual(violations.length, 1);
    assert.strictEqual(violations[0].type, "overlapping_edits");
  });

  it("handles edits in different files", () => {
    const edits: NormalizedTextEdit[] = [
      makeEdit(join(ws, "a.ts"), 0, 0, 0, 10),
      makeEdit(join(ws, "b.ts"), 0, 5, 0, 15),
    ];
    const violations = detectOverlappingEdits(edits);
    assert.strictEqual(violations.length, 0);
  });

  it("handles empty edits list", () => {
    const violations = detectOverlappingEdits([]);
    assert.strictEqual(violations.length, 0);
  });
});

process.on("exit", cleanup);

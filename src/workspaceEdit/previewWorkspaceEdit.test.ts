import { describe, it } from "node:test";
import assert from "node:assert";
import { mkdirSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildWorkspaceEditPreview, buildValidateWorkspaceEditResult, generateDiff } from "./previewWorkspaceEdit.js";

const tmp = join(tmpdir(), "mcp-lsp-v2-preview-test-" + Date.now());
const srcDir = join(tmp, "src");
mkdirSync(srcDir, { recursive: true });
const testFile = join(srcDir, "sample.ts");
writeFileSync(testFile, "const x = 1;\n\nfunction hello() {\n  return x;\n}\n");

function cleanup() {
  try { unlinkSync(testFile); } catch {}
  try { rmdirSync(srcDir); } catch {}
  try { rmdirSync(tmp); } catch {}
}

describe("buildWorkspaceEditPreview", () => {
  it("returns safe preview with diff for valid edit", () => {
    const raw = {
      changes: {
        [`file://${testFile}`]: [
          {
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
            newText: "let",
          },
        ],
      },
    };
    const result = buildWorkspaceEditPreview(raw, tmp, { includeDiff: true });
    assert.strictEqual(result.safe, true);
    assert.strictEqual(result.editCount, 1);
    assert.strictEqual(result.changedFiles.length, 1);
    assert.ok(result.diff);
    assert.ok(result.diff.includes("let"));
    assert.ok(result.diff.includes("const"));
  });

  it("returns safe:false for unsupported scheme", () => {
    const raw = {
      changes: {
        "http://remote/file.ts": [
          { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "" },
        ],
      },
    };
    const result = buildWorkspaceEditPreview(raw, tmp);
    assert.strictEqual(result.safe, false);
    assert.ok(result.violations.some((v) => v.type === "unsupported_scheme"));
  });

  it("returns safe preview without diff when includeDiff is false", () => {
    const raw = {
      changes: {
        [`file://${testFile}`]: [
          {
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
            newText: "let",
          },
        ],
      },
    };
    const result = buildWorkspaceEditPreview(raw, tmp, { includeDiff: false });
    assert.strictEqual(result.safe, true);
    assert.strictEqual(result.diff, undefined);
  });

  it("resource operation returns violations", () => {
    const raw = {
      documentChanges: [{ kind: "create", uri: "file:///new.ts" }],
    };
    const result = buildWorkspaceEditPreview(raw, tmp);
    assert.strictEqual(result.safe, false);
    assert.ok(result.violations.some((v) => v.type === "unsupported_resource_operation"));
  });
});

describe("buildValidateWorkspaceEditResult", () => {
  it("returns validation without diff", () => {
    const raw = {
      changes: {
        [`file://${testFile}`]: [
          {
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
            newText: "let",
          },
        ],
      },
    };
    const result = buildValidateWorkspaceEditResult(raw, tmp);
    assert.strictEqual(result.safe, true);
    assert.strictEqual("diff" in result, false);
  });

  it("flags hasResourceOperations", () => {
    const raw = {
      documentChanges: [
        { kind: "create", uri: "file:///new.ts" },
        { textDocument: { uri: `file://${testFile}` }, edits: [] },
      ],
    };
    const result = buildValidateWorkspaceEditResult(raw, tmp);
    assert.strictEqual(result.hasResourceOperations, true);
  });
});

describe("generateDiff", () => {
  it("produces standard unified diff format", () => {
    const diff = generateDiff("/tmp/f.ts", "before", "after");
    assert.ok(diff.includes("---"));
    assert.ok(diff.includes("+++"));
    assert.ok(diff.includes("before"));
    assert.ok(diff.includes("after"));
  });
});

process.on("exit", cleanup);

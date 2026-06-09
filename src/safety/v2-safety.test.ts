import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseWorkspaceEdit } from "../workspaceEdit/parseWorkspaceEdit.js";
import { validateWorkspaceEdit } from "../workspaceEdit/validateWorkspaceEdit.js";
import { buildWorkspaceEditPreview } from "../workspaceEdit/previewWorkspaceEdit.js";
import { codeActionCache } from "../codeActions/codeActionCache.js";
import { snapshotStore } from "../diagnostics/snapshotStore.js";
import { compareDiagnostics } from "../diagnostics/compareDiagnostics.js";
import { isCommandAllowed } from "../codeActions/commandSafety.js";
import { normalizeCodeAction } from "../codeActions/normalizeCodeAction.js";

const tmp = join(tmpdir(), "mcp-lsp-v2-safety-" + Date.now());
const srcDir = join(tmp, "src");
mkdirSync(srcDir, { recursive: true });
const testFile = join(srcDir, "test.ts");
writeFileSync(testFile, "const x = 1;\nconst y = 2;\n");

function cleanup() {
  try { unlinkSync(testFile); } catch {}
  try { rmdirSync(srcDir); } catch {}
  try { rmdirSync(tmp); } catch {}
}

describe("V2 Safety Tests", () => {
  // 1. Outside workspace edit
  it("rejects unsupported scheme (http URI)", () => {
    const raw = {
      changes: {
        "http://evil.com/malware.ts": [
          { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "pwned" },
        ],
      },
    };
    const parsed = parseWorkspaceEdit(raw, tmp);
    const result = validateWorkspaceEdit(parsed, tmp);
    assert.strictEqual(result.safe, false);
    assert.ok(result.violations.some((v) => v.type === "unsupported_scheme"));
  });

  // 2. Unsupported URI scheme (vscode)
  it("rejects vscode:// URI scheme", () => {
    const raw = {
      changes: {
        "vscode://file/test.ts": [
          { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "" },
        ],
      },
    };
    const parsed = parseWorkspaceEdit(raw, tmp);
    assert.strictEqual(parsed.unsupportedSchemes.length, 1);
    assert.strictEqual(parsed.unsupportedSchemes[0], "vscode://file/test.ts");
  });

  // 3. Resource operation rejection
  it("rejects CreateFile resource operation", () => {
    const raw = {
      documentChanges: [{ kind: "create", uri: "file:///new.ts" }],
    };
    const parsed = parseWorkspaceEdit(raw, tmp);
    assert.strictEqual(parsed.hasResourceOperations, true);
    const result = validateWorkspaceEdit(parsed, tmp);
    assert.ok(result.violations.some((v) => v.type === "unsupported_resource_operation"));
  });

  // 4. Overlapping edits
  it("detects overlapping edits", () => {
    const parsed = parseWorkspaceEdit({
      changes: {
        [`file://${testFile}`]: [
          { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } }, newText: "a" },
          { range: { start: { line: 0, character: 3 }, end: { line: 0, character: 9 } }, newText: "b" },
        ],
      },
    }, tmp);
    const result = validateWorkspaceEdit(parsed, tmp);
    assert.ok(result.violations.some((v) => v.type === "overlapping_edits"));
  });

  // 5. Too many files
  it("rejects too many changed files", () => {
    const files = Array.from({ length: 101 }, (_, i) => join(tmp, `f${i}.ts`));
    const parsed = {
      edits: [],
      changedFiles: files,
      editCount: 101,
      hasResourceOperations: false,
      resourceOperations: [],
      unsupportedSchemes: [],
    };
    const result = validateWorkspaceEdit(parsed, tmp);
    assert.ok(result.violations.some((v) => v.type === "too_many_files"));
  });

  // 6. Too many edits
  it("rejects too many edits", () => {
    const parsed = {
      edits: [],
      changedFiles: [testFile],
      editCount: 1001,
      hasResourceOperations: false,
      resourceOperations: [],
      unsupportedSchemes: [],
    };
    const result = validateWorkspaceEdit(parsed, tmp);
    assert.ok(result.violations.some((v) => v.type === "too_many_edits"));
  });

  // 7. Command-only code action
  it("marks command-only actions as commandAllowed: false", () => {
    const normalized = normalizeCodeAction({
      title: "Run some command",
      command: "some.unknown.command",
    });
    assert.strictEqual(normalized.hasCommand, true);
    assert.strictEqual(normalized.commandAllowed, false);
    assert.strictEqual(normalized.hasEdit, false);
  });

  it("command allowlist is empty by default", () => {
    assert.strictEqual(isCommandAllowed("any.command"), false);
    assert.strictEqual(isCommandAllowed(""), false);
  });

  // 8. Expired code action
  it("returns undefined for expired code action", () => {
    const id = codeActionCache.store({ title: "test" }, {
      workspacePath: tmp,
      language: "typescript",
      filePath: testFile,
    });

    // Manually expire by manipulating the entry
    const entry = codeActionCache.get(id);
    assert.ok(entry);

    // Force expiration
    (entry as any).expiresAt = Date.now() - 1;
    const result = codeActionCache.get(id);
    assert.strictEqual(result, undefined);
  });

  // 9. Missing snapshot
  it("snapshot store returns undefined for bogus ID", () => {
    const snap = snapshotStore.get("bogus-id");
    assert.strictEqual(snap, undefined);
  });

  it("compareDiagnostics identifies fixed and introduced", () => {
    const result = compareDiagnostics(
      [
        { filePath: "/a.ts", severity: "error", message: "err1", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } },
        { filePath: "/a.ts", severity: "warning", message: "warn1", range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } } },
      ],
      [
        { filePath: "/a.ts", severity: "warning", message: "warn1", range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } } },
        { filePath: "/a.ts", severity: "error", message: "new err", range: { start: { line: 2, character: 0 }, end: { line: 2, character: 0 } } },
      ],
      "before",
      "after"
    );
    assert.strictEqual(result.fixedCount, 1);
    assert.strictEqual(result.introducedCount, 1);
    assert.strictEqual(result.unchangedCount, 1);
    assert.strictEqual(result.regressed, true);
  });

  // 10. No file writes
  it("preview does not modify any files", () => {
    const before = readFileSync(testFile, "utf-8");
    const raw = {
      changes: {
        [`file://${testFile}`]: [
          { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, newText: "let" },
        ],
      },
    };
    const result = buildWorkspaceEditPreview(raw, tmp, { includeDiff: true });
    assert.strictEqual(result.safe, true);
    // Verify file unchanged
    const after = readFileSync(testFile, "utf-8");
    assert.strictEqual(before, after);
  });
});

process.on("exit", cleanup);

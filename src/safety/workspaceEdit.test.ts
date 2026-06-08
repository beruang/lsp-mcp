import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { validateWorkspaceEdit, countEdits } from "./workspaceEdit.js";
import type { WorkspaceEdit } from "./workspaceEdit.js";
import { fileToUri } from "../lsp/normalize.js";

const WS = "/workspace";

describe("validateWorkspaceEdit", () => {
  test("null edit returns unsafe", async () => {
    const result = await validateWorkspaceEdit(null, WS);
    assert.equal(result.safe, false);
    assert.ok(result.violations.length > 0);
  });

  test("undefined edit returns unsafe", async () => {
    const result = await validateWorkspaceEdit(undefined, WS);
    assert.equal(result.safe, false);
    assert.ok(result.violations.length > 0);
  });

  test("empty changes returns unsafe", async () => {
    const result = await validateWorkspaceEdit({ changes: {} }, WS);
    assert.equal(result.safe, false);
    assert.ok(result.violations.some((v) => v.type === "empty_edit"));
  });

  test("non-file URI is unsafe", async () => {
    const edit: WorkspaceEdit = {
      changes: {
        "http://example.com/file.ts": [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }, newText: "x" }],
      },
    };
    const result = await validateWorkspaceEdit(edit, WS);
    assert.equal(result.safe, false);
    assert.ok(result.violations.some((v) => v.type === "non_file_scheme"));
  });

  test("path outside workspace is unsafe", async () => {
    const edit: WorkspaceEdit = {
      changes: {
        [fileToUri("/etc/passwd")]: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }, newText: "x" }],
      },
    };
    const result = await validateWorkspaceEdit(edit, WS);
    assert.equal(result.safe, false);
    assert.ok(result.violations.some((v) => v.type === "out_of_workspace"));
  });

  test("path inside workspace is safe", async () => {
    // Use a real path that exists in the workspace
    const edit: WorkspaceEdit = {
      changes: {
        [fileToUri("/Volumes/Workspace/rnd/workflow/mcp/lsp/fixtures/sample-ts/src/util.ts")]: [
          { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }, newText: "x" },
        ],
      },
    };
    const result = await validateWorkspaceEdit(edit, "/Volumes/Workspace/rnd/workflow/mcp/lsp/fixtures/sample-ts");
    assert.equal(result.safe, true);
    assert.equal(result.violations.length, 0);
    assert.deepEqual(result.changedFiles, ["/Volumes/Workspace/rnd/workflow/mcp/lsp/fixtures/sample-ts/src/util.ts"]);
  });

  test("documentChanges are validated too", async () => {
    const edit: WorkspaceEdit = {
      documentChanges: [{
        textDocument: { uri: fileToUri("/etc/hosts") },
        edits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, newText: "y" }],
      }],
    };
    const result = await validateWorkspaceEdit(edit, WS);
    assert.equal(result.safe, false);
    assert.ok(result.violations.some((v) => v.type === "out_of_workspace"));
  });
});

describe("countEdits", () => {
  test("counts edits in changes", () => {
    const edit: WorkspaceEdit = {
      changes: {
        "file:///a.ts": [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, newText: "A" }],
        "file:///b.ts": [
          { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, newText: "B" },
          { range: { start: { line: 1, character: 0 }, end: { line: 1, character: 1 } }, newText: "C" },
        ],
      },
    };
    assert.equal(countEdits(edit), 3);
  });

  test("counts edits in documentChanges", () => {
    const edit: WorkspaceEdit = {
      documentChanges: [{
        textDocument: { uri: "file:///a.ts" },
        edits: [
          { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, newText: "X" },
        ],
      }],
    };
    assert.equal(countEdits(edit), 1);
  });

  test("counts edits in both changes and documentChanges", () => {
    const edit: WorkspaceEdit = {
      changes: {
        "file:///a.ts": [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, newText: "A" }],
      },
      documentChanges: [{
        textDocument: { uri: "file:///b.ts" },
        edits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, newText: "B" }],
      }],
    };
    assert.equal(countEdits(edit), 2);
  });
});

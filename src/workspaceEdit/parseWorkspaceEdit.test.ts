import { describe, it } from "node:test";
import assert from "node:assert";
import { parseWorkspaceEdit, extractChangedFiles, countEdits } from "./parseWorkspaceEdit.js";
import type { NormalizedTextEdit } from "./parseWorkspaceEdit.js";
import { resolve } from "node:path";

const ws = "/tmp/test-ws";

function abs(p: string): string {
  return resolve(ws, p);
}

describe("parseWorkspaceEdit", () => {
  it("parses valid changes shape", () => {
    const raw = {
      changes: {
        [`file://${ws}/src/a.ts`]: [
          { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, newText: "hello" },
        ],
      },
    };
    const result = parseWorkspaceEdit(raw, ws);
    assert.strictEqual(result.edits.length, 1);
    assert.strictEqual(result.edits[0].newText, "hello");
    assert.strictEqual(result.editCount, 1);
    assert.strictEqual(result.changedFiles.length, 1);
  });

  it("parses valid documentChanges with TextDocumentEdit", () => {
    const raw = {
      documentChanges: [
        {
          textDocument: { uri: `file://${ws}/src/b.ts`, version: 1 },
          edits: [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 10 } }, newText: "world" }],
        },
      ],
    };
    const result = parseWorkspaceEdit(raw, ws);
    assert.strictEqual(result.edits.length, 1);
    assert.strictEqual(result.edits[0].newText, "world");
    assert.strictEqual(result.editCount, 1);
  });

  it("flags CreateFile in resourceOperations", () => {
    const raw = {
      documentChanges: [
        { kind: "create", uri: `file://${ws}/new.ts` },
      ],
    };
    const result = parseWorkspaceEdit(raw, ws);
    assert.strictEqual(result.edits.length, 0);
    assert.strictEqual(result.hasResourceOperations, true);
    assert.strictEqual(result.resourceOperations.length, 1);
    assert.strictEqual(result.resourceOperations[0].kind, "create");
  });

  it("flags RenameFile in resourceOperations", () => {
    const raw = {
      documentChanges: [
        { kind: "rename", oldUri: `file://${ws}/old.ts`, newUri: `file://${ws}/new.ts` },
      ],
    };
    const result = parseWorkspaceEdit(raw, ws);
    assert.strictEqual(result.hasResourceOperations, true);
    assert.strictEqual(result.resourceOperations[0].kind, "rename");
  });

  it("flags DeleteFile in resourceOperations", () => {
    const raw = {
      documentChanges: [
        { kind: "delete", uri: `file://${ws}/gone.ts` },
      ],
    };
    const result = parseWorkspaceEdit(raw, ws);
    assert.strictEqual(result.hasResourceOperations, true);
    assert.strictEqual(result.resourceOperations[0].kind, "delete");
  });

  it("adds non-file URI to unsupportedSchemes", () => {
    const raw = {
      changes: {
        "untitled:Untitled-1": [
          { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "" },
        ],
      },
    };
    const result = parseWorkspaceEdit(raw, ws);
    assert.strictEqual(result.unsupportedSchemes.length, 1);
    assert.strictEqual(result.unsupportedSchemes[0], "untitled:Untitled-1");
  });

  it("returns empty result for null input", () => {
    const result = parseWorkspaceEdit(null, ws);
    assert.strictEqual(result.edits.length, 0);
    assert.strictEqual(result.changedFiles.length, 0);
    assert.strictEqual(result.editCount, 0);
    assert.strictEqual(result.hasResourceOperations, false);
  });

  it("returns empty result for undefined input", () => {
    const result = parseWorkspaceEdit(undefined, ws);
    assert.strictEqual(result.edits.length, 0);
    assert.strictEqual(result.editCount, 0);
  });

  it("returns empty result for empty object", () => {
    const result = parseWorkspaceEdit({}, ws);
    assert.strictEqual(result.edits.length, 0);
    assert.strictEqual(result.editCount, 0);
  });

  it("handles mixed valid and invalid edits", () => {
    const raw = {
      changes: {
        [`file://${ws}/src/valid.ts`]: [
          { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, newText: "x" },
        ],
        "http://remote/file.ts": [
          { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, newText: "y" },
        ],
      },
      documentChanges: [
        { kind: "create", uri: `file://${ws}/new.ts` },
        {
          textDocument: { uri: `file://${ws}/src/also-valid.ts`, version: 1 },
          edits: [{ range: { start: { line: 2, character: 0 }, end: { line: 2, character: 3 } }, newText: "z" }],
        },
      ],
    };
    const result = parseWorkspaceEdit(raw, ws);
    assert.strictEqual(result.edits.length, 2);
    assert.strictEqual(result.hasResourceOperations, true);
    assert.strictEqual(result.unsupportedSchemes.length, 1);
    assert.strictEqual(result.unsupportedSchemes[0], "http://remote/file.ts");
  });

  it("parses vscode scheme as unsupported", () => {
    const raw = {
      changes: {
        "vscode://file/src/test.ts": [
          { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "" },
        ],
      },
    };
    const result = parseWorkspaceEdit(raw, ws);
    assert.strictEqual(result.unsupportedSchemes.length, 1);
    assert.strictEqual(result.unsupportedSchemes[0], "vscode://file/src/test.ts");
  });
});

describe("extractChangedFiles", () => {
  it("returns deduplicated sorted file list", () => {
    const edits: NormalizedTextEdit[] = [
      { filePath: abs("/b.ts"), range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "" },
      { filePath: abs("/a.ts"), range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "" },
      { filePath: abs("/b.ts"), range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }, newText: "" },
    ];
    const files = extractChangedFiles(edits);
    assert.strictEqual(files.length, 2);
    assert.ok(files[0] < files[1]);
  });

  it("returns empty for no edits", () => {
    assert.strictEqual(extractChangedFiles([]).length, 0);
  });
});

describe("countEdits", () => {
  it("counts edits from normalized array", () => {
    const edits: NormalizedTextEdit[] = [
      { filePath: abs("/a.ts"), range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "" },
      { filePath: abs("/b.ts"), range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "" },
    ];
    assert.strictEqual(countEdits(edits), 2);
  });

  it("counts edits from raw WorkspaceEdit with changes", () => {
    const raw = { changes: { "file:///a.ts": [{}, {}] } };
    assert.strictEqual(countEdits(raw), 2);
  });

  it("counts edits from raw WorkspaceEdit with documentChanges", () => {
    const raw = { documentChanges: [{ edits: [{}, {}, {}] }] };
    assert.strictEqual(countEdits(raw), 3);
  });

  it("returns 0 for empty input", () => {
    assert.strictEqual(countEdits([]), 0);
  });
});

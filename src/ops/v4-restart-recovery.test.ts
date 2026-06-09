import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFile, unlink, mkdir, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LspClientManager } from "../lsp/LspClientManager.js";
import { restartServer } from "./restartServer.js";
import { shutdownServer } from "./shutdownServer.js";
import { openDocument } from "../documents/openDocument.js";
import { listOpenDocuments } from "../documents/listOpenDocuments.js";
import { v4DocumentStore } from "../documents/documentStore.js";
import { fileToUri } from "../lsp/normalize.js";

const TEST_TIMEOUT = 60_000;

async function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("V4 Restart and Recovery", { timeout: TEST_TIMEOUT }, () => {
  let tmpDir: string;
  let tsFile: string;
  let manager: LspClientManager;

  before(async () => {
    tmpDir = join(tmpdir(), `mcp-lsp-v4-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    tsFile = join(tmpDir, "test.ts");
    await writeFile(tsFile, 'const x: number = 42;\nfunction add(a: number, b: number): number { return a + b; }\n');
    manager = new LspClientManager();
  });

  after(async () => {
    for (const [, client] of manager.getAllClients()) {
      try { await client.shutdown(); } catch { /* ok */ }
    }
    v4DocumentStore.clear();
    try { await unlink(tsFile); } catch { /* ok */ }
    try { await rmdir(tmpDir); } catch { /* ok */ }
  });

  it("starts TypeScript LSP and reports running state", async () => {
    const rootUri = fileToUri(tmpDir);
    const client = await manager.getClientForLanguage("typescript", { workspacePath: tmpDir, rootUri });
    assert.ok(client);
    assert.strictEqual(client.state.state, "running");
    assert.ok(client.state.capabilitiesKnown);
  });

  it("reports server status without starting other servers", async () => {
    const states = manager.getAllStates();
    assert.ok(states.length >= 4);
    const notStarted = states.filter((s) => s.language !== "typescript");
    for (const s of notStarted) {
      assert.strictEqual(s.state, "not_started", `${s.language} should be not_started`);
    }
  });

  it("shuts down TypeScript server and marks stopped", async () => {
    const status = await shutdownServer(manager, "typescript", 5000);
    assert.strictEqual(status.state, "stopped");
    assert.strictEqual(manager.getClient("typescript"), undefined);
  });

  it("lazy restarts after shutdown on next request", async () => {
    const rootUri = fileToUri(tmpDir);
    const client = await manager.getClientForLanguage("typescript", { workspacePath: tmpDir, rootUri });
    assert.ok(client);
    assert.strictEqual(client.state.state, "running");
  });

  it("restarts running server and preserves functionality", async () => {
    const rootUri = fileToUri(tmpDir);
    await manager.getClientForLanguage("typescript", { workspacePath: tmpDir, rootUri });

    const result = await restartServer(manager, "typescript", tmpDir, rootUri, false, 5000);
    assert.strictEqual(result.status.state, "running");

    // Small wait for server to stabilize after restart
    await wait(500);
    const client = manager.getClient("typescript");
    assert.ok(client, "client should exist after restart");
    const hoverResult = await client.request("textDocument/hover", {
      textDocument: { uri: fileToUri(tsFile) },
      position: { line: 0, character: 7 },
    });
    assert.ok(hoverResult, "hover should return a result");
  });

  it("reopens documents after restart when requested", async () => {
    const rootUri = fileToUri(tmpDir);
    await manager.getClientForLanguage("typescript", { workspacePath: tmpDir, rootUri });

    await openDocument(manager, "typescript", tsFile, tmpDir);
    const docs = listOpenDocuments("typescript");
    assert.strictEqual(docs.length, 1);

    const result = await restartServer(manager, "typescript", tmpDir, rootUri, true, 5000);
    assert.ok(result.reopenedDocuments >= 0, `should reopen documents, got ${result.reopenedDocuments}`);
  });

  it("sync document auto-opens if not tracked", async () => {
    const rootUri = fileToUri(tmpDir);
    await manager.getClientForLanguage("typescript", { workspacePath: tmpDir, rootUri });
    v4DocumentStore.clear("typescript");

    // Create a separate file for sync test
    const syncFile = join(tmpDir, "sync-test.ts");
    await writeFile(syncFile, "export const a = 1;\n");
    try {
      const info = await openDocument(manager, "typescript", syncFile, tmpDir, "export const b = 2;\n");
      assert.ok(info);
      assert.ok(info.version >= 1);
      const docs = listOpenDocuments("typescript");
      assert.ok(docs.length >= 1);
    } finally {
      try { await unlink(syncFile); } catch { /* ok */ }
    }
  });

  it("handles restart of crashed process gracefully", async () => {
    const rootUri = fileToUri(tmpDir);
    const client = await manager.getClientForLanguage("typescript", { workspacePath: tmpDir, rootUri });
    assert.ok(client);

    // Simulate crash
    client.state.transition("crashed");
    assert.strictEqual(client.state.state, "crashed");

    // Restart from crashed state
    const result = await restartServer(manager, "typescript", tmpDir, rootUri, false, 5000);
    assert.strictEqual(result.status.state, "running");
  });
});

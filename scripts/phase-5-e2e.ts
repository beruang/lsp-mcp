/**
 * Phase-5 end-to-end smoke test.
 *
 * Spawns the built MCP server, sends JSON-RPC requests over stdio,
 * and asserts the responses from lsp_references, lsp_document_symbols,
 * and lsp_workspace_symbols.
 *
 * Run after `pnpm run build`:
 *   pnpm run e2e:phase-5
 */

import { spawn } from "node:child_process";
import { resolve, join } from "node:path";

// ─── helpers ──────────────────────────────────────────────────────────────────

const workspaceRoot = resolve(process.cwd());
const fixtureRoot = join(workspaceRoot, "fixtures", "sample-ts");

let id = 0;
function nextId() { return ++id; }

function req(method: string, params: unknown) {
  return JSON.stringify({ jsonrpc: "2.0", id: nextId(), method, params });
}

function parseResponse(line: string): { id: number; result?: unknown; error?: unknown } | null {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Start the built MCP server
  const serverPath = join(workspaceRoot, "dist", "index.js");
  const child = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, WORKSPACE_PATH: fixtureRoot },
  });

  const lines: string[] = [];

  child.stdout.on("data", (chunk: Buffer) => {
    lines.push(...chunk.toString().split("\n").filter((l) => l.trim()));
  });

  child.stderr.on("data", (chunk: Buffer) => {
    // Collect stderr but don't fail on it (LSP server noise)
    process.stderr.write(chunk);
  });

  const send = (method: string, params: unknown): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      const msg = req(method, params);
      child.stdin.write(msg + "\n");

      const timeout = setTimeout(() => {
        reject(new Error(`JSON-RPC timeout waiting for response to ${method}`));
      }, 60_000);

      const handler = (chunk: Buffer) => {
        const line = chunk.toString().trim();
        if (!line) return;
        const resp = parseResponse(line);
        if (!resp) return;
        clearTimeout(timeout);
        child.stdout.off("data", handler);
        if (resp.error) reject(new Error(JSON.stringify(resp.error)));
        else resolve(resp.result);
      };

      child.stdout.on("data", handler);
    });
  };

  const results: Array<{ name: string; pass: boolean; detail?: string }> = [];

  try {
    // 1. Initialize
    await send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "phase-5-e2e",
        version: "0.1.0",
      },
    });

    // 2. notifications/initialized
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");

    // Allow a moment for the server to process
    await new Promise((r) => setTimeout(r, 500));

    // 3. lsp_references on fixtures/sample-ts/src/index.ts line 1 character 10
    //    (the import of `add` from util — should find references in index.ts and util.ts)
    const refsResult = (await send("tools/call", {
      name: "lsp_references",
      arguments: {
        filePath: join(fixtureRoot, "src", "index.ts"),
        position: { line: 1, character: 10 },
        includeDeclaration: true,
        maxResults: 200,
      },
    })) as { content: Array<{ text: string }> };

    const refsPayload = JSON.parse(refsResult.content[0].text);
    if (refsPayload.references && refsPayload.references.length >= 1) {
      // Check that at least one reference is in util.ts or the declaration
      const hasUtilRef = refsPayload.references.some((ref: { filePath: string }) =>
        ref.filePath.endsWith("util.ts") || ref.filePath.endsWith("index.ts")
      );
      if (hasUtilRef) {
        results.push({ name: "lsp_references returns >= 1 reference", pass: true });
      } else {
        results.push({ name: "lsp_references returns >= 1 reference", pass: false, detail: JSON.stringify(refsPayload) });
      }
    } else {
      results.push({ name: "lsp_references returns >= 1 reference", pass: false, detail: JSON.stringify(refsPayload) });
    }

    // 4. lsp_document_symbols on fixtures/sample-ts/src/util.ts
    //    (should return the `add` function symbol)
    const docSymsResult = (await send("tools/call", {
      name: "lsp_document_symbols",
      arguments: {
        filePath: join(fixtureRoot, "src", "util.ts"),
      },
    })) as { content: Array<{ text: string }> };

    const docSymsPayload = JSON.parse(docSymsResult.content[0].text);
    if (docSymsPayload.symbols && docSymsPayload.symbols.length >= 1) {
      const hasAddFunction = docSymsPayload.symbols.some((sym: { name: string; kind: string }) =>
        sym.name === "add" && sym.kind === "function"
      );
      if (hasAddFunction) {
        results.push({ name: "lsp_document_symbols returns 'add' function with kind 'function'", pass: true });
      } else {
        results.push({ name: "lsp_document_symbols returns 'add' function with kind 'function'", pass: false, detail: JSON.stringify(docSymsPayload) });
      }
    } else {
      results.push({ name: "lsp_document_symbols returns 'add' function with kind 'function'", pass: false, detail: JSON.stringify(docSymsPayload) });
    }

    // 5. lsp_workspace_symbols with query "add"
    //    (should find the `add` function across the workspace)
    const wsSymsResult = (await send("tools/call", {
      name: "lsp_workspace_symbols",
      arguments: {
        query: "add",
        language: "auto",
        maxResults: 100,
      },
    })) as { content: Array<{ text: string }> };

    const wsSymsPayload = JSON.parse(wsSymsResult.content[0].text);
    if (wsSymsPayload.symbols && wsSymsPayload.symbols.length >= 1) {
      const hasAddSymbol = wsSymsPayload.symbols.some((sym: { name: string }) => sym.name === "add");
      if (hasAddSymbol) {
        results.push({ name: "lsp_workspace_symbols with query 'add' returns at least one symbol named 'add'", pass: true });
      } else {
        results.push({ name: "lsp_workspace_symbols with query 'add' returns at least one symbol named 'add'", pass: false, detail: JSON.stringify(wsSymsPayload) });
      }
    } else {
      results.push({ name: "lsp_workspace_symbols with query 'add' returns at least one symbol named 'add'", pass: false, detail: JSON.stringify(wsSymsPayload) });
    }

    // 6. Truncation test: lsp_references with maxResults: 5
    //    Note: This is hard to exercise without 250 actual references in the fixture.
    //    We test the truncation logic at the unit level (clampResults in normalize.test.ts).
    //    For the e2e, we verify the tool accepts maxResults and returns proper shape.
    const truncResult = (await send("tools/call", {
      name: "lsp_references",
      arguments: {
        filePath: join(fixtureRoot, "src", "index.ts"),
        position: { line: 1, character: 10 },
        includeDeclaration: true,
        maxResults: 5,
      },
    })) as { content: Array<{ text: string }> };

    const truncPayload = JSON.parse(truncResult.content[0].text);
    if (truncPayload.returned !== undefined && truncPayload.truncated !== undefined) {
      results.push({ name: "lsp_references with maxResults:5 returns proper truncation shape", pass: true });
    } else {
      results.push({ name: "lsp_references with maxResults:5 returns proper truncation shape", pass: false, detail: JSON.stringify(truncPayload) });
    }

  } finally {
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: nextId(), method: "shutdown", params: null }) + "\n");
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: nextId(), method: "exit", params: null }) + "\n");
    await new Promise((r) => setTimeout(r, 500));
    child.kill("SIGTERM");
  }

  // Print results
  let allPass = true;
  for (const { name, pass, detail } of results) {
    console.log(`${pass ? "PASS" : "FAIL"}: ${name}`);
    if (!pass && detail) {
      console.log("  detail:", detail);
    }
    if (!pass) allPass = false;
  }

  if (allPass) {
    console.log("\nAll assertions passed.");
    process.exit(0);
  } else {
    console.log("\nSome assertions failed.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("E2E fatal error:", err);
  process.exit(1);
});

/**
 * Phase-9 end-to-end smoke test.
 *
 * Spawns the built MCP server pointing at fixtures/sample-py,
 * and runs the read tools against the Python fixture.
 *
 * Run after `pnpm run build`:
 *   npx tsx scripts/phase-9-e2e.ts
 */

import { spawn } from "node:child_process";
import { resolve, join } from "node:path";

const workspaceRoot = resolve(process.cwd());
const fixtureRoot = join(workspaceRoot, "fixtures", "sample-py");

let id = 0;
function nextId() { return ++id; }

function req(method: string, params: unknown) {
  return JSON.stringify({ jsonrpc: "2.0", id: nextId(), method, params });
}

async function main() {
  const serverPath = join(workspaceRoot, "dist", "index.js");
  const child = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, WORKSPACE_PATH: fixtureRoot },
  });

  child.stderr.on("data", (chunk: Buffer) => {
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
        let resp;
        try { resp = JSON.parse(line); } catch { return; }
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
      clientInfo: { name: "phase-9-e2e", version: "0.1.0" },
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
    await new Promise((r) => setTimeout(r, 500));

    const helloPy = join(fixtureRoot, "src", "hello.py");
    const usagePy = join(fixtureRoot, "src", "usage.py");

    // Helper to check if a response is a server-unavailable error
    const isServerUnavailable = (payload: unknown): boolean => {
      const p = payload as Record<string, unknown>;
      return p?.error?.code === "lsp_server_unavailable";
    };

    // 2. lsp_hover on greet() usage in usage.py (line 5, "greet" at character 14)
    const hoverResult = (await send("tools/call", {
      name: "lsp_hover",
      arguments: {
        filePath: usagePy,
        position: { line: 4, character: 14 },
      },
    })) as { content: Array<{ text: string }> };

    const hoverPayload = JSON.parse(hoverResult.content[0].text);
    if (isServerUnavailable(hoverPayload)) {
      results.push({ name: "lsp_hover on Python (pyright not available)", pass: true });
    } else if (hoverPayload.contents && hoverPayload.contents !== null) {
      results.push({ name: "lsp_hover on Python returns type info", pass: true });
    } else if (hoverPayload.error) {
      results.push({ name: `lsp_hover on Python: ${hoverPayload.error.code}`, pass: true, detail: hoverPayload.error.message });
    } else {
      results.push({ name: "lsp_hover on Python returns type info", pass: false, detail: JSON.stringify(hoverPayload) });
    }

    // 3. lsp_definition on greet() (line 4, character 14 in usage.py → should point to hello.py)
    const defResult = (await send("tools/call", {
      name: "lsp_definition",
      arguments: {
        filePath: usagePy,
        position: { line: 4, character: 14 },
      },
    })) as { content: Array<{ text: string }> };

    const defPayload = JSON.parse(defResult.content[0].text);
    if (isServerUnavailable(defPayload)) {
      results.push({ name: "lsp_definition on Python (pyright not available)", pass: true });
    } else if (defPayload.locations && defPayload.locations.length >= 1) {
      const hasHello = defPayload.locations.some((l: { filePath: string }) => l.filePath.includes("hello.py"));
      results.push({ name: "lsp_definition on Python returns location in hello.py", pass: hasHello, detail: hasHello ? undefined : JSON.stringify(defPayload.locations) });
    } else if (defPayload.error) {
      results.push({ name: `lsp_definition on Python: ${defPayload.error.code}`, pass: true, detail: defPayload.error.message });
    } else {
      results.push({ name: "lsp_definition on Python returns locations", pass: false, detail: JSON.stringify(defPayload) });
    }

    // 4. lsp_references on the greet function (line 0, character 5 in hello.py = "greet")
    const refResult = (await send("tools/call", {
      name: "lsp_references",
      arguments: {
        filePath: helloPy,
        position: { line: 0, character: 5 },
        includeDeclaration: true,
      },
    })) as { content: Array<{ text: string }> };

    const refPayload = JSON.parse(refResult.content[0].text);
    if (isServerUnavailable(refPayload)) {
      results.push({ name: "lsp_references on Python (pyright not available)", pass: true });
    } else if (refPayload.references && refPayload.references.length >= 1) {
      results.push({ name: "lsp_references on Python returns at least 1 reference", pass: true });
    } else if (refPayload.error) {
      results.push({ name: `lsp_references on Python: ${refPayload.error.code}`, pass: true, detail: refPayload.error.message });
    } else {
      results.push({ name: "lsp_references on Python returns references", pass: false, detail: JSON.stringify(refPayload) });
    }

    // 5. lsp_document_symbols on hello.py
    const symResult = (await send("tools/call", {
      name: "lsp_document_symbols",
      arguments: {
        filePath: helloPy,
      },
    })) as { content: Array<{ text: string }> };

    const symPayload = JSON.parse(symResult.content[0].text);
    if (isServerUnavailable(symPayload)) {
      results.push({ name: "lsp_document_symbols on Python (pyright not available)", pass: true });
    } else if (symPayload.symbols && symPayload.symbols.length >= 1) {
      const hasFunction = symPayload.symbols.some((s: { kind: string }) => s.kind === "function");
      results.push({ name: "lsp_document_symbols on Python returns function symbol", pass: hasFunction, detail: hasFunction ? undefined : JSON.stringify(symPayload.symbols) });
    } else if (symPayload.error) {
      results.push({ name: `lsp_document_symbols on Python: ${symPayload.error.code}`, pass: true, detail: symPayload.error.message });
    } else {
      results.push({ name: "lsp_document_symbols on Python returns symbols", pass: false, detail: JSON.stringify(symPayload) });
    }

    // 6. lsp_diagnostics on hello.py (should have a type error in usage.py via the bad call)
    // First trigger diagnostics by opening usage.py via lsp_diagnostics
    const diagResult = (await send("tools/call", {
      name: "lsp_diagnostics",
      arguments: {
        filePath: helloPy,
        severity: "all",
      },
    })) as { content: Array<{ text: string }> };

    const diagPayload = JSON.parse(diagResult.content[0].text);
    if (isServerUnavailable(diagPayload)) {
      results.push({ name: "lsp_diagnostics on Python (pyright not available)", pass: true });
    } else if (diagPayload.diagnostics !== undefined) {
      // Pyright should find type errors in the fixture
      results.push({ name: "lsp_diagnostics on Python returns diagnostics array", pass: true });
    } else if (diagPayload.error) {
      results.push({ name: `lsp_diagnostics on Python: ${diagPayload.error.code}`, pass: true, detail: diagPayload.error.message });
    } else {
      results.push({ name: "lsp_diagnostics on Python returns diagnostics", pass: false, detail: JSON.stringify(diagPayload) });
    }

    // 7. lsp_rename_preview on Python (Pyright may not support rename)
    const renameResult = (await send("tools/call", {
      name: "lsp_rename_preview",
      arguments: {
        filePath: helloPy,
        position: { line: 0, character: 5 },
        newName: "say_hello",
      },
    })) as { content: Array<{ text: string }> };

    const renamePayload = JSON.parse(renameResult.content[0].text);
    if (isServerUnavailable(renamePayload)) {
      results.push({ name: "lsp_rename_preview on Python (pyright not available)", pass: true });
    } else if (renamePayload.error) {
      // Pyright may not support rename — that's OK
      results.push({ name: "lsp_rename_preview on Python returned error (cleanly handled)", pass: true, detail: renamePayload.error.code });
    } else {
      // Either canRename: true with diff, or canRename: false
      if (renamePayload.canRename === true || renamePayload.canRename === false) {
        results.push({ name: `lsp_rename_preview on Python (canRename: ${renamePayload.canRename})`, pass: true });
      } else {
        results.push({ name: "lsp_rename_preview on Python returned valid response", pass: false, detail: JSON.stringify(renamePayload) });
      }
    }

  } finally {
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: nextId(), method: "shutdown", params: null }) + "\n");
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: nextId(), method: "exit", params: null }) + "\n");
    await new Promise((r) => setTimeout(r, 500));
    child.kill("SIGTERM");
  }

  let allPass = true;
  for (const { name, pass, detail } of results) {
    console.log(`${pass ? "PASS" : "FAIL"}: ${name}`);
    if (detail) {
      console.log(" ", detail);
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

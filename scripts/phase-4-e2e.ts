/**
 * Phase-4 end-to-end smoke test.
 *
 * Spawns the built MCP server, sends JSON-RPC requests over stdio,
 * and asserts the responses from lsp_hover and lsp_definition.
 *
 * Run after `pnpm run build`:
 *   pnpm run e2e:phase-4
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
        name: "phase-4-e2e",
        version: "0.1.0",
      },
    });

    // 2. notifications/initialized
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");

    // Allow a moment for the server to process
    await new Promise((r) => setTimeout(r, 500));

    //3. lsp_hover on fixtures/sample-ts/src/util.ts line 1 character 10
    //    (the `a` in `return a + b;` — TS server returns the parameter type)
    const hoverResult = (await send("tools/call", {
      name: "lsp_hover",
      arguments: {
        filePath: join(fixtureRoot, "src", "util.ts"),
        position: { line: 1, character: 10 },
      },
    })) as { content: Array<{ text: string }> };

    const hoverPayload = JSON.parse(hoverResult.content[0].text);
    if (hoverPayload.contents !== null) {
      results.push({ name: "lsp_hover returns non-null contents", pass: true });
 } else {
      results.push({ name: "lsp_hover returns non-null contents", pass: false, detail: JSON.stringify(hoverPayload) });
    }

    // 4. lsp_definition on fixtures/sample-ts/src/index.ts line 1 character 10
    //    (the import — should resolve to util.ts)
    const defResult = (await send("tools/call", {
      name: "lsp_definition",
      arguments: {
        filePath: join(fixtureRoot, "src", "index.ts"),
        position: { line: 1, character: 10 },
      },
    })) as { content: Array<{ text: string }> };

    const defPayload = JSON.parse(defResult.content[0].text);
    if (defPayload.locations && defPayload.locations.length > 0) {
      const loc = defPayload.locations[0];
      if (loc.filePath && loc.range) {
        results.push({ name: "lsp_definition returns NormalizedLocation", pass: true });
      } else {
        results.push({ name: "lsp_definition returns NormalizedLocation", pass: false, detail: JSON.stringify(defPayload) });
      }
    } else {
      results.push({ name: "lsp_definition returns NormalizedLocation", pass: false, detail: JSON.stringify(defPayload) });
    }

    // 5. lsp_hover with path outside workspace (../escape.ts)
    const escapeResult = (await send("tools/call", {
      name: "lsp_hover",
      arguments: {
        filePath: "../escape.ts",
        position: { line: 0, character: 0 },
      },
    })) as { content: Array<{ text: string }> };

    const escapePayload = JSON.parse(escapeResult.content[0].text);
    if (escapePayload.error?.code === "path_outside_workspace") {
      results.push({ name: "lsp_hover with ../escape.ts returns path_outside_workspace", pass: true });
    } else {
      results.push({ name: "lsp_hover with ../escape.ts returns path_outside_workspace", pass: false, detail: JSON.stringify(escapePayload) });
    }

    // 6. lsp_hover with unsupported extension (.rb)
    const rbResult = (await send("tools/call", {
      name: "lsp_hover",
      arguments: {
        filePath: join(fixtureRoot, "test.rb"),
        position: { line: 0, character: 0 },
      },
    })) as { content: Array<{ text: string }> };

    const rbPayload = JSON.parse(rbResult.content[0].text);
    if (rbPayload.error?.code === "unsupported_language") {
      results.push({ name: "lsp_hover with .rb returns unsupported_language", pass: true });
    } else {
      results.push({ name: "lsp_hover with .rb returns unsupported_language", pass: false, detail: JSON.stringify(rbPayload) });
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

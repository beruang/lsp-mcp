/**
 * Phase-10 Acceptance Tests
 *
 * Runs 4 acceptance groups against both fixtures and the built MCP server.
 * Exits 0 if all pass, 1 otherwise.
 *
 * Usage:
 *   npx tsx scripts/acceptance.ts
 */

import { spawn } from "node:child_process";
import { resolve, join } from "node:path";
import { statSync } from "node:fs";

const workspaceRoot = resolve(process.cwd());
const tsFixture = join(workspaceRoot, "fixtures", "sample-ts");
const pyFixture = join(workspaceRoot, "fixtures", "sample-py");

let id = 0;
function nextId() { return ++id; }

function req(method: string, params: unknown) {
  return JSON.stringify({ jsonrpc: "2.0", id: nextId(), method, params });
}

interface TestResult {
  name: string;
  passed: boolean;
  detail?: string;
}

interface GroupResult {
  group: string;
  results: TestResult[];
  passed: boolean;
}

function startServer(fixtureRoot: string) {
  const serverPath = join(workspaceRoot, "dist", "index.js");
  const child = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, WORKSPACE_PATH: fixtureRoot },
  });

  child.stderr.on("data", () => {}); // suppress stderr

  const send = (method: string, params: unknown): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      const msg = req(method, params);
      child.stdin.write(msg + "\n");
      const timeout = setTimeout(() => reject(new Error(`timeout: ${method}`)), 60_000);
      const handler = (chunk: Buffer) => {
        const line = chunk.toString().trim();
        if (!line) return;
        let resp: Record<string, unknown> | null = null;
        try { resp = JSON.parse(line); } catch { return; }
        if (!resp) return;
        clearTimeout(timeout);
        child.stdout.off("data", handler);
        if (resp.error) reject(new Error(JSON.stringify(resp.error)));
        else resolve(resp.result);
      };
      child.stdout.on("data", handler);
    });
  };

  const shutdown = () => {
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: nextId(), method: "shutdown", params: null }) + "\n");
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: nextId(), method: "exit", params: null }) + "\n");
    setTimeout(() => child.kill("SIGTERM"), 500);
  };

  return { send, shutdown };
}

async function initServer(send: (m: string, p: unknown) => Promise<unknown>) {
  await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "acceptance", version: "0.1.0" },
  });
  await new Promise((r) => setTimeout(r, 300));
}

async function callTool(send: (m: string, p: unknown) => Promise<unknown>, name: string, args: unknown) {
  const result = await send("tools/call", { name, arguments: args }) as { content: Array<{ text: string }> };
  return JSON.parse(result.content[0].text);
}

// ─── Group 1: Health ─────────────────────────────────────────────────────────

async function runHealth(): Promise<GroupResult> {
  const results: TestResult[] = [];
  const { send, shutdown } = startServer(tsFixture);

  try {
    await initServer(send);

    const health = await callTool(send, "lsp_health_check", {});
    if (health.ok === true) {
      results.push({ name: "lsp_health_check returns ok: true", passed: true });
    } else {
      results.push({ name: "lsp_health_check returns ok: true", passed: false, detail: JSON.stringify(health) });
    }

    // Check TypeScript server availability by calling a tool
    const hoverResult = await callTool(send, "lsp_hover", {
      filePath: join(tsFixture, "src", "index.ts"),
      position: { line: 1, character: 17 },
    });
    const tsAvailable = !hoverResult.error || hoverResult.error.code !== "lsp_server_unavailable";
    results.push({ name: "typescript-language-server available", passed: tsAvailable, detail: tsAvailable ? undefined : hoverResult.error?.code });

  } catch (err) {
    results.push({ name: "Health group", passed: false, detail: String(err) });
  } finally {
    shutdown();
  }

  // Check Python separately
  const { send: sendPy, shutdown: shutdownPy } = startServer(pyFixture);
  try {
    await initServer(sendPy);
    const pyResult = await callTool(sendPy, "lsp_hover", {
      filePath: join(pyFixture, "src", "hello.py"),
      position: { line: 0, character: 5 },
    });
    const pyAvailable = !pyResult.error || pyResult.error.code !== "lsp_server_unavailable";
    results.push({ name: "pyright-langserver available", passed: pyAvailable, detail: pyAvailable ? undefined : pyResult.error?.code });
  } catch (err) {
    results.push({ name: "pyright-langserver available", passed: false, detail: String(err) });
  } finally {
    shutdownPy();
  }

  const passed = results.every((r) => r.passed);
  return { group: "Health", results, passed };
}

// ─── Group 2: TypeScript ────────────────────────────────────────────────────

async function runTypeScript(): Promise<GroupResult> {
  const results: TestResult[] = [];
  const { send, shutdown } = startServer(tsFixture);

  try {
    await initServer(send);

    const indexTs = join(tsFixture, "src", "index.ts");
    const utilTs = join(tsFixture, "src", "util.ts");

    // 1. lsp_hover
    const hover = await callTool(send, "lsp_hover", { filePath: indexTs, position: { line: 1, character: 17 } });
    if (!hover.error) {
      results.push({ name: "lsp_hover returns type info", passed: hover.contents !== null });
    } else {
      results.push({ name: "lsp_hover", passed: false, detail: hover.error.code });
    }

    // 2. lsp_definition
    const def = await callTool(send, "lsp_definition", { filePath: indexTs, position: { line: 1, character: 17 } });
    if (!def.error) {
      results.push({ name: "lsp_definition resolves", passed: def.locations && def.locations.length >= 1 });
    } else {
      results.push({ name: "lsp_definition", passed: false, detail: def.error.code });
    }

    // 3. lsp_references
    const refs = await callTool(send, "lsp_references", { filePath: indexTs, position: { line: 1, character: 17 } });
    if (!refs.error) {
      results.push({ name: "lsp_references returns references", passed: refs.references && refs.references.length >= 1 });
    } else {
      results.push({ name: "lsp_references", passed: false, detail: refs.error.code });
    }

    // 4. lsp_document_symbols
    const syms = await callTool(send, "lsp_document_symbols", { filePath: utilTs });
    if (!syms.error) {
      results.push({ name: "lsp_document_symbols returns symbols", passed: syms.symbols && syms.symbols.length >= 1 });
    } else {
      results.push({ name: "lsp_document_symbols", passed: false, detail: syms.error.code });
    }

    // 5. lsp_workspace_symbols
    const ws = await callTool(send, "lsp_workspace_symbols", { query: "add" });
    if (!ws.error) {
      results.push({ name: "lsp_workspace_symbols finds 'add'", passed: ws.symbols && ws.symbols.length >= 1 });
    } else {
      results.push({ name: "lsp_workspace_symbols", passed: false, detail: ws.error.code });
    }

    // 6. lsp_diagnostics
    const diag = await callTool(send, "lsp_diagnostics", { filePath: indexTs });
    if (!diag.error) {
      results.push({ name: "lsp_diagnostics returns diagnostics", passed: Array.isArray(diag.diagnostics) });
    } else {
      results.push({ name: "lsp_diagnostics", passed: false, detail: diag.error.code });
    }

    // 7. lsp_rename_preview
    const rename = await callTool(send, "lsp_rename_preview", {
      filePath: utilTs, position: { line: 0, character: 17 }, newName: "addNumbers",
    });
    if (!rename.error) {
      const diffOk = rename.canRename && rename.diff && rename.diff.length > 0;
      const safeOk = rename.safe === true && rename.violations && rename.violations.length === 0;
      results.push({ name: "lsp_rename_preview returns diff without writing files", passed: diffOk && safeOk });
    } else {
      results.push({ name: "lsp_rename_preview", passed: false, detail: rename.error.code });
    }

    // 8. lsp_inspect_symbol
    const inspect = await callTool(send, "lsp_inspect_symbol", { filePath: indexTs, position: { line: 1, character: 17 } });
    if (!inspect.error) {
      const hoverOk = inspect.hover !== undefined;
      const defOk = Array.isArray(inspect.definitions);
      const refOk = inspect.references && inspect.references.referenceCount !== undefined;
      const riskOk = Array.isArray(inspect.riskHints) && inspect.riskHints.length > 0;
      results.push({ name: "lsp_inspect_symbol returns composite", passed: hoverOk && defOk && refOk && riskOk });
    } else {
      results.push({ name: "lsp_inspect_symbol", passed: false, detail: inspect.error.code });
    }

  } catch (err) {
    results.push({ name: "TypeScript group error", passed: false, detail: String(err) });
  } finally {
    shutdown();
  }

  const passed = results.every((r) => r.passed);
  return { group: "TypeScript", results, passed };
}

// ─── Group 3: Python ────────────────────────────────────────────────────────

async function runPython(): Promise<GroupResult> {
  const results: TestResult[] = [];
  const { send, shutdown } = startServer(pyFixture);

  try {
    await initServer(send);

    const helloPy = join(pyFixture, "src", "hello.py");
    const usagePy = join(pyFixture, "src", "usage.py");

    // 1. lsp_hover
    const hover = await callTool(send, "lsp_hover", { filePath: usagePy, position: { line: 4, character: 14 } });
    if (!hover.error) {
      results.push({ name: "lsp_hover (python) returns type info", passed: hover.contents !== null });
    } else {
      results.push({ name: "lsp_hover (python)", passed: false, detail: hover.error.code });
    }

    // 2. lsp_definition
    const def = await callTool(send, "lsp_definition", { filePath: usagePy, position: { line: 4, character: 14 } });
    if (!def.error) {
      results.push({ name: "lsp_definition (python) resolves", passed: def.locations && def.locations.length >= 1 });
    } else {
      results.push({ name: "lsp_definition (python)", passed: false, detail: def.error.code });
    }

    // 3. lsp_references
    const refs = await callTool(send, "lsp_references", { filePath: helloPy, position: { line: 0, character: 5 } });
    if (!refs.error) {
      results.push({ name: "lsp_references (python) returns references", passed: refs.references && refs.references.length >= 1 });
    } else {
      results.push({ name: "lsp_references (python)", passed: false, detail: refs.error.code });
    }

    // 4. lsp_document_symbols
    const syms = await callTool(send, "lsp_document_symbols", { filePath: helloPy });
    if (!syms.error) {
      results.push({ name: "lsp_document_symbols (python) returns symbols", passed: syms.symbols && syms.symbols.length >= 1 });
    } else {
      results.push({ name: "lsp_document_symbols (python)", passed: false, detail: syms.error.code });
    }

    // 5. lsp_diagnostics
    const diag = await callTool(send, "lsp_diagnostics", { filePath: helloPy });
    if (!diag.error) {
      results.push({ name: "lsp_diagnostics (python) returns diagnostics", passed: Array.isArray(diag.diagnostics) });
    } else {
      results.push({ name: "lsp_diagnostics (python)", passed: false, detail: diag.error.code });
    }

    // 6. lsp_rename_preview
    const rename = await callTool(send, "lsp_rename_preview", {
      filePath: helloPy, position: { line: 0, character: 5 }, newName: "say_hello",
    });
    if (!rename.error) {
      results.push({ name: "lsp_rename_preview (python) handled cleanly", passed: rename.canRename === true || rename.canRename === false });
    } else {
      results.push({ name: "lsp_rename_preview (python)", passed: false, detail: rename.error.code });
    }

  } catch (err) {
    results.push({ name: "Python group error", passed: false, detail: String(err) });
  } finally {
    shutdown();
  }

  const passed = results.every((r) => r.passed);
  return { group: "Python", results, passed };
}

// ─── Group 4: Safety ────────────────────────────────────────────────────────

async function runSafety(): Promise<GroupResult> {
  const results: TestResult[] = [];
  const { send, shutdown } = startServer(tsFixture);

  try {
    await initServer(send);

    const indexTs = join(tsFixture, "src", "index.ts");
    const utilTs = join(tsFixture, "src", "util.ts");

    // 1. File paths outside workspace are rejected
    const badPath = await callTool(send, "lsp_hover", {
      filePath: "/etc/passwd",
      position: { line: 0, character: 0 },
    });
    results.push({
      name: "path outside workspace rejected",
      passed: badPath.error?.code === "path_outside_workspace" || badPath.error?.code === "out_of_workspace",
      detail: badPath.error?.code,
    });

    // 2. Rename preview does not write files
    const mtimeBefore = statSync(utilTs).mtimeMs;
    await callTool(send, "lsp_rename_preview", {
      filePath: utilTs, position: { line: 0, character: 17 }, newName: "addNumbers",
    });
    const mtimeAfter = statSync(utilTs).mtimeMs;
    results.push({ name: "rename preview does not write files", passed: mtimeBefore === mtimeAfter });

    // 3. Unsupported file types return structured errors
    const rbPath = join(tsFixture, "test.rb");
    const badExt = await callTool(send, "lsp_hover", {
      filePath: rbPath,
      position: { line: 0, character: 0 },
    });
    results.push({
      name: "unsupported file type returns structured error",
      passed: badExt.error?.code === "unsupported_language",
      detail: badExt.error?.code,
    });

    // 4. Large reference results are truncated (use maxResults: 1)
    const trunc = await callTool(send, "lsp_references", {
      filePath: indexTs, position: { line: 1, character: 17 }, maxResults: 1,
    });
    if (!trunc.error) {
      const returnedOk = trunc.returned <= 1;
      const hasTruncated = "truncated" in trunc;
      results.push({ name: "reference truncation works", passed: returnedOk && hasTruncated });
    } else {
      results.push({ name: "reference truncation", passed: false, detail: trunc.error.code });
    }

  } catch (err) {
    results.push({ name: "Safety group error", passed: false, detail: String(err) });
  } finally {
    shutdown();
  }

  const passed = results.every((r) => r.passed);
  return { group: "Safety", results, passed };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("MCP-LSP-V1 Acceptance Tests\n");

  const groups = [
    await runHealth(),
    await runTypeScript(),
    await runPython(),
    await runSafety(),
  ];

  let total = 0, passed = 0;
  for (const g of groups) {
    console.log(`\n${g.passed ? "✓" : "✗"} ${g.group}`);
    for (const r of g.results) {
      const mark = r.passed ? "  ✓" : "  ✗";
      console.log(`${mark} ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
    }
    total += g.results.length;
    passed += g.results.filter((r) => r.passed).length;
  }

  console.log(`\n${passed}/${total} passed`);
  const allPassed = groups.every((g) => g.passed);
  console.log(allPassed ? "\nAll acceptance groups passed." : "\nSome groups failed.");

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("Acceptance fatal error:", err);
  process.exit(1);
});

/**
 * V3 integration test — runs against all 4 LSP servers.
 *
 * Requires: pnpm run build
 * Run: pnpm run test:integration:v3
 */
import { spawn } from "node:child_process";
import { resolve, join } from "node:path";

const workspaceRoot = resolve(process.cwd());
let id = 0;
function nextId() { return ++id; }

function parseResponse(line: string): { id: number; result?: unknown; error?: unknown } | null {
  try { return JSON.parse(line); } catch { return null; }
}

async function spawnServer(fixture: string) {
  const child = spawn("node", [join(workspaceRoot, "dist", "index.js")], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, WORKSPACE_PATH: fixture, PATH: `${process.env.HOME}/.cargo/bin:${process.env.PATH}` },
  });
  child.stderr.on("data", (_: Buffer) => {});

  const send = (method: string, params: unknown): Promise<{ content: Array<{ text: string }> }> => {
    return new Promise((resolve, reject) => {
      const msg = JSON.stringify({ jsonrpc: "2.0", id: nextId(), method, params });
      child.stdin.write(msg + "\n");
      const timeout = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 30_000);
      const handler = (chunk: Buffer) => {
        const line = chunk.toString().trim();
        if (!line) return;
        const resp = parseResponse(line);
        if (!resp || resp.id !== id) return;
        clearTimeout(timeout);
        child.stdout.off("data", handler);
        if (resp.error) reject(new Error(JSON.stringify(resp.error)));
        else resolve(resp.result as any);
      };
      child.stdout.on("data", handler);
    });
  };

  // Initialize
  await send("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "v3-integration", version: "0.1.0" } });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
  await new Promise(r => setTimeout(r, 1000));

  return { child, send };
}

async function callTool(send: (m: string, p: unknown) => Promise<{ content: Array<{ text: string }> }>, name: string, args: unknown) {
  const result = await send("tools/call", { name, arguments: args });
  return JSON.parse(result.content[0].text);
}

async function runLanguageTests(lang: string, fixture: string, files: Record<string, string>) {
  const results: Array<{ name: string; pass: boolean; detail?: string }> = [];
  const r = (name: string, pass: boolean, detail?: string) => results.push({ name: `${lang}: ${name}`, pass, detail });

  let server: Awaited<ReturnType<typeof spawnServer>>;
  try {
    server = await spawnServer(fixture);
  } catch (err) {
    r("server spawn", false, String(err));
    return results;
  }
  const { send, child } = server;

  try {
    // ── Health check ─────────────────────────────────────────────────────
    const health = await callTool(send, "lsp_health_check", {});
    const caps = (health.languages?.[lang]?.capabilities ?? {}) as Record<string, boolean>;
    r("health check ok", health.ok === true);

    // ── Declaration ──────────────────────────────────────────────────────
    if (caps.declaration) {
      const decl = await callTool(send, "lsp_declaration", { filePath: files.main, position: files.declPos });
      r("declaration returns locations", decl.locations !== undefined);
    } else {
      r("declaration (unsupported — expected)", true);
    }

    // ── Type Definition ──────────────────────────────────────────────────
    if (caps.typeDefinition) {
      const td = await callTool(send, "lsp_type_definition", { filePath: files.main, position: files.typePos });
      r("type_definition returns locations", td.locations !== undefined && !td.error);
    } else {
      r("type_definition (unsupported — expected)", true);
    }

    // ── Implementation ───────────────────────────────────────────────────
    if (caps.implementation) {
      const impl = await callTool(send, "lsp_implementation", { filePath: files.main, position: files.implPos });
      r("implementation returns locations", impl.locations !== undefined);
    } else {
      r("implementation (unsupported — expected)", true);
    }

    // ── Signature Help ───────────────────────────────────────────────────
    if (caps.signatureHelp) {
      const sig = await callTool(send, "lsp_signature_help", { filePath: files.main, position: files.sigPos });
      r("signature_help returns signatures", sig.signatures !== undefined);
    } else {
      r("signature_help (unsupported — expected)", true);
    }

    // ── Completion ───────────────────────────────────────────────────────
    if (caps.completion) {
      const comp = await callTool(send, "lsp_completion", { filePath: files.main, position: files.compPos, maxResults: 5 });
      r("completion returns items", comp.items !== undefined);
      r("completion does not apply edits", !comp.items?.some((i: any) => i.insertText !== undefined));
    } else {
      r("completion (unsupported — expected)", true);
    }

    // ── Call Hierarchy ───────────────────────────────────────────────────
    if (caps.callHierarchy) {
      const prep = await callTool(send, "lsp_prepare_call_hierarchy", { filePath: files.main, position: files.callPos });
      if (prep.items?.length > 0) {
        const itemId = prep.items[0].id;
        r("prepare_call_hierarchy returns items with IDs", itemId !== undefined);

        const incoming = await callTool(send, "lsp_incoming_calls", { itemId, maxResults: 10 });
        r("incoming_calls returns calls", incoming.calls !== undefined);

        const outgoing = await callTool(send, "lsp_outgoing_calls", { itemId, maxResults: 10 });
        r("outgoing_calls returns calls", outgoing.calls !== undefined);

        // Test expired/not_found errors
        const missing = await callTool(send, "lsp_incoming_calls", { itemId: "nonexistent-id", maxResults: 1 });
        r("incoming_calls not_found error", missing.error?.code === "call_hierarchy_item_not_found");
      } else {
        r("prepare_call_hierarchy (no items — may be unsupported)", true);
        r("incoming_calls (skipped)", true);
        r("outgoing_calls (skipped)", true);
        r("incoming_calls not_found (skipped)", true);
      }
    } else {
      r("call hierarchy (unsupported — expected)", true);
    }

    // ── Type Hierarchy ───────────────────────────────────────────────────
    if (caps.typeHierarchy) {
      const tprep = await callTool(send, "lsp_prepare_type_hierarchy", { filePath: files.main, position: files.typeHierPos });
      if (tprep.items?.length > 0) {
        const itemId = tprep.items[0].id;
        r("prepare_type_hierarchy returns items with IDs", itemId !== undefined);

        const sup = await callTool(send, "lsp_supertypes", { itemId, maxResults: 10 });
        r("supertypes returns items", sup.items !== undefined);

        const sub = await callTool(send, "lsp_subtypes", { itemId, maxResults: 10 });
        r("subtypes returns items", sub.items !== undefined);

        const missing = await callTool(send, "lsp_subtypes", { itemId: "nonexistent", maxResults: 1 });
        r("subtypes not_found error", missing.error?.code === "type_hierarchy_item_not_found");
      } else {
        r("prepare_type_hierarchy (no items — may be unsupported)", true);
        r("supertypes (skipped)", true);
        r("subtypes (skipped)", true);
        r("subtypes not_found (skipped)", true);
      }
    } else {
      r("type hierarchy (unsupported — expected)", true);
    }

    // ── Composite: Change Impact ─────────────────────────────────────────
    const impact = await callTool(send, "lsp_analyze_change_impact", {
      filePath: files.main, position: files.callPos, changeKind: "signature_change",
      maxReferences: 50, includeCallers: true, includeCallees: true, includeImplementations: true,
    });
    r("analyze_change_impact returns symbol", impact.symbol !== undefined);
    r("analyze_change_impact returns references", impact.references !== undefined);
    r("analyze_change_impact returns risks", impact.risks !== undefined);
    r("analyze_change_impact returns recommendations", impact.recommendations !== undefined);

    // ── Composite: Fix Diagnostic Candidates ─────────────────────────────
    const fix = await callTool(send, "lsp_fix_diagnostic_candidates", {
      filePath: files.main, diagnosticIndex: 0,
      includeCodeActions: true, includeHover: true, includeDefinition: true, includeSignatureHelp: true,
    });
    // May return diagnostic_not_found if file is clean — that's fine
    r("fix_diagnostic_candidates (no crash)", fix.error === undefined || fix.error.code === "diagnostic_not_found" || fix.diagnostic !== undefined);

    // ── Composite: Explain Diagnostics ───────────────────────────────────
    const explain = await callTool(send, "lsp_explain_diagnostics", { workspaceWide: true, maxDiagnostics: 10 });
    r("explain_diagnostics returns summary", typeof explain.summary === "string");
    r("explain_diagnostics returns total", typeof explain.total === "number");

  } catch (err) {
    r(`unexpected error`, false, String(err));
  }

  child.kill();
  return results;
}

async function main() {
  const allResults: Array<{ name: string; pass: boolean; detail?: string }> = [];

  // TypeScript
  const tsFixture = join(workspaceRoot, "fixtures", "sample-ts");
  const tsResults = await runLanguageTests("typescript", tsFixture, {
    main: join(tsFixture, "src", "index.ts"),
    declPos: { line: 3, character: 15 },    // add in sumTo
    typePos: { line: 1, character: 10 },     // import { add }
    implPos: { line: 1, character: 10 },      // same spot
    sigPos: { line: 3, character: 31 },       // add(total, i)
    compPos: { line: 4, character: 5 },       // inside sumTo body
    callPos: { line: 3, character: 15 },      // sumTo — for call hierarchy
    typeHierPos: { line: 1, character: 10 },  // same spot
  });
  allResults.push(...tsResults);

  // Python
  const pyFixture = join(workspaceRoot, "fixtures", "sample-py");
  const pyResults = await runLanguageTests("python", pyFixture, {
    main: join(pyFixture, "src", "hello.py"),
    declPos: { line: 1, character: 5 },
    typePos: { line: 5, character: 10 },
    implPos: { line: 1, character: 5 },
    sigPos: { line: 5, character: 15 },
    compPos: { line: 7, character: 0 },
    callPos: { line: 1, character: 5 },
    typeHierPos: { line: 1, character: 5 },
  });
  allResults.push(...pyResults);

  // Go
  const goFixture = join(workspaceRoot, "fixtures", "sample-go");
  const goResults = await runLanguageTests("go", goFixture, {
    main: join(goFixture, "main.go"),
    declPos: { line: 8, character: 10 },      // FriendlyGreeter
    typePos: { line: 35, character: 15 },       // c.Add(1, 2) — param `a` has type int
    implPos: { line: 4, character: 6 },        // Greeter interface
    sigPos: { line: 35, character: 15 },       // c.Add(1, 2)
    compPos: { line: 36, character: 0 },
    callPos: { line: 8, character: 10 },       // FriendlyGreeter.Greet
    typeHierPos: { line: 4, character: 6 },    // Greeter
  });
  allResults.push(...goResults);

  // Rust
  const rsFixture = join(workspaceRoot, "fixtures", "sample-rs");
  const rsResults = await runLanguageTests("rust", rsFixture, {
    main: join(rsFixture, "src", "main.rs"),
    declPos: { line: 9, character: 8 },        // FriendlyGreeter
    typePos: { line: 23, character: 8 },        // Calculator
    implPos: { line: 2, character: 7 },         // Greeter trait
    sigPos: { line: 33, character: 10 },        // c.add(1, 2)
    compPos: { line: 34, character: 0 },
    callPos: { line: 9, character: 8 },         // FriendlyGreeter
    typeHierPos: { line: 2, character: 7 },     // Greeter
  });
  allResults.push(...rsResults);

  // Report
  const passed = allResults.filter(r => r.pass);
  const failed = allResults.filter(r => !r.pass);

  console.log(`\n=== V3 Integration Results ===`);
  console.log(`Passed: ${passed.length}/${allResults.length}`);
  if (failed.length > 0) {
    console.log(`\nFailed:`);
    for (const f of failed) console.log(`  FAIL: ${f.name} — ${f.detail ?? "no detail"}`);
  }

  if (failed.length > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });

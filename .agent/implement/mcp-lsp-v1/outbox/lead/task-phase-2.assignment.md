# Assignment: task-phase-2

**Task ID:** task-phase-2
**Phase:** phase-2 — LSP process manager
**Worktree:** `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-2`
**Branch:** `task/phase-2` (already created from `feat/version-1` — does NOT yet contain phase-1's code; phase-1 was merged to feat/version-1 separately)
**Spec:** `docs/mcp-lsp-v1/spec/spec-phase-2.md`
**Why doc:** `docs/mcp-lsp-v1/phases/phase-2.md`
**Assigned at:** 2026-06-08
**Attempts allowed:** 3

## Mission

Build a reusable `LspClient` class that spawns `typescript-language-server` over stdio, completes the `initialize` / `initialized` handshake, stores capabilities, and shuts down cleanly. Provide a smoke script that exits 0 on success and 1 with `lsp_server_unavailable` on a missing binary. The LspClientManager in this phase is a stub returning null — phase-3 fills it in.

## Note on base branch

`task/phase-2` is currently at `b10e585` (the same commit as `feat/version-1` was BEFORE phase-1 was merged). After phase-1's merge commit `892551e` lands on `feat/version-1`, the implementation that follows for phase-2 must still be added on `task/phase-2` — **do not switch branches, do not rebase onto feat/version-1**. The integration happens at merge time, when lead fast-forwards or rebases `task/phase-2` onto the post-merge `feat/version-1` head.

If you find a real need to read the phase-1 source (e.g., to know what `ToolContext` looks like or what `registerAllTools` exports), read it from the **integration commit** on `feat/version-1` (commit `892551e`) using `git show 892551e:<path>` — that is treated as an outside read (escalate it).

## Allowed reads

- `docs/mcp-lsp-v1/spec/spec-phase-2.md`
- `docs/mcp-lsp-v1/phases/phase-2.md`
- `docs/mcp-lsp-v1/contract.md`
- `spec/version-1.md` §11, §11.1, §19 (capability check)
- The phase-1 source files **via `git show 892551e:<path>`** if needed (record in read_escalations.ndjson)
- Files in your worktree as you create them

## Allowed writes (in the worktree only)

- `src/lsp/LspClient.ts` (new)
- `src/lsp/LspClientManager.ts` (new)
- `src/lsp/capabilities.ts` (new)
- `src/utils/asyncTimeout.ts` (new)
- `src/utils/asyncTimeout.test.ts` (new)
- `src/utils/uri.ts` (new)
- `scripts/phase-2-smoke.ts` (new)
- `package.json` (add scripts: `smoke:phase-2` and `smoke:phase-2:neg`)

Do NOT touch `src/mcp/registerTools.ts` (per spec) or any other phase-1 source.

## Concrete steps

1. `cd` into the worktree. Confirm branch is `task/phase-2`. Confirm `pnpm install` runs cleanly (it will create a fresh `node_modules` from scratch — phase-1's lockfile is on `feat/version-1` but not yet on `task/phase-2`; that's fine, this worktree has its own dependencies).
2. `pnpm add vscode-jsonrpc vscode-languageserver-protocol vscode-languageserver-types` — these were already added in phase-1's lockfile. They will be re-added on `task/phase-2`'s lockfile; that's expected. Pin to the same semver ranges as phase-1 used (read them with `git show 892551e:package.json` if needed).
3. Write `src/utils/asyncTimeout.ts`:
   ```ts
   export async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
     return await Promise.race([
       p,
       new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout: ${label}`)), ms))
     ]);
   }
   ```
4. Write `src/utils/uri.ts` exporting `pathToFileURL(workspacePath: string): URL` (use `pathToFileURL` from `node:url`) and `workspaceUri(workspacePath: string): string` (returns the URL's `toString()`).
5. Write `src/lsp/capabilities.ts` exporting `ServerCapabilitiesSnapshot` interface with at least: `hoverProvider`, `definitionProvider`, `referencesProvider`, `documentSymbolProvider`, `workspaceSymbolProvider`, `diagnosticProvider` (all `boolean | unknown`). Export `extractCapabilities(sc: any): ServerCapabilitiesSnapshot` that picks those fields and stores the rest as `raw`.
6. Write `src/lsp/LspClient.ts`:
   - `static async spawn(opts: { command: string; args: string[]; workspacePath: string; rootUri: string; startupTimeoutMs?: number }): Promise<LspClient>`:
     - First, run `command -v <command>` via `child_process.execFile`. If it returns non-zero, throw `new Error("lsp_server_unavailable: " + opts.command + " not found on PATH")`.
     - Spawn the process with `child_process.spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] })`.
     - Wire `stdio[0]` to a `createConnection(process.stdin/stdout, process.stdout/stdin)` — use the read/write streams from the child.
     - On stderr from the child, log lines to `console.error` (prefixed with `[lsp:<pid>]`).
     - Send `initialize` request with `InitializeParams`: `{ processId: process.pid, rootUri, capabilities: { workspace: { workspaceFolders: true }, textDocument: { synchronization: { dynamicRegistration: false }, hover: { contentFormat: ["markdown", "plaintext"] }, definition: { linkSupport: true }, references: {}, documentSymbol: { hierarchical: true }, workspaceSymbol: {} } }, workspaceFolders: [{ uri: rootUri, name: "workspace" }], initializationOptions: {} }`. (Match spec §11.1 — keep it conservative; typescript-language-server will fill the gaps.)
     - `await withTimeout(connection.sendRequest("initialize", params), opts.startupTimeoutMs ?? 30_000, "initialize")`.
     - `connection.sendNotification("initialized", {})`.
     - `connection.listen()`.
     - Store the response's `.capabilities` via `extractCapabilities`.
     - Subscribe to `publishDiagnostics` notifications and log to stderr (sink only; phase-6 wires the cache).
     - Return the client.
   - `request<R>(method, params, timeoutMs?): Promise<R>` — `withTimeout(connection.sendRequest(method, params), timeoutMs ?? 10_000, method)`.
   - `notify(method, params): void` — `connection.sendNotification(method, params)`.
   - `async shutdown(): Promise<void>`:
     - Try `await connection.sendRequest("shutdown", null)` with a 3s timeout.
     - `connection.sendNotification("exit", null)`.
     - `connection.dispose()`.
     - `this.proc.kill("SIGTERM")`.
     - Best-effort: if the process is already gone, ignore.
   - `getCapabilities(): ServerCapabilitiesSnapshot` — returns stored caps.
7. Write `src/lsp/LspClientManager.ts` with a stub `getClientForLanguage(lang: string): LspClient | null` that returns null. (Phase-3 fills the registry.)
8. Write `src/utils/asyncTimeout.test.ts` (node:test) with two cases:
   - `withTimeout(Promise.resolve(1), 100, "fast")` returns 1.
   - `withTimeout(new Promise((r) => setTimeout(() => r(2), 500)), 50, "slow")` rejects with a `timeout: slow` Error.
9. Write `scripts/phase-2-smoke.ts`:
   - Uses `tsx` to run.
   - Builds an `LspClient` via `LspClient.spawn({ command: "typescript-language-server", args: ["--stdio"], workspacePath: process.cwd(), rootUri: pathToFileURL(process.cwd()).toString() })`.
   - Awaits spawn.
   - Prints `console.log(JSON.stringify({ ok: true, capabilities: client.getCapabilities() }, null, 2));` — the JSON goes to stdout because the smoke script's stdout is the user's terminal, not the MCP transport.
   - Calls `await client.shutdown()`.
   - Exits 0 on success, 1 on failure (with the error message on stderr).
10. Add to `package.json`:
    - `scripts.smoke:phase-2`: `tsx scripts/phase-2-smoke.ts`
    - `scripts.smoke:phase-2:neg`: `env PATH=/usr/bin:/bin tsx scripts/phase-2-smoke.ts || true` — wait, this won't return non-zero from npm scripts; instead just document the negative case in the report.
11. Run validation, in this order, in the worktree:
    - `pnpm install` (expect exit 0)
    - `pnpm run typecheck` (expect exit 0)
    - `pnpm run build` (expect exit 0; `dist/scripts/phase-2-smoke.js` may or may not exist — `scripts/` is in `tsconfig` exclude by convention; check `tsconfig.json` and if `scripts/**` is not in `include`, that's fine; if it IS in include, fine too)
    - `pnpm test` (expect exit 0; the `asyncTimeout.test.ts` must pass)
    - `pnpm run smoke:phase-2` (expect exit 0; stdout contains `serverCapabilities` or `capabilities` key)
    - Negative test (run manually, do NOT add as a script): `PATH=/usr/bin:/bin tsx scripts/phase-2-smoke.ts` — expect exit 1, stderr contains `lsp_server_unavailable`. (Do not auto-run this in a script that may not exist on all shells.)
12. Stage and commit with message `feat(phase-2): LSP process manager (LspClient + smoke)`.

## Exit criteria

`pnpm run typecheck`, `pnpm run build`, `pnpm test`, and `pnpm run smoke:phase-2` all exit 0; smoke stdout contains the `capabilities` field; commit exists on `task/phase-2`.

## Report

Write a report to `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-2.report.md` with:
- Final commit SHA on `task/phase-2`
- Files created (path list)
- Validation output (typecheck, build, test, smoke exit codes; capture smoke stdout/stderr in the report)
- Negative-case result (the PATH=/usr/bin:/bin run)
- Any deviations from the spec and why
- Any read escalations you filed

## Hard rules

- Do not switch branches or rebase.
- Do not modify `src/mcp/registerTools.ts` or any other phase-1 file in this worktree.
- Do not write outside the worktree.
- If `pnpm run typecheck` or `pnpm run smoke:phase-2` fails, fix the code, re-run, and document the fix in the report. You have 3 attempts.

## Reference paths

- Worktree: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-2`
- Branch: `task/phase-2`
- Spec: `/Volumes/Workspace/rnd/workflow/mcp/lsp/docs/mcp-lsp-v1/spec/spec-phase-2.md`
- Phase-1 integration commit on `feat/version-1`: `892551e` (read phase-1 sources via `git show 892551e:<path>` if needed)
- Report to: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-2.report.md`

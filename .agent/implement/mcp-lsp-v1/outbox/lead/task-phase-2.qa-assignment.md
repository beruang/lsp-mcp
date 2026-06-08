# QA Assignment: task-phase-2

**Task ID:** task-phase-2
**Phase:** phase-2 — LSP process manager
**Worktree:** `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-2`
**Branch:** `task/phase-2` @ commit `769b8cf`
**Spec under test:** `/Volumes/Workspace/rnd/workflow/mcp/lsp/docs/mcp-lsp-v1/spec/spec-phase-2.md`
**Implementer report:** `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-2.report.md`
**Phase-1 reference commit on feat/version-1:** `892551e`
**Assigned at:** 2026-06-08
**Max attempts before escalation:** 2 (after 2 failed QA passes, escalate to lead)

## Your job

Independently verify the phase-2 work. The worktree is on `task/phase-2` branched off `b10e585` (pre-phase-1). It has been **bootstrapped with copies of phase-1's `package.json` and `tsconfig.json`** (per implementer deviation #2) and the test script was changed to point at the new test file. Verify all of that.

Re-run every validation step. Drive the smoke script. Re-run the negative case. Confirm there is no stdout pollution. Do not trust the report.

## Allowed reads

- `/Volumes/Workspace/rnd/workflow/mcp/lsp/docs/mcp-lsp-v1/spec/spec-phase-2.md`
- `/Volumes/Workspace/rnd/workflow/mcp/lsp/docs/mcp-lsp-v1/phases/phase-2.md`
- `/Volumes/Workspace/rnd/workflow/mcp/lsp/docs/mcp-lsp-v1/contract.md`
- `/Volumes/Workspace/rnd/workflow/mcp/lsp/spec/version-1.md` §11, §11.1, §19
- `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-2.report.md`
- All files inside the phase-2 worktree (read-only)
- Phase-1 reference at `git show 892551e:<path>` from the worktree

## Allowed writes

- QA report at `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-2.qa-report.md`
- Optional one-line summary to `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/qa_reports.ndjson`
- Read escalations to `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/read_escalations.ndjson`

Do NOT modify the worktree.

## Verification checklist

Run from `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-2`:

1. **Files in commit match spec.** `git show --stat HEAD` — must include:
   - `src/lsp/LspClient.ts`, `src/lsp/LspClientManager.ts`, `src/lsp/capabilities.ts`
   - `src/utils/asyncTimeout.ts`, `src/utils/uri.ts`
   - `scripts/phase-2-smoke.ts`
   - `package.json` (modified)
   - **Acceptable additions** (deviation-allowed): `src/utils/asyncTimeout.test.ts`, `pnpm-lock.yaml`, `tsconfig.json` (the latter two are required bootstrapping since the worktree predates phase-1).
2. **No stray files.** `git ls-files` — no `node_modules/`, `dist/`. Worktree-only files outside the commit (e.g., `.git/` worktree metadata) are fine.
3. **`package.json` content.** Has `type: "module"`. Scripts include `dev`, `build`, `start`, `typecheck`, `test`, `smoke:phase-2`. Deps include `vscode-jsonrpc`, `vscode-languageserver-protocol`, `vscode-languageserver-types`, plus the phase-1 deps. **Deviation #1 acceptable:** the `test` script may point at `src/utils/asyncTimeout.test.ts` (the only test file in this worktree) — this is correct given phase-1's `src/mcp/toolErrors.test.ts` is not on `task/phase-2`.
4. **`tsconfig.json` matches phase-1.** Read the file and `git show 892551e:tsconfig.json`. They should be essentially identical (or differ only in `include` if you think scripts should be type-checked; this is fine either way).
5. **`src/utils/asyncTimeout.ts`.** Exports `withTimeout<T>(p, ms, label)`. Rejects with `Error("timeout: <label>")` after `ms`.
6. **`src/utils/uri.ts`.** Exports `pathToFileURL(p)` and `workspaceUri(p)`. Use the `node:url` `pathToFileURL`.
7. **`src/lsp/capabilities.ts`.** Exports `ServerCapabilitiesSnapshot` interface and `extractCapabilities(sc)`. The interface includes at least: `hoverProvider`, `definitionProvider`, `referencesProvider`, `documentSymbolProvider`, `workspaceSymbolProvider`, `diagnosticProvider` (all `boolean | unknown`), plus a `raw` field.
8. **`src/lsp/LspClient.ts` shape.** Exports a `LspClient` class with:
   - `static spawn({ command, args, workspacePath, rootUri, startupTimeoutMs? })` — runs `command -v` first and throws `lsp_server_unavailable: <command> not found on PATH` if missing.
   - `request<R>(method, params, timeoutMs?)` — wraps `connection.sendRequest` with `withTimeout`.
   - `notify(method, params)` — wraps `connection.sendNotification`.
   - `shutdown()` — sends `shutdown` request, then `exit` notification, then kills the process.
   - `getCapabilities()` — returns stored caps.
9. **`src/lsp/LspClientManager.ts`.** Exports a `getClientForLanguage(lang)` that returns `null` (phase-2 stub). Phase-3 fills this.
10. **Run `pnpm install` (exit 0).**
11. **Run `pnpm run typecheck` (exit 0).**
12. **Run `pnpm run build` (exit 0).** Confirm `dist/lsp/LspClient.js` exists (or whatever the build emits; just confirm something emitted).
13. **Run `pnpm test` (exit 0).** The asyncTimeout test must pass. Look for two cases: success path and timeout-rejection path with label.
14. **Run `pnpm run smoke:phase-2` (exit 0).** Stdout must contain JSON with a `capabilities` field. Capture the output and paste the first 20 lines in your report.
15. **Negative case.** `PATH=/usr/bin:/bin tsx scripts/phase-2-smoke.ts` — expect exit 1 and stderr containing `lsp_server_unavailable`. Document the exact stderr line.
16. **No stdout pollution in steady state.** Run `pnpm run smoke:phase-2 > /tmp/p2-smoke-stdout.txt 2> /tmp/p2-smoke-stderr.txt`. The stdout file should contain ONLY the JSON output from the smoke script (no debug logs, no banner lines). The stderr file should contain lifecycle logs (spawn line, capability highlights, shutdown) but not the JSON.
17. **No process leak.** After smoke, run `ps -ef | grep -i typescript-language-server | grep -v grep`. The result should be empty.
18. **Worktree clean.** `git -C /Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-2 status --porcelain` — only the worktree's own pre-existing untracked files, no uncommitted changes from the implementation.

## Verdict format

After running all 18 checks, write the QA report with:
- Pass/Fail for each check
- Final verdict: **PASS** or **FAIL**
- If FAIL: which check failed, what was actual vs expected, and what a fixer should do
- Always include: pnpm install/typecheck/build/test/smoke exit codes; smoke stdout excerpt; negative-case stderr

## Hard rules

- You are READ-ONLY on the worktree's code. Do not edit, do not commit, do not push.
- Stay inside the worktree for code reads. Use absolute paths elsewhere.
- Be honest. A false PASS will block the rest of the build.

## Reference paths

- Worktree: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-2`
- Branch: `task/phase-2`
- Spec: `/Volumes/Workspace/rnd/workflow/mcp/lsp/docs/mcp-lsp-v1/spec/spec-phase-2.md`
- Implementer report: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-2.report.md`
- Your report: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-2.qa-report.md`

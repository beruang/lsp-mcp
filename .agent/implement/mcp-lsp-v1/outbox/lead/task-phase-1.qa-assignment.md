# QA Assignment: task-phase-1

**Task ID:** task-phase-1
**Phase:** phase-1 — Project skeleton
**Worktree:** `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-1`
**Branch:** `task/phase-1` @ commit `bbd3bb9`
**Spec under test:** `/Volumes/Workspace/rnd/workflow/mcp/lsp/docs/mcp-lsp-v1/spec/spec-phase-1.md`
**Implementer report:** `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-1.report.md`
**Assigned at:** 2026-06-08
**Max attempts before escalation:** 2 (after 2 failed QA passes, escalate to lead)

## Your job

Independently verify the phase-1 work. The implementer reports success — your job is to either confirm or find a regression. Do not trust the report. Re-run validation. Read the diff. Spot-check the response format.

## Allowed reads

- `/Volumes/Workspace/rnd/workflow/mcp/lsp/docs/mcp-lsp-v1/spec/spec-phase-1.md`
- `/Volumes/Workspace/rnd/workflow/mcp/lsp/docs/mcp-lsp-v1/phases/phase-1.md`
- `/Volumes/Workspace/rnd/workflow/mcp/lsp/docs/mcp-lsp-v1/contract.md`
- `/Volumes/Workspace/rnd/workflow/mcp/lsp/spec/version-1.md` §14, §16, §17, §22, §23, §6
- `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-1.report.md`
- All files inside the phase-1 worktree (read-only)

If you need any file outside this list, write a read escalation to `.agent/implement/mcp-lsp-v1/read_escalations.ndjson` first.

## Allowed writes

- QA report at `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-1.qa-report.md`
- Optional notes to `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/qa_reports.ndjson` (one line summarizing pass/fail)
- Read escalations to `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/read_escalations.ndjson`

Do NOT modify code in the worktree. You are read-only on the implementation.

## Verification checklist (all must pass)

Run from the worktree directory `cd /Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-1`:

1. **Files in commit are the spec's file list.** `git show --stat HEAD` and confirm 11 files match the spec's "New Files" list: `package.json`, `tsconfig.json`, `.gitignore`, `src/index.ts`, `src/mcp/registerTools.ts`, `src/mcp/toolErrors.ts`, `src/mcp/schemas.ts`, `README.md`, `fixtures/.gitkeep`. (`pnpm-lock.yaml` and `src/mcp/toolErrors.test.ts` are allowed additions documented in the assignment.)
2. **No stray files.** `git ls-files` includes only the spec/assignment-allowed files. No `node_modules/`, `dist/`, `fixtures/sample-*`.
3. **`package.json` content.** Has `"type": "module"`, `"scripts": { dev, build, start, typecheck, test }` with the right commands. Check `dev` runs `tsx src/index.ts`, `build` runs `tsc`, `start` runs `node dist/index.js`, `typecheck` runs `tsc --noEmit`, `test` runs node's test runner. Deps include `@modelcontextprotocol/sdk`, `zod`, `vscode-jsonrpc`, `vscode-languageserver-protocol`, `vscode-languageserver-types`. DevDeps include `typescript`, `tsx`, `@types/node`, `diff`, `@types/diff`.
4. **`tsconfig.json` content.** ES2022 target, NodeNext module + moduleResolution, strict on, outDir dist, rootDir src, include src/**/*.ts.
5. **`pnpm install` clean.** Run it. Expect exit 0. Note: pnpm v10 may emit an esbuild-build-scripts notice — that is acceptable.
6. **`pnpm run typecheck` clean.** Run it. Expect exit 0 with no errors.
7. **`pnpm run build` clean.** Run it. Expect exit 0. Confirm `dist/index.js` exists.
8. **`pnpm test` clean.** Run it. Expect exit 0. The `toolErrors.test.ts` file must include the spec-required assertion `toolError("foo", "bar") returns { error: { code: "foo", message: "bar" } }` as one of its cases.
9. **`src/mcp/toolErrors.ts` exports.** Exports both `ToolError` interface and `toolError(code, message, details?)` helper. The helper returns the `{ error: { code, message, details? } }` envelope.
10. **`src/mcp/schemas.ts` exports.** Exports `PositionSchema` and `RangeSchema` as Zod schemas.
11. **`src/mcp/registerTools.ts` exports.** Exports `registerAllTools(server, ctx)` with `ctx = { workspacePath: string }`. Registers a single tool `lsp_health_check` whose handler returns `{ ok: true, message: "phase-1 stub" }` as a single MCP text content block whose `text` field is **pretty JSON with two-space indent**.
12. **`src/index.ts` behavior.** Reads `WORKSPACE_PATH` with `process.cwd()` fallback. Logs to **stderr only** (verify `console.error` or `process.stderr` — never `console.log` or `process.stdout.write` for log lines). Connects `StdioServerTransport`.
13. **Stub payload roundtrip.** Use the JSON-RPC harness described below to drive the server:
    ```bash
    cd /Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-1
    (printf '%s\n%s\n%s\n%s\n' \
       '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"qa","version":"0"}}}' \
       '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
       '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
       '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"lsp_health_check","arguments":{}}}' \
       | WORKSPACE_PATH="$(pwd)/fixtures" node dist/index.js > /tmp/p1-qa.stdout 2> /tmp/p1-qa.stderr) ; echo exit=$?
    ```
    Then inspect:
    - `cat /tmp/p1-qa.stderr` should contain `MCP server ready, workspace=...`. May also contain esbuild info. No JSON-RPC frames on stderr.
    - `grep -E '^\{' /tmp/p1-qa.stdout` should produce 3 JSON lines (initialize, tools/list, tools/call) — one per request.
    - The `tools/call` response for `lsp_health_check` must contain a `result.content` array with one item, type `text`, and `text` field whose value parses as JSON and equals `{"ok": true, "message": "phase-1 stub"}` exactly (pretty-printed, two-space indent).
    - No stray stdout output besides the 3 JSON-RPC frames.
14. **WORKSPACE_PATH fallback.** Run the same harness with `WORKSPACE_PATH=/nonexistent/qa/path` and confirm a stderr warning AND that the readiness log shows the fallback `workspace=<process.cwd()>`.
15. **`.gitignore` content.** Covers `node_modules`, `dist`, `fixtures/sample-ts/node_modules`, `fixtures/sample-py/.venv`, `*.log`, `.DS_Store`. Pre-existing `.agent/worktrees/` line must still be present.
16. **No files written outside the worktree.** `git -C /Volumes/Workspace/rnd/workflow/mcp/lsp status --porcelain` should be unchanged (still just the untracked `docs/` and `spec/`).

## Verdict format

After running all checks, write the QA report with:
- Pass/Fail for each of the 16 checks above
- Final verdict: **PASS** or **FAIL**
- If FAIL: the specific check that failed, the actual vs expected, and what a fixer should do
- Always run: pnpm install, typecheck, build, test. Include exit codes.
- Mention any spec deviation you disagree with (e.g., dependency pinning is fine; missing test cases is not)

## Hard rules

- You are read-only on the worktree's code. Do not edit, do not commit, do not push.
- If you find a real bug, you do NOT fix it. You report it. Lead will spawn a fixer.
- Stay inside the worktree for code reads. Use absolute paths elsewhere.
- Be honest in the verdict. A false PASS will block the rest of the build.

## Reference paths

- Worktree: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-1`
- Spec: `/Volumes/Workspace/rnd/workflow/mcp/lsp/docs/mcp-lsp-v1/spec/spec-phase-1.md`
- Implementer report: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-1.report.md`
- Review plan source: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/review_plan.ndjson` (entry `phase-1-review`)
- Your report: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-1.qa-report.md`

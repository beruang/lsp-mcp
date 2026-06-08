# Assignment: task-phase-1

**Task ID:** task-phase-1
**Phase:** phase-1 — Project skeleton
**Worktree:** `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-1`
**Branch:** `task/phase-1` (already created from `feat/version-1`)
**Spec:** `docs/mcp-lsp-v1/spec/spec-phase-1.md`
**Why doc:** `docs/mcp-lsp-v1/phases/phase-1.md`
**Assigned at:** 2026-06-08
**Attempts allowed:** 3

## Mission

Bootstrap a TypeScript MCP stdio server in the worktree. Register one dummy `lsp_health_check` tool returning `{ ok: true, message: "phase-1 stub" }` inside a single MCP text content block containing pretty JSON. No LSP yet. No language servers.

## Allowed reads (do not exceed)

- `docs/mcp-lsp-v1/spec/spec-phase-1.md` (the HOW for this phase)
- `docs/mcp-lsp-v1/phases/phase-1.md` (the WHY for this phase)
- `docs/mcp-lsp-v1/contract.md` (scope)
- `spec/version-1.md` §14 (project layout), §16 (Zod), §17 (response format), §22 (package.json), §23 (tsconfig), §6 (workspace model) — read these specific sections only
- Files in your own worktree once you create them

If you need any file outside this allowlist, STOP and write a read-escalation entry to `.agent/implement/mcp-lsp-v1/read_escalations.ndjson` describing the file and the reason, then continue without it.

## Allowed writes (only these, in the worktree only)

- `package.json`
- `tsconfig.json`
- `.gitignore`
- `src/index.ts`
- `src/mcp/registerTools.ts`
- `src/mcp/toolErrors.ts`
- `src/mcp/schemas.ts`
- `src/mcp/toolErrors.test.ts` (allowed even though not in spec — the spec lists it under Unit Tests)
- `README.md`
- `fixtures/.gitkeep`

Do NOT touch:
- `.agent/`, `docs/`, `spec/`, or any of the other `task/phase-*` worktrees
- Any file outside the worktree
- Any file in the integration test fixtures beyond the `.gitkeep` placeholder

## Concrete steps

1. `cd` into the worktree path. Confirm branch is `task/phase-1` (`git rev-parse --abbrev-ref HEAD`).
2. Use `pnpm` (already at `/opt/homebrew/bin/pnpm`). If `pnpm` is not available, fall back to `npm` and document the substitution in the report.
3. Initialize `package.json` with `name: "mcp-lsp-v1"`, `version: "0.1.0"`, `type: "module"`, and scripts:
   - `dev`: `tsx src/index.ts`
   - `build`: `tsc -p tsconfig.json`
   - `start`: `node dist/index.js`
   - `typecheck`: `tsc -p tsconfig.json --noEmit`
   - `test`: `node --test --import tsx src/mcp/toolErrors.test.ts`
4. Add dependencies: `@modelcontextprotocol/sdk`, `zod`, `vscode-jsonrpc`, `vscode-languageserver-protocol`, `vscode-languageserver-types`. Dev deps: `typescript`, `tsx`, `@types/node`, `diff`, `@types/diff`.
5. Write `tsconfig.json` per spec §23: target ES2022, module NodeNext, moduleResolution NodeNext, strict, outDir `dist`, rootDir `src`, include `src/**/*.ts`.
6. Write `.gitignore` covering: `node_modules`, `dist`, `fixtures/sample-ts/node_modules`, `fixtures/sample-py/.venv`, `*.log`, `.DS_Store`.
7. Write `src/mcp/toolErrors.ts` exporting a `ToolError` interface (`{ error: { code: string; message: string; details?: unknown } }`) and a `toolError(code, message, details?)` helper that returns the envelope.
8. Write `src/mcp/schemas.ts` exporting `PositionSchema` (line, character) and `RangeSchema` (start, end Position). Zod primitives.
9. Write `src/mcp/registerTools.ts` exporting `registerAllTools(server, ctx)` where `ctx = { workspacePath: string }`. Inside, register a single tool `lsp_health_check` that returns `{ ok: true, message: "phase-1 stub" }` as a single MCP text content block with pretty JSON (two-space indent).
10. Write `src/index.ts` that:
    - Reads `WORKSPACE_PATH` from env, falls back to `process.cwd()` if unset or non-existent (with a stderr warning when falling back).
    - Creates an `McpServer` (from `@modelcontextprotocol/sdk/server/mcp.js`).
    - Calls `registerAllTools(server, { workspacePath })`.
    - Connects a `StdioServerTransport`.
    - Logs `MCP server ready, workspace=<path>` to stderr on startup.
11. Write `src/mcp/toolErrors.test.ts` with a single node:test that asserts `toolError("foo", "bar")` returns `{ error: { code: "foo", message: "bar" } }`.
12. Write `README.md` with: prerequisites (Node ≥ 20, pnpm/npm, `typescript-language-server`, `pyright`), install, dev, build, start, test commands. Phase-1 entry: "v0.0.1: project skeleton with stub lsp_health_check".
13. Write `fixtures/.gitkeep` (empty).
14. Run validation in this exact order, in the worktree:
    - `pnpm install` (expect exit 0)
    - `pnpm run typecheck` (expect exit 0)
    - `pnpm run build` (expect exit 0; produces `dist/index.js`)
    - `pnpm test` (expect exit 0; toolErrors unit test passes)
    - Quick smoke: `WORKSPACE_PATH=<worktree path> timeout 2 pnpm run dev < /dev/null > /tmp/p1.stdout 2> /tmp/p1.stderr; echo "exit=$?"` — expect the server to log "MCP server ready" to `/tmp/p1.stderr` and produce no JSON on stdout.
15. Stage all new/modified files. Commit with message `feat(phase-1): project skeleton with stub lsp_health_check`. Use `git -C <worktree> add -A` then `git -C <worktree> commit`.

## Exit criteria

`pnpm run typecheck && pnpm run build` both exit 0; unit test passes; commit exists on `task/phase-1`.

## Report

Write a report to `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-1.report.md` with:
- Final commit SHA on `task/phase-1`
- Files created (path list)
- Validation output (typecheck, build, test exit codes)
- Any deviations from the spec and why
- Any read escalations you filed
- A short note on what the next agent (QA) should check

## Hard rules

- Do not change the approved contract or rewrite the spec.
- Do not invent requirements not in spec-phase-1.md.
- Do not write outside the worktree.
- Do not add LSP code; that is phase-2.
- Do not run multiple agents in this worktree.
- If `pnpm install` or `pnpm run typecheck` fails, fix the code, re-run, and document the fix in the report. You have 3 attempts.

## Reference paths

- Worktree: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-1`
- Branch: `task/phase-1`
- Spec: `/Volumes/Workspace/rnd/workflow/mcp/lsp/docs/mcp-lsp-v1/spec/spec-phase-1.md`
- Why: `/Volumes/Workspace/rnd/workflow/mcp/lsp/docs/mcp-lsp-v1/phases/phase-1.md`
- Report to: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-1.report.md`

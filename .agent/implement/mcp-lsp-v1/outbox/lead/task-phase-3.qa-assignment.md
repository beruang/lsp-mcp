# QA Assignment: task-phase-3

**Task ID:** task-phase-3
**Phase:** phase-3 — Routing and safety
**Worktree:** `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-3`
**Branch:** `task/phase-3` @ commit `0e35d1a`
**Spec under test:** `/Volumes/Workspace/rnd/workflow/mcp/lsp/docs/mcp-lsp-v1/spec/spec-phase-3.md`
**Implementer report:** `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-3.report.md`
**Integration reference (latest feat/version-1 head):** commit `b28fa13`
**Assigned at:** 2026-06-08

## Your job

Phase-3 is a low-risk unit-test-heavy phase. Verify the 15 tests (8 path + 7 routing) all pass, the file shapes match the spec, and the deviations documented in the implementer report are acceptable.

## Allowed reads

- spec-phase-3.md, phases/phase-3.md, contract.md
- spec/version-1.md §6, §7, §10.1, §10.3, §10.4
- All files inside the worktree (read-only)
- Implementer report

## Allowed writes

- QA report at `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-3.qa-report.md`
- One-line summary to qa_reports.ndjson (if you want to)

## Verification checklist (12 checks)

Run from the worktree:

1. **Files in commit match spec.** `git show --stat HEAD` — must include `src/config/languageServers.ts`, `src/safety/paths.ts`, `src/safety/limits.ts`, `src/safety/paths.test.ts`, `src/config/languageServers.test.ts`. Acceptable additions: `package.json`, `tsconfig.json`, `.gitignore`, `pnpm-lock.yaml` (bootstrapped from b28fa13), `src/lsp/LspClient.ts` (stub from b28fa13, used by LspClientManager), `src/lsp/capabilities.ts` (from b28fa13). Modified: `src/lsp/LspClientManager.ts`.
2. **No stray files.** `git ls-files` — no `node_modules/`, `dist/`.
3. **`LIMITS` constants match spec §10.3 and §10.4.** Read `src/safety/limits.ts`. `REFERENCES_MAX=200`, `WORKSPACE_SYMBOLS_MAX=100`, `DIAGNOSTICS_MAX=500`. `TIMEOUTS` has `HOVER_MS=3000`, `DEFINITION_MS=5000`, `REFERENCES_MS=10000`, `DOCUMENT_SYMBOLS_MS=5000`, `WORKSPACE_SYMBOLS_MS=10000`, `RENAME_MS=10000`, `HEALTH_CHECK_MS=5000`.
4. **`safeResolve` shape.** Read `src/safety/paths.ts`. Rejects `file://` URIs first. Computes workspaceAbs. Computes candidate via `path.resolve`. Uses `realpath` from `node:fs/promises`. Throws `Error("Path is outside workspace: " + inputPath)` on any rejection.
5. **`languageServers` registry.** Read `src/config/languageServers.ts`. Has `typescript` (extensions `.ts/.tsx/.js/.jsx`, command `typescript-language-server`, args `["--stdio"]`) and `python` (extension `.py`, command `pyright-langserver`, args `["--stdio"]`).
6. **`routeLanguage` covers the 7 cases.**
   - `.ts` → typescript, `.tsx` → typescript, `.js` → typescript, `.jsx` → typescript, `.py` → python, `.rb` → null, `ts` (no leading dot) → null.
7. **`LspClientManager.getClientForLanguage` is real, not a stub.** Reads the registry; calls `LspClient.spawn` (or its stub equivalent) on first call; returns the cached client on subsequent calls; returns null for unknown languages.
8. **Run `pnpm install` (exit 0).**
9. **Run `pnpm run typecheck` (exit 0).**
10. **Run `pnpm run build` (exit 0).**
11. **Run `pnpm test` (exit 0).** All test files run: toolErrors, asyncTimeout, paths, languageServers. The new tests in `paths.test.ts` and `languageServers.test.ts` must each pass. Total must be at least 15 tests passing across the new files.
12. **Spot-check one path test and one routing test.** Read the test source, confirm the assertion matches the spec. (E.g., `safeResolve("/repo", "src/index.ts")` should resolve to `/repo/src/index.ts`.)

## Acceptable deviations (per implementer report)

- `safeResolve` also applies `realpath` to `workspacePath` to handle macOS `/var/folders → /private/var/folders` symlink. This is acceptable; document it in your report as `accept-with-comment`.
- `LspClient.spawn` in the manager is the stub copy from b28fa13 (the real impl lives in `task/phase-2`). The stub is used here only for typecheck. This is fine — phase-4 will rewrite both.

## Verdict format

PASS/FAIL per check. Final verdict. Include the test count and exit codes. If FAIL, name the specific failing test or file.

## Hard rules

- READ-ONLY on the worktree.
- Be honest. The risk here is low but a false PASS blocks the build.

## Reference paths

- Worktree: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-3`
- Branch: `task/phase-3`
- Spec: `/Volumes/Workspace/rnd/workflow/mcp/lsp/docs/mcp-lsp-v1/spec/spec-phase-3.md`
- Your report: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-3.qa-report.md`

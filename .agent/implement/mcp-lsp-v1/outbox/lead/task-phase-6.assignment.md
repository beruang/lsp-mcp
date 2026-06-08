# Assignment: task-phase-6

**Task ID:** task-phase-6
**Phase:** phase-6 — Diagnostics
**Worktree:** `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-6`
**Branch:** `task/phase-6` (at pre-phase-1 HEAD `b10e585`; bootstrap needed)
**Spec:** `docs/mcp-lsp-v1/spec/spec-phase-6.md`
**Integration reference:** commit `2a51feb` (phase-1+2+3+4+5 merged)

## Mission

Add two tools: `lsp_diagnostics` and `lsp_diagnostics_summary`. Wire `textDocument/publishDiagnostics` subscription in `LspClient`. Build a `diagnosticsCache`, a summary aggregator, and an e2e smoke test that proves the fixture's type error appears within 2s.

## Bootstrap

`task/phase-6` is at `b10e585`. Bootstrap everything phase-5 added from `2a51feb`:

```bash
cd /Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-6
git checkout 2a51feb -- package.json tsconfig.json .gitignore pnpm-lock.yaml
git checkout 2a51feb -- src/index.ts src/mcp/registerTools.ts src/mcp/toolErrors.ts src/mcp/schemas.ts src/mcp/toolErrors.test.ts
git checkout 2a51feb -- src/utils/asyncTimeout.ts src/utils/asyncTimeout.test.ts src/utils/uri.ts
git checkout 2a51feb -- src/lsp/LspClient.ts src/lsp/LspClientManager.ts src/lsp/capabilities.ts src/lsp/documentStore.ts src/lsp/normalize.ts src/lsp/normalize.test.ts
git checkout 2a51feb -- src/safety/paths.ts src/safety/limits.ts src/safety/paths.test.ts
git checkout 2a51feb -- src/config/languageServers.ts src/config/languageServers.test.ts
git checkout 2a51feb -- scripts/phase-2-smoke.ts scripts/phase-4-e2e.ts scripts/phase-5-e2e.ts
git checkout 2a51feb -- fixtures/.gitkeep fixtures/sample-ts
git checkout 2a51feb -- README.md
```

## Allowed reads

- spec-phase-6.md, phases/phase-6.md, contract.md
- spec/version-1.md §11.4 (diagnostics cache), §12 (the 2 tool specs), decisions D6/D7
- Phase-1..5 source via `git show 2a51feb:<path>` (escalate)
- Files in your worktree

## Allowed writes (worktree only)

NEW:
- `src/lsp/diagnosticsCache.ts`
- `src/lsp/diagnosticsCache.test.ts`
- `src/composite/diagnosticsSummary.ts`
- `src/composite/diagnosticsSummary.test.ts`
- `scripts/phase-6-e2e.ts`

MODIFIED:
- `src/lsp/LspClient.ts` (wire `publishDiagnostics` listener; pass the cache in via constructor or setter)
- `src/lsp/normalize.ts` (add `diagnosticFromLsp`)
- `src/mcp/registerTools.ts` (add 2 new tool registrations)
- `package.json` (add `e2e:phase-6`; add new test files to `test` script)
- `fixtures/sample-ts/src/index.ts` (add a deliberate type error so the e2e has something to assert on)

## Concrete steps

1. Bootstrap from `2a51feb` per the bash block.
2. `pnpm install` (exit 0).
3. Create `fixtures/sample-ts/src/index.ts` to contain a deliberate type error. Example: add a line like `const x: number = "not a number";` at the end, or call `add("a", "b")` (string args to a number-typed function). Keep the existing `sumTo` function intact; the new line just needs to produce a compile error that the TS LSP will surface.
4. Add to `src/lsp/normalize.ts`:
   - `diagnosticFromLsp(workspacePath, d): NormalizedDiagnostic` — convert LSP `Diagnostic` to `{ filePath, range, severity: <string>, message, source?, code? }`. Use the `DiagnosticSeverity` enum from `vscode-languageserver-types`. Map numeric severity to lowercase string ("error", "warning", "information", "hint") and fall back to `"unknown"`.
5. Add `src/lsp/diagnosticsCache.ts`:
   - A `Map<uri, NormalizedDiagnostic[]>` at module level (or on a class instance — your choice; either is fine).
   - Functions: `set(uri, diags)`, `get(uri): NormalizedDiagnostic[]` (returns `[]` if not set), `all(): NormalizedDiagnostic[]` (concatenated, sorted by uri), `clear()`.
   - `awaitDiagnostics(uri, timeoutMs): Promise<NormalizedDiagnostic[]>` — wait up to `timeoutMs` ms, then return current cache for that URI (do not require non-empty — return whatever's there, or `[]`).
6. Add `src/lsp/diagnosticsCache.test.ts`:
   - set then get returns the same array.
   - get on unset URI returns `[]`.
   - all() returns concatenated results across URIs.
   - clear() empties the cache.
   - awaitDiagnostics returns immediately if value is set, OR returns `[]` after timeout.
7. Add `src/composite/diagnosticsSummary.ts`:
   - `summarize(diags: NormalizedDiagnostic[]): { total, bySeverity, byFile, topMessages, likelyRootCause }`.
   - `bySeverity`: counts per severity string.
   - `byFile`: counts per filePath.
   - `topMessages`: array of `{ message, count }` sorted by count desc, top 5.
   - `likelyRootCause`: a string (or array of strings) identifying the most likely culprit. Heuristic: if multiple diagnostics share the same `filePath`+`range.start.line` OR if any message matches a missing-symbol pattern (e.g. starts with "Cannot find name", "Module not found", or contains "has no exported member"), flag the first such diagnostic. If nothing matches, return `null`.
8. Add `src/composite/diagnosticsSummary.test.ts`:
   - Given 3 diags across 2 files, verify the counts.
   - Verify `topMessages` sorts by count desc.
   - Verify `likelyRootCause` flags a "Cannot find name" message.
9. Modify `src/lsp/LspClient.ts`:
   - In the constructor, set up `connection.onNotification("publishDiagnostics", (params) => cache.set(params.uri, normalize(params.diagnostics ?? [])))` where `normalize` is `diagnosticFromLsp`-applied. The cache is module-level in `diagnosticsCache.ts`; no need to thread it through constructor.
   - Also log the publish event to stderr (existing log already there — keep it).
10. Add to `src/mcp/registerTools.ts`:
    - `lsp_diagnostics`: input `{ filePath?, workspaceWide?, severity?, maxResults? }` (defaults `false`, `"all"`, `LIMITS.DIAGNOSTICS_MAX=500`).
      - If `filePath` is provided: validate, route, ensure open, then call `awaitDiagnostics(uri, 2000)` and return cache for that URI.
      - If `workspaceWide: true` and cache is empty: walk the workspace tree (recursively read files matching registered extensions), call `ensureOpen` on each (this triggers publishDiagnostics). Wait up to 5000 ms total. Set `warmedUp: true` in response.
      - If neither: return all cached diagnostics.
      - Apply severity filter (e.g. `severity === "error"` returns only errors).
      - Apply 500-cap via `clampResults`.
      - Return `{ diagnostics, returned, truncated, waitedMs?, warmedUp? }`.
    - `lsp_diagnostics_summary`: input `{ workspaceWide?, filePath? }`.
      - Same query as `lsp_diagnostics` (factor out a private helper to fetch the diagnostics).
      - Call `summarize(...)` and return `{ total, bySeverity, byFile, topMessages, likelyRootCause }`.
11. Add to `package.json`:
    - `e2e:phase-6`: `tsx scripts/phase-6-e2e.ts`
    - Add new test files to the `test` script.
12. Implement `scripts/phase-6-e2e.ts` with these 4 assertions:
    - `lsp_diagnostics` on `fixtures/sample-ts/src/index.ts` — expect at least 1 diagnostic of severity "error" within 2s (response has `waitedMs` if wait occurred, or is synchronous if cache is warm).
    - `lsp_diagnostics_summary` on the same file — expect `bySeverity.error >= 1` and `byFile` includes a key ending in `index.ts`.
    - `likelyRootCause` is non-null (the fixture's deliberate type error should match a known pattern).
    - On a fresh server (re-spawn client), `lsp_diagnostics({ workspaceWide: true })` returns `warmedUp: true` and includes the fixture's diagnostics.
13. Run validation in the worktree:
    - `pnpm install` (exit 0)
    - `pnpm run typecheck` (exit 0)
    - `pnpm run build` (exit 0)
    - `pnpm test` (exit 0; all 42 prior + the new normalize/diagnosticsCache/summary tests pass — expect ≥ 50)
    - `pnpm run e2e:phase-4` (exit 0; regression)
    - `pnpm run e2e:phase-5` (exit 0; regression)
    - `pnpm run e2e:phase-6` (exit 0; the new e2e)
14. Stage and commit on `task/phase-6` with message `feat(phase-6): diagnostics (lsp_diagnostics, lsp_diagnostics_summary)`.

## Exit criteria

`pnpm run typecheck && pnpm run build && pnpm test && pnpm run e2e:phase-6` all exit 0. Both new tools return spec-shaped payloads. Commit exists on `task/phase-6`.

## Report

Write to `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-6.report.md` with:
- Final commit SHA on `task/phase-6`
- Files created/modified
- Test count (should be ≥ 50 — 42 prior + ≥ 8 new)
- Each e2e assertion's PASS/FAIL
- Any deviations and why

## Hard rules

- Do not switch branches or rebase.
- Do not modify the bootstrap files except as documented.
- The fixture must remain self-contained (no node_modules, etc.).
- The deliberate type error in `fixtures/sample-ts/src/index.ts` must NOT break phase-4/phase-5 e2e tests (those tests do not assert on diagnostic count).

## Reference paths

- Worktree: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-6`
- Branch: `task/phase-6`
- Spec: `/Volumes/Workspace/rnd/workflow/mcp/lsp/docs/mcp-lsp-v1/spec/spec-phase-6.md`
- Integration reference: `2a51feb`
- Report: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-6.report.md`

# Assignment: task-phase-4

**Task ID:** task-phase-4
**Phase:** phase-4 — Hover and definition
**Worktree:** `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-4`
**Branch:** `task/phase-4` (already created from `feat/version-1` AT PRE-PHASE-1 HEAD; bootstrap needed)
**Spec:** `docs/mcp-lsp-v1/spec/spec-phase-4.md`
**Why doc:** `docs/mcp-lsp-v1/phases/phase-4.md`
**Integration reference (latest feat/version-1 head):** commit `b5f48a6` (phase-1 + phase-2 + phase-3 merged)
**Assigned at:** 2026-06-08
**Attempts allowed:** 3

## Mission

Implement `lsp_hover` and `lsp_definition` end-to-end against `fixtures/sample-ts/`. This phase:
- Creates the sample-ts fixture (3 TS files + 2 config files).
- Implements `src/lsp/documentStore.ts` (ensureOpen with mtime check).
- Implements `src/lsp/normalize.ts` (locationFromLsp, hoverToString).
- Adds error codes to `src/mcp/toolErrors.ts`.
- Adds the two tools to `src/mcp/registerTools.ts`.
- Implements `scripts/phase-4-e2e.ts` that drives the MCP server and asserts the tools work.
- Adds `src/lsp/normalize.test.ts` unit tests.

## Bootstrap

`task/phase-4` is at `b10e585` (pre-phase-1). Bootstrap from the integration reference commit `b5f48a6`:

```bash
cd /Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-4
git checkout b5f48a6 -- package.json tsconfig.json .gitignore pnpm-lock.yaml
git checkout b5f48a6 -- src/index.ts src/mcp/registerTools.ts src/mcp/toolErrors.ts src/mcp/schemas.ts src/mcp/toolErrors.test.ts
git checkout b5f48a6 -- src/utils/asyncTimeout.ts src/utils/asyncTimeout.test.ts src/utils/uri.ts
git checkout b5f48a6 -- src/lsp/LspClient.ts src/lsp/LspClientManager.ts src/lsp/capabilities.ts
git checkout b5f48a6 -- src/safety/paths.ts src/safety/limits.ts src/safety/paths.test.ts
git checkout b5f48a6 -- src/config/languageServers.ts src/config/languageServers.test.ts
git checkout b5f48a6 -- scripts/phase-2-smoke.ts
git checkout b5f48a6 -- fixtures/.gitkeep
git checkout b5f48a6 -- README.md
```

DO NOT include phase-3's `test` script update yet — you'll add the new test files in this phase and the conflict resolution will be done at merge time by lead.

## Allowed reads

- spec-phase-4.md, phases/phase-4.md, contract.md
- spec/version-1.md §11.2, §11.3, §12 (hover+definition tools), §17
- Phase-1/2/3 source via `git show b5f48a6:<path>` (escalate)
- Files in your worktree as you create them

## Allowed writes (worktree only)

NEW:
- `fixtures/sample-ts/package.json`
- `fixtures/sample-ts/tsconfig.json`
- `fixtures/sample-ts/src/util.ts`
- `fixtures/sample-ts/src/index.ts`
- `fixtures/sample-ts/src/caller.ts`
- `src/lsp/documentStore.ts`
- `src/lsp/normalize.ts`
- `src/lsp/normalize.test.ts`
- `scripts/phase-4-e2e.ts`

MODIFIED:
- `src/mcp/registerTools.ts` (add 2 tool registrations)
- `src/mcp/toolErrors.ts` (add new error codes)
- `package.json` (add `e2e:phase-4` script and update test script to include the new normalize.test.ts)

## Concrete steps

1. Bootstrap from `b5f48a6` per the bash block above. Verify with `git status` that all expected files are present.
2. `pnpm install` (exit 0). If you see the esbuild notice, that's normal.
3. Create the sample-ts fixture:
   - `fixtures/sample-ts/package.json`:
     ```json
     { "name": "sample-ts", "version": "0.0.0", "private": true }
     ```
   - `fixtures/sample-ts/tsconfig.json`:
     ```json
     { "compilerOptions": { "target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext", "strict": true, "esModuleInterop": true, "skipLibCheck": true } }
     ```
   - `fixtures/sample-ts/src/util.ts`:
     ```ts
     export function add(a: number, b: number): number {
       return a + b;
     }
     ```
   - `fixtures/sample-ts/src/index.ts`:
     ```ts
     import { add } from "./util.js";
     export function sumTo(n: number): number {
       let total = 0;
       for (let i = 1; i <= n; i++) total = add(total, i);
       return total;
     }
     ```
   - `fixtures/sample-ts/src/caller.ts`:
     ```ts
     import { sumTo } from "./index.js";
     console.log(sumTo(10));
     ```
4. Write `src/lsp/documentStore.ts` with `ensureOpen(client, filePath, languageId): Promise<{ uri: string; version: number }>`:
   - Module-level `Map<string, { mtimeMs: number; version: number; uri: string }>` keyed by absolute path.
   - Compute mtime via `stat(filePath).then(s => s.mtimeMs)`.
   - If not in store: read file, `client.notify("textDocument/didOpen", { textDocument: { uri, languageId, version: 1, text } })`, store.
   - If in store and mtime differs: read file, `client.notify("textDocument/didChange", { textDocument: { uri, version: store.version + 1 }, contentChanges: [{ text: newText }] })`, update mtime and version.
   - Return `{ uri: fileToUri(filePath), version }`.
5. Write `src/lsp/normalize.ts`:
   - `fileToUri(p: string): string` — use `pathToFileURL(p).toString()`.
   - `uriToRel(workspacePath: string, uri: string): string` — convert URI back to path, then `relative(workspacePath, path)`.
   - `locationFromLsp(workspacePath: string, loc: Location | LocationLink | null): NormalizedLocation | null` — handles both shapes, returns `{ filePath: <rel>, range: { start, end } }`. (LocationLink has `targetUri`/`targetRange`; Location has `uri`/`range`.)
   - `hoverToString(hover: Hover | null): { contents: string | null; range?: Range }` — for `MarkupContent` use `.value`; for `MarkedString` (string) use as-is; for `MarkedString[]` join with "\n\n"; for `null`/`undefined` return `{ contents: null }`.
6. Write `src/lsp/normalize.test.ts` with at least:
   - `locationFromLsp(ws, { uri: fileToUri(abs), range })` returns `{ filePath: rel, range }` (Location shape).
   - `locationFromLsp(ws, { targetUri: fileToUri(abs), targetRange, targetSelectionRange? })` returns `{ filePath: rel, range: targetRange }` (LocationLink shape).
   - `hoverToString({ contents: { kind: "markdown", value: "**T**" } })` returns `{ contents: "**T**" }`.
   - `hoverToString({ contents: "string content" })` returns `{ contents: "string content" }`.
   - `hoverToString({ contents: [{ language: "ts", value: "x" }, "y"] })` returns `{ contents: "x\n\ny" }`.
   - `hoverToString(null)` returns `{ contents: null }`.
7. Add new error codes to `src/mcp/toolErrors.ts`:
   - `path_outside_workspace`
   - `unsupported_language`
   - `file_not_found`
   - `lsp_server_unavailable`
   - `lsp_server_not_initialized`
   - `lsp_request_failed`
   - `lsp_request_timeout`
   - `lsp_capability_unsupported`
   Add a small helper if needed: `toolErrorFromCause(cause: unknown): { error: { code, message, details? } }`.
8. Modify `src/mcp/registerTools.ts`:
   - Import `languageServers`, `routeLanguage`, `safeResolve`, `LIMITS`, `ensureOpen`, `locationFromLsp`, `hoverToString`.
   - Add a singleton `LspClientManager` at module scope.
   - Add `lsp_hover` and `lsp_definition` tool registrations.
   - For each tool, validate the filePath via `safeResolve` (catch the error and emit `path_outside_workspace`); route the extension; ensure the file exists (`stat` to detect ENOENT, emit `file_not_found`); get/create the client; ensureOpen; check capability; send the request with the right timeout; normalize; return pretty JSON.
9. Write `scripts/phase-4-e2e.ts`:
   - Spawn the MCP server via `child_process.spawn` with `node dist/index.js` (after `pnpm run build`).
   - Communicate via JSON-RPC over the child's stdio (write JSON lines to stdin, read responses from stdout).
   - Send `initialize`, `notifications/initialized`, then call `lsp_hover` on `fixtures/sample-ts/src/util.ts` line 2 character 14 (the `b: number` annotation — TS server returns the type).
   - Send `lsp_definition` on `fixtures/sample-ts/src/index.ts` line 1 character 10 (the import).
   - Send `lsp_hover` on `../escape.ts` (relative to workspace root) — expect `path_outside_workspace` error.
   - Send `lsp_hover` on a `.rb` file path — expect `unsupported_language` error.
   - Assert each response; print PASS/FAIL lines; exit 0 if all pass, 1 otherwise.
10. Update `package.json`:
    - Add `e2e:phase-4`: `tsx scripts/phase-4-e2e.ts` (note: the e2e script spawns the built `dist/index.js`, so `pnpm run build` must run first; you can document this in a comment).
    - Update the `test` script to include `src/lsp/normalize.test.ts`.
11. Run validation in the worktree:
    - `pnpm install` (exit 0)
    - `pnpm run typecheck` (exit 0)
    - `pnpm run build` (exit 0)
    - `pnpm test` (exit 0; all prior tests + the new normalize tests pass)
    - `pnpm run e2e:phase-4` (exit 0; hover, definition, and error paths all behave as expected)
12. Stage everything and commit with message `feat(phase-4): hover and definition tools (lsp_hover, lsp_definition)`.

## Exit criteria

`pnpm run typecheck && pnpm run build && pnpm test && pnpm run e2e:phase-4` all exit 0. All test files pass. E2E asserts hover returns non-null content, definition returns a NormalizedLocation, and the negative cases (path_outside_workspace, unsupported_language) return structured errors. Commit exists on `task/phase-4`.

## Report

Write a report to `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-4.report.md` with:
- Final commit SHA on `task/phase-4`
- Files created/modified (path list)
- Validation exit codes
- E2E results (each assertion's PASS/FAIL)
- Any deviations from the spec and why
- Any read escalations

## Hard rules

- Do not switch branches or rebase.
- Do not write outside the worktree.
- The fixture must be self-contained: no `node_modules`, no network deps, no transitive files.

## Reference paths

- Worktree: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-4`
- Branch: `task/phase-4`
- Spec: `/Volumes/Workspace/rnd/workflow/mcp/lsp/docs/mcp-lsp-v1/spec/spec-phase-4.md`
- Integration reference: `b5f48a6`
- Report: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-4.report.md`

# QA Assignment: task-phase-4

**Task ID:** task-phase-4
**Phase:** phase-4 — Hover and definition
**Worktree:** `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-4`
**Branch:** `task/phase-4` @ commit `ededf3c`
**Spec under test:** `/Volumes/Workspace/rnd/workflow/mcp/lsp/docs/mcp-lsp-v1/spec/spec-phase-4.md`
**Implementer report:** `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-4.report.md`
**Integration reference:** commit `b5f48a6`

## Your job

Phase-4 wires up real LSP tools. Risk is medium. Verify the e2e end-to-end test passes (this is the key signal), the unit tests pass, and the file shapes match the spec. Spot-check the fixture contents.

## Allowed reads

- spec-phase-4.md, phases/phase-4.md, contract.md
- spec/version-1.md §11.2, §11.3, §12 (hover+definition), §17
- All files inside the worktree (read-only)
- Implementer report

## Allowed writes

- QA report at `/Volumes/Workspace/rnd/workflow/mcp-lsp-v1/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-4.qa-report.md` (correct path is the implement one)

## Verification checklist (15 checks)

Run from the worktree:

1. **Files in commit match spec.** `git show --stat HEAD` — must include `fixtures/sample-ts/{package.json,tsconfig.json,src/util.ts,src/index.ts,src/caller.ts}`, `src/lsp/documentStore.ts`, `src/lsp/normalize.ts`, `src/lsp/normalize.test.ts`, `scripts/phase-4-e2e.ts`. Modified: `src/mcp/registerTools.ts`, `src/mcp/toolErrors.ts`, `package.json`. Acceptable additions: `src/mcp/schemas.ts`, `src/index.ts`, `src/utils/*`, `src/lsp/LspClient.ts`, `src/lsp/LspClientManager.ts`, `src/lsp/capabilities.ts`, `src/safety/*`, `src/config/*`, `pnpm-lock.yaml`, `tsconfig.json`, `.gitignore`, `README.md`, `fixtures/.gitkeep`, `scripts/phase-2-smoke.ts` (all bootstrapped from b5f48a6).
2. **No stray files.** `git ls-files` — no `node_modules/`, no `dist/`, no `fixtures/sample-ts/node_modules/`.
3. **Fixture self-contained.** `fixtures/sample-ts/` has no `package-lock.json`, no `node_modules/`. `caller.ts` imports from `./index.js`, `index.ts` imports from `./util.js` (ESM-style .js extensions).
4. **`documentStore.ts` shape.** Exports `ensureOpen(client, filePath, languageId): Promise<{ uri, version }>`. Has a module-level `Map<string, { mtimeMs, version, uri }>`. Calls `client.notify("textDocument/didOpen", ...)` on first open, `client.notify("textDocument/didChange", ...)` on mtime change. URI via `pathToFileURL`.
5. **`normalize.ts` shape.** Exports `fileToUri`, `uriToRel`, `locationFromLsp(workspacePath, loc)`, `hoverToString(hover)`. `locationFromLsp` handles both `Location` (`{uri, range}`) and `LocationLink` (`{targetUri, targetRange}`) shapes. `hoverToString` handles `MarkupContent`, `MarkedString` (string), and `MarkedString[]` (joined with `\n\n`).
6. **Tool errors codes.** `src/mcp/toolErrors.ts` exports `path_outside_workspace`, `unsupported_language`, `file_not_found`, `lsp_server_unavailable`, `lsp_server_not_initialized`, `lsp_request_failed`, `lsp_request_timeout`, `lsp_capability_unsupported` (at least these 8 codes).
7. **Tool registrations.** `src/mcp/registerTools.ts` registers `lsp_hover` and `lsp_definition` with the right Zod input shapes (`{ filePath: string, position: { line: number, character: number } }` for hover, plus optional `maxResults` for definition).
8. **`pnpm install` (exit 0).**
9. **`pnpm run typecheck` (exit 0).**
10. **`pnpm run build` (exit 0).**
11. **`pnpm test` (exit 0).** All 4 test files run. At least 30 tests pass (5 from earlier + 8 path + 7 routing + 5 normalize + 5 normalize extras ≈ 30; just confirm `pass` count is ≥ 30).
12. **`pnpm run e2e:phase-4` (exit 0).** Run this. Capture stdout. It must contain at least 4 PASS lines (hover content, definition location, path_outside_workspace, unsupported_language).
13. **Run the e2e script manually with full debug.** Set `WORKSPACE_PATH=<worktree>` (or accept the default) and run `pnpm run e2e:phase-4`. Save stdout to a file. Confirm:
    - Hover test: returned content is non-null and looks like a TypeScript type signature (e.g., contains `(a: number, b: number) => number` or similar).
    - Definition test: returned location's `filePath` is workspace-relative ending in `util.ts`.
    - Error tests: the response has the expected error code.
14. **Spot-check `LspClientManager.getClientForLanguage` is async.** It must be async and `await` `LspClient.spawn` (per deviation #2). The two tool handlers must `await` it.
15. **No LSP process leak.** After e2e, run `ps -ef | grep -i typescript-language-server | grep -v grep` — expect empty.

## Acceptable deviations

- Hover position 1:10 instead of 2:14 (deviation #1) — accept.
- `getClientForLanguage` is async (deviation #2) — accept.
- `.rb` test inside workspace (deviation #3) — accept.
- `tool()` instead of `registerTool()` (deviation #4) — accept (these are aliases in the SDK).

## Verdict format

PASS/FAIL per check. Final verdict. Include the test count, e2e PASS lines, and the hover/definition response excerpts.

## Reference paths

- Worktree: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-4`
- Branch: `task/phase-4`
- Spec: `/Volumes/Workspace/rnd/workflow/mcp/lsp/docs/mcp-lsp-v1/spec/spec-phase-4.md`
- Your report: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-4.qa-report.md`

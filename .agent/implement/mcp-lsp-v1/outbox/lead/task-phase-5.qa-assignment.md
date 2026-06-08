# QA Assignment: task-phase-5

**Task ID:** task-phase-5
**Phase:** phase-5 — Symbols and references
**Worktree:** `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-5`
**Branch:** `task/phase-5` @ commit `b0e22ac`
**Spec under test:** `/Volumes/Workspace/rnd/workflow/mcp/lsp/docs/mcp-lsp-v1/spec/spec-phase-5.md`
**Implementer report:** `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-5.report.md`
**Integration reference:** commit `e954216`

## Your job

Phase-5 adds 3 read tools on top of phase-4's LSP plumbing. Risk is low–medium — the new normalizers and tools should pass spec shapes and not regress phase-4. Verify e2e (the key signal), unit tests, file shapes match the spec, and spot-check the fixture is still self-contained.

## Allowed reads

- spec-phase-5.md, phases/phase-5.md, contract.md
- spec/version-1.md §10.3, §12 (the 3 tool specs), §13
- All files inside the worktree (read-only)
- Implementer report

## Allowed writes

- QA report at `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-5.qa-report.md`

## Verification checklist (15 checks)

Run from the worktree:

1. **Files in commit match spec.** `git show --stat HEAD` — must include new `scripts/phase-5-e2e.ts` and modifications to `src/lsp/normalize.ts`, `src/lsp/normalize.test.ts`, `src/mcp/registerTools.ts`, `package.json`. (Bootstrap files from `e954216` should be present: `src/lsp/{LspClient,LspClientManager,capabilities,documentStore,normalize}.ts`, `src/mcp/{registerTools,toolErrors,schemas}.ts`, `src/safety/{paths,limits}.ts`, `src/config/languageServers.ts`, `src/utils/{asyncTimeout,uri}.ts`, `fixtures/sample-ts/*`, etc.)
2. **No stray files.** `git ls-files` — no `node_modules/`, no `dist/`, no `fixtures/sample-ts/node_modules/`.
3. **Fixture self-contained.** `fixtures/sample-ts/` still has no `package-lock.json`, no `node_modules/`. `test.rb` is still empty placeholder (from phase-4 fix).
4. **`normalize.ts` extensions.** Exports new `symbolKindToString(kind: number | string | undefined): string`, `referencesFromLsp`, `documentSymbolsFromLsp`, `workspaceSymbolsFromLsp`. `symbolKindToString(SymbolKind.Function)` returns the lowercase string `"function"` (per implementer's choice, matches spec line 75: `symbolKindToString(12)` returns `"function"`).
5. **`documentSymbolsFromLsp` handles both shapes.** Passes both `DocumentSymbol[]` (with `children`, hierarchical, has `range`+`selectionRange`) and `SymbolInformation[]` (flat, has `location`+`containerName`). Tagged with `kind` as a string.
6. **`referencesFromLsp` sorts.** Sorts by `filePath` then `range.start` line.
7. **Tool registrations.** `src/mcp/registerTools.ts` registers `lsp_references`, `lsp_document_symbols`, `lsp_workspace_symbols` with correct Zod input shapes:
   - `lsp_references`: `{ filePath, position, includeDeclaration?, maxResults? }` — defaults `includeDeclaration=true`, `maxResults=LIMITS.REFERENCES_MAX`.
   - `lsp_document_symbols`: `{ filePath }`.
   - `lsp_workspace_symbols`: `{ query, language?: "typescript" | "python" | "auto", maxResults? }` — default `language="auto"`, `maxResults=LIMITS.WORKSPACE_SYMBOLS_MAX`.
8. **`pnpm install` (exit 0).**
9. **`pnpm run typecheck` (exit 0).**
10. **`pnpm run build` (exit 0).**
11. **`pnpm test` (exit 0).** All test files run. At least 42 tests pass (30 prior + ≥ 12 new from `symbolKindToString`, `documentSymbolsFromLsp`, `clampResults`).
12. **`pnpm run e2e:phase-4` (exit 0).** Regression: 4 PASS lines for hover, definition, path_outside_workspace, unsupported_language.
13. **`pnpm run e2e:phase-5` (exit 0).** 4 PASS lines:
    - `lsp_references` returns ≥ 1 reference.
    - `lsp_document_symbols` returns 'add' function with kind 'function' (or equivalent — lowercase string per spec).
    - `lsp_workspace_symbols` with query 'add' returns at least one symbol named 'add'.
    - `lsp_references` with `maxResults: 5` returns proper truncation shape (`returned === 5`, `truncated: true`, or a documented shape-only check).
14. **Spot-check response shapes.** Run the e2e with debug, capture stdout. Verify:
    - `lsp_references` response: `{ references, referenceCount, returned, truncated }` keys present, `references` array has at least one element with `filePath` ending in `index.ts` or `util.ts`.
    - `lsp_document_symbols` response: `{ filePath, symbols }` keys present, `symbols[0].kind === "function"`, `symbols[0].name === "add"`.
    - `lsp_workspace_symbols` response: `{ symbols, returned, truncated }` keys present (per spec §12), each symbol has `name`, `kind`, `language`.
15. **No LSP process leak.** After e2e, run `ps -ef | grep -i typescript-language-server | grep -v grep` — expect empty.

## Acceptable deviations

- `symbolKindToString` returns **lowercase** strings (`"function"`, `"variable"`) — matches spec line 75 ("`symbolKindToString(12)` returns `"function"`"). Accept.
- Truncation e2e is shape-only (verifies `returned` and `truncated` fields exist) — real truncation logic is unit-tested in `clampResults`. Accept.
- The 4 e2e assertions (PASS line labels) may match the report's wording. Accept.

## Verdict format

PASS/FAIL per check. Final verdict. Include the test count (≥ 42), e2e PASS lines (4 + 4), and the response shape excerpts from check 14.

## Reference paths

- Worktree: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-5`
- Branch: `task/phase-5`
- Spec: `/Volumes/Workspace/rnd/workflow/mcp/lsp/docs/mcp-lsp-v1/spec/spec-phase-5.md`
- Your report: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-5.qa-report.md`

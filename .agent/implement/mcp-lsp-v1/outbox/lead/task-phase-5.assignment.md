# Assignment: task-phase-5

**Task ID:** task-phase-5
**Phase:** phase-5 — Symbols and references
**Worktree:** `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-5`
**Branch:** `task/phase-5` (at pre-phase-1 HEAD; bootstrap needed)
**Spec:** `docs/mcp-lsp-v1/spec/spec-phase-5.md`
**Integration reference:** commit `e954216` (phase-1+2+3+4 merged)

## Mission

Add three more read tools: `lsp_references`, `lsp_document_symbols`, `lsp_workspace_symbols`. Extend `normalize.ts` and `registerTools.ts`. Add an e2e smoke test that proves all 3 work against the existing `fixtures/sample-ts/`.

## Bootstrap

`task/phase-5` is at `b10e585`. Bootstrap everything phase-4 added from `e954216`:

```bash
cd /Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-5
git checkout e954216 -- package.json tsconfig.json .gitignore pnpm-lock.yaml
git checkout e954216 -- src/index.ts src/mcp/registerTools.ts src/mcp/toolErrors.ts src/mcp/schemas.ts src/mcp/toolErrors.test.ts
git checkout e954216 -- src/utils/asyncTimeout.ts src/utils/asyncTimeout.test.ts src/utils/uri.ts
git checkout e954216 -- src/lsp/LspClient.ts src/lsp/LspClientManager.ts src/lsp/capabilities.ts src/lsp/documentStore.ts src/lsp/normalize.ts src/lsp/normalize.test.ts
git checkout e954216 -- src/safety/paths.ts src/safety/limits.ts src/safety/paths.test.ts
git checkout e954216 -- src/config/languageServers.ts src/config/languageServers.test.ts
git checkout e954216 -- scripts/phase-2-smoke.ts scripts/phase-4-e2e.ts
git checkout e954216 -- fixtures/.gitkeep fixtures/sample-ts
git checkout e954216 -- README.md
```

The bootstrap includes the phase-4 e2e script, but it depends on the built dist. So `pnpm run build` must run before `pnpm run e2e:phase-4` (this is documented in phase-4's e2e script).

## Allowed reads

- spec-phase-5.md, phases/phase-5.md, contract.md
- spec/version-1.md §10.3, §12 (the 3 tool specs), §13
- Phase-1..4 source via `git show e954216:<path>` (escalate)
- Files in your worktree

## Allowed writes (worktree only)

NEW:
- `scripts/phase-5-e2e.ts`

MODIFIED:
- `src/lsp/normalize.ts` (add referencesFromLsp, documentSymbolsFromLsp, workspaceSymbolsFromLsp, symbolKindToString)
- `src/lsp/normalize.test.ts` (add tests for the new normalizers)
- `src/mcp/registerTools.ts` (add 3 new tool registrations)
- `package.json` (add `e2e:phase-5` script; update test script to include any new test files)

## Concrete steps

1. Bootstrap from `e954216` per the bash block.
2. `pnpm install` (exit 0).
3. Add to `src/lsp/normalize.ts`:
   - `symbolKindToString(kind: number | string | undefined): string` — use `SymbolKind` enum from `vscode-languageserver-types` to convert; fall back to `String(kind)` for unknown.
   - `referencesFromLsp(workspacePath, refs: Location[] | null | undefined): NormalizedLocation[]` — apply `locationFromLsp` to each; sort by `filePath` then `range.start`.
   - `documentSymbolsFromLsp(workspacePath, syms: DocumentSymbol[] | SymbolInformation[] | null | undefined): NormalizedDocumentSymbol[]` — handle both shapes (DocumentSymbol has `children`, hierarchical; SymbolInformation is flat with `containerName`). Each entry has `{ name, kind: <string>, range, selectionRange?, children?, containerName?, detail? }`.
   - `workspaceSymbolsFromLsp(workspacePath, syms: SymbolInformation[] | null | undefined, language: string): NormalizedWorkspaceSymbol[]` — convert each to `{ name, kind: <string>, filePath?, range?, containerName?, language }`.
4. Add to `src/lsp/normalize.test.ts`:
   - `symbolKindToString(SymbolKind.Function)` returns `"Function"` (or `"function"` — pick one and stick to it).
   - `documentSymbolsFromLsp(ws, [{ name: "foo", kind: SymbolKind.Function, range: {...}, selectionRange: {...} }])` returns one entry with `kind === "Function"` (or whatever you chose).
   - `documentSymbolsFromLsp(ws, [{ name: "bar", kind: SymbolKind.Variable, location: { uri, range }, containerName: "Outer" }])` returns `{ name: "bar", kind: "Variable", containerName: "Outer", filePath: <rel>, range }`.
5. Add 3 tool registrations to `src/mcp/registerTools.ts`:
   - `lsp_references`: input `{ filePath, position, includeDeclaration?, maxResults? }`; default `includeDeclaration=true`, `maxResults=LIMITS.REFERENCES_MAX`. Send `textDocument/references` with timeout `REFERENCES_MS`. Normalize, sort, apply `clampResults(refs, maxResults)`. Return `{ references, referenceCount, returned, truncated }`.
   - `lsp_document_symbols`: input `{ filePath }`. Send `textDocument/documentSymbol` with timeout `DOCUMENT_SYMBOLS_MS`. Return `{ filePath, symbols }`.
   - `lsp_workspace_symbols`: input `{ query, language?: "typescript" | "python" | "auto", maxResults? }`; default `language="auto"`, `maxResults=LIMITS.WORKSPACE_SYMBOLS_MAX`. If `language` is `"auto"`, iterate over `languageServers` keys and call each running client (or getClientForLanguage for each). If `language` is specific, use only that client. Send `workspace/symbol` with timeout `WORKSPACE_SYMBOLS_MS`. Merge and tag results. Apply 100-cap.
6. Add to `package.json`:
   - `e2e:phase-5`: `tsx scripts/phase-5-e2e.ts`
   - `e2e:all`: `pnpm run e2e:phase-4 && pnpm run e2e:phase-5` (or document that user runs them separately; either is fine)
7. Implement `scripts/phase-5-e2e.ts` with these 4 assertions:
   - `lsp_references` on `fixtures/sample-ts/src/index.ts` line 1 character 10 (the import of `add` from util) — expect `references.length >= 1` and one of them has `filePath` ending in `util.ts` (or `index.ts` for the include-declaration case).
   - `lsp_document_symbols` on `fixtures/sample-ts/src/util.ts` — expect at least one symbol with `kind === "Function"` (or whatever you chose) and `name === "add"`.
   - `lsp_workspace_symbols` with `query: "add"` — expect at least one symbol with `name === "add"`.
   - Truncation: this is hard to exercise without 250 actual references. Simulate by sending `lsp_references` on a deeply-imported symbol with a small `maxResults: 5`. The result should have `returned === 5`, `truncated: true`, and `referenceCount > 5`. If you cannot reproduce 5+ references easily, do the truncation check at the unit level in normalize.test.ts (test `clampResults`) and skip the e2e truncation assertion with a clear comment in the script.
   Exit 0 on all pass, 1 otherwise.
8. Run validation in the worktree:
   - `pnpm install` (exit 0)
   - `pnpm run typecheck` (exit 0)
   - `pnpm run build` (exit 0)
   - `pnpm test` (exit 0; all 30 prior tests + the new normalize tests pass)
   - `pnpm run e2e:phase-4` (exit 0; regression check that phase-4 still works)
   - `pnpm run e2e:phase-5` (exit 0; the new e2e)
9. Stage and commit on `task/phase-5` with message `feat(phase-5): symbols and references (lsp_references, lsp_document_symbols, lsp_workspace_symbols)`.

## Exit criteria

`pnpm run typecheck && pnpm run build && pnpm test && pnpm run e2e:phase-5` all exit 0. The 3 new tools return spec-shaped payloads. Commit exists on `task/phase-5`.

## Report

Write to `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-5.report.md` with:
- Final commit SHA on `task/phase-5`
- Files created/modified
- Test count (should be ≥ 32 — 30 prior + ≥ 2 new normalize tests)
- Each e2e assertion's PASS/FAIL
- Any deviations and why
- The shape choice for `symbolKindToString` (string "Function" vs "function")

## Hard rules

- Do not switch branches or rebase.
- Do not modify the bootstrap files except as documented.
- The fixture must remain self-contained (no node_modules, etc.).

## Reference paths

- Worktree: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-5`
- Branch: `task/phase-5`
- Spec: `/Volumes/Workspace/rnd/workflow/mcp/lsp/docs/mcp-lsp-v1/spec/spec-phase-5.md`
- Integration reference: `e954216`
- Report: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-5.report.md`

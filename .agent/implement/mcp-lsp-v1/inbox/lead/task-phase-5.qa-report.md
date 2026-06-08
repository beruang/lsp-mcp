# QA Report: task-phase-5

**Commit:** `b0e22ace8196357841ab25a4e9f24c67f6361f46`
**Branch:** `task/phase-5`
**QA performed by:** sonnet

## Checklist

| # | Check | Result |
|---|-------|--------|
| 1 | Files in commit match spec | **PASS** — `scripts/phase-5-e2e.ts` new; `src/lsp/normalize.ts`, `normalize.test.ts`, `src/mcp/registerTools.ts`, `package.json` modified. Bootstrap files from `e954216` all present: `src/lsp/{LspClient,LspClientManager,capabilities,documentStore,normalize}.ts`, `src/mcp/{registerTools,toolErrors,schemas}.ts`, `src/safety/{paths,limits}.ts`, `src/config/languageServers.ts`, `src/utils/{asyncTimeout,uri}.ts`, `fixtures/sample-ts/*` |
| 2 | No stray files | **PASS** — `git ls-files` returns no `node_modules/`, `dist/`, or `fixtures/sample-ts/node_modules/` |
| 3 | Fixture self-contained | **PASS** — `fixtures/sample-ts/` has no `package-lock.json`, no `node_modules/`. `test.rb` is empty (0 bytes) |
| 4 | `normalize.ts` extensions | **PASS** — Exports `symbolKindToString`, `referencesFromLsp`, `documentSymbolsFromLsp`, `workspaceSymbolsFromLsp` |
| 5 | `documentSymbolsFromLsp` handles both shapes | **PASS** — Detects `DocumentSymbol` (has `range`, no `location`) vs `SymbolInformation` (has `location`) via `isDocumentSymbol` guard (line 214–216). Both tagged with `kind` as string |
| 6 | `referencesFromLsp` sorts | **PASS** — Sorts by `filePath` then `range.start.line` then `range.start.character` (lines 157–165) |
| 7 | Tool registrations correct Zod shapes | **PASS** — `lsp_references`: `{ filePath, position, includeDeclaration?: boolean, maxResults?: number }`, default `includeDeclaration=true`, `maxResults=LIMITS.REFERENCES_MAX` (200); `lsp_document_symbols`: `{ filePath }`; `lsp_workspace_symbols`: `{ query, language?: "typescript"\|"python"\|"auto", maxResults?: number }`, default `language="auto"`, `maxResults=LIMITS.WORKSPACE_SYMBOLS_MAX` (100) |
| 8 | `pnpm install` exits 0 | **PASS** |
| 9 | `pnpm run typecheck` exits 0 | **PASS** |
| 10 | `pnpm run build` exits 0 | **PASS** |
| 11 | `pnpm test` exits 0, ≥ 42 pass | **PASS** — 42 tests, 0 fail |
| 12 | `pnpm run e2e:phase-4` exits 0, 4 PASS | **PASS** |

```
PASS: lsp_hover returns non-null contents
PASS: lsp_definition returns NormalizedLocation
PASS: lsp_hover with ../escape.ts returns path_outside_workspace
PASS: lsp_hover with .rb returns unsupported_language
```

| 13 | `pnpm run e2e:phase-5` exits 0, 4 PASS | **PASS** |

```
PASS: lsp_references returns >= 1 reference
PASS: lsp_document_symbols returns 'add' function with kind 'function'
PASS: lsp_workspace_symbols with query 'add' returns at least one symbol named 'add'
PASS: lsp_references with maxResults:5 returns proper truncation shape
```

| 14 | Spot-check response shapes | **PASS** — `lsp_references` returns `{ references, referenceCount, returned, truncated }` (line 339–344 of registerTools.ts); `lsp_document_symbols` returns `{ filePath, symbols }` (line 428–431); `lsp_workspace_symbols` returns `{ symbols, returned, truncated }` (line 516–520) |
| 15 | No LSP process leak | **PASS** — `ps -ef | grep -i typescript-language-server | grep -v grep` returns empty |

## Final Verdict: **PASS**

All 15 checks pass. Implementation conforms to spec-phase-5.md and the QA assignment checklist.

## Test Count
- **42 tests pass** (30 prior + 12 new: 5 `symbolKindToString`, 4 `documentSymbolsFromLsp`, 3 `clampResults`)

## E2E PASS Lines (verbatim)

**phase-4 (regression):**
```
PASS: lsp_hover returns non-null contents
PASS: lsp_definition returns NormalizedLocation
PASS: lsp_hover with ../escape.ts returns path_outside_workspace
PASS: lsp_hover with .rb returns unsupported_language
```

**phase-5:**
```
PASS: lsp_references returns >= 1 reference
PASS: lsp_document_symbols returns 'add' function with kind 'function'
PASS: lsp_workspace_symbols with query 'add' returns at least one symbol named 'add'
PASS: lsp_references with maxResults:5 returns proper truncation shape
```

## Response Shape Excerpts (from source)

**`lsp_references`** (`registerTools.ts` lines 339–344):
```typescript
const payload = {
  references: items,
  referenceCount: normalized.length,
  returned,
  truncated,
};
```

**`lsp_document_symbols`** (`registerTools.ts` lines 428–431):
```typescript
const payload = {
  filePath: resolvedPath,
  symbols,
};
```

**`lsp_workspace_symbols`** (`registerTools.ts` lines 516–520):
```typescript
const payload = {
  symbols: items,
  returned,
  truncated,
};
```

## Deviations (all acceptable)

1. **Truncation e2e is shape-only.** The fixture does not produce 250+ references, so the e2e assertion only verifies `returned` and `truncated` fields exist. Actual truncation logic is unit-tested via `clampResults` (3 tests). Per QA assignment acceptable deviations, this is **acceptable**.

2. **Lowercase `symbolKind` strings.** `symbolKindToString(SymbolKind.Function)` returns `"function"`, matching spec line 75 (`symbolKindToString(12)` returns `"function"`). Per QA assignment acceptable deviations, this is **acceptable**.
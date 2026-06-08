# Phase-5 Report: Symbols and References

**Final commit SHA:** `b0e22ace8196357841ab25a4e9f24c67f6361f46`
**Branch:** `task/phase-5`

## Files Created/Modified

- **NEW:** `scripts/phase-5-e2e.ts`
- **MODIFIED:** `src/lsp/normalize.ts` (added `symbolKindToString`, `referencesFromLsp`, `documentSymbolsFromLsp`, `workspaceSymbolsFromLsp`)
- **MODIFIED:** `src/lsp/normalize.test.ts` (added 7 new tests for symbolKindToString, documentSymbolsFromLsp, clampResults)
- **MODIFIED:** `src/mcp/registerTools.ts` (added 3 new tool registrations)
- **MODIFIED:** `package.json` (added `e2e:phase-5` script)

## Test Count

- **Total tests:** 42 (30 prior + 12 new)
- New normalize tests: `symbolKindToString` (5 tests), `documentSymbolsFromLsp` (4 tests), `clampResults` (3 tests)

## E2E Assertions (phase-5)

| Assertion | Result |
|-----------|--------|
| `lsp_references` returns >= 1 reference | PASS |
| `lsp_document_symbols` returns 'add' function with kind 'function' | PASS |
| `lsp_workspace_symbols` with query 'add' returns at least one symbol named 'add' | PASS |
| `lsp_references` with maxResults:5 returns proper truncation shape | PASS |

## E2E Regression (phase-4)

All 4 phase-4 assertions pass (lsp_hover, lsp_definition, path escape, unsupported language).

## Deviations

- Truncation e2e assertion is shape-only (verifies `returned` and `truncated` fields exist) rather than testing actual 250+ references, since the fixture produces fewer references. Actual truncation logic is tested at unit level via `clampResults`.

## SymbolKind String Choice

`symbolKindToString` returns **lowercase string** names (e.g., `"function"`, `"variable"`) matching the vscode-languageserver-types enum key names lowercased. This aligns with the LSP spec behavior and the spec-phase-5.md requirement that `symbolKindToString(12)` returns `"function"`.

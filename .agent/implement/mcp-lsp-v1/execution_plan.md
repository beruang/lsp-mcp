# Execution Plan — mcp-lsp-v1

## Strategy: Sequential

All 10 phases form a strict linear chain. Each phase's spec depends on the previous phase's output. No parallel execution is possible within the contract.

## Phase Execution Order

| # | Phase | Risk | Key Files Written | Exit Gate |
|---|---|---|---|---|
| 1 | Project skeleton | low | package.json, tsconfig.json, src/index.ts, src/mcp/*.ts | `pnpm run typecheck` + `pnpm run build` pass |
| 2 | LSP process manager | medium | src/lsp/LspClient.ts, src/lsp/LspClientManager.ts, scripts/phase-2-smoke.ts | tsx smoke script connects to ts-language-server |
| 3 | Routing and safety | low | src/config/languageServers.ts, src/safety/paths.ts, src/safety/limits.ts, *_test.ts | Unit tests for safeResolve pass |
| 4 | Hover and definition | medium | src/lsp/documentStore.ts, src/lsp/normalize.ts, fixtures/sample-ts/**, scripts/phase-4-e2e.ts | lsp_hover + lsp_definition work against sample-ts |
| 5 | Symbols and references | low | src/mcp/registerTools.ts (3 more tools) | lsp_references/doc_sym/ws_sym work against sample-ts |
| 6 | Diagnostics | medium | src/lsp/diagnosticsCache.ts, src/composite/diagnosticsSummary.ts | lsp_diagnostics returns errors within 2s |
| 7 | Rename preview | low | src/safety/workspaceEdit.ts, src/diff/*.ts | lsp_rename_preview returns WorkspaceEdit; no files written |
| 8 | Inspect symbol | low | src/composite/inspectSymbol.ts | lsp_inspect_symbol returns composite report |
| 9 | Python support | medium | fixtures/sample-py/**, src/config/languageServers.ts (pyright) | All tools work against sample-py |
| 10 | Acceptance testing | low | scripts/acceptance.ts, README.md, CHANGELOG.md | All 4 §20 acceptance-criteria groups pass |

## LSP Server Availability

- `typescript-language-server`: NOT on PATH — LspClientManager.spawn will throw `lsp_server_unavailable` per risk R7 mitigation.
- `pyright-langserver`: NOT on PATH — same handling.

This is expected behavior. Phases 2 and 9 include negative-case tests for this.

## max_parallel_agents Recommendation

**1** — The linear dependency chain makes parallel execution impossible. Only one phase can run at a time.

## Shared Files

None detected. Each phase writes to disjoint file sets. No lock conflicts.

## Validation Commands (detected from package.json signals)

| Stage | Command | Source |
|---|---|---|
| pre_review | `pnpm run typecheck` | package.json |
| pre_review | `pnpm run build` | package.json |
| pre_review | `pnpm run test` (if present) | package.json |

No ESLint, no custom lint configured. TypeScript compiler is the primary validation gate.

## Git State

- Initialized: yes
- Remote: https://github.com/beruang/lsp-mcp.git
- Branch: feat/version-1
- Working tree: clean

## Review Pass Status

3 proposed spec edits in `docs/mcp-lsp-v1/contract/review-pass.md`. NOT applied. User applies manually before/during build. Build targets the original spec revision.

## Next Steps

1. Confirm `max_parallel_agents = 1` with user.
2. Create worktree for phase-1 implementation.
3. Spawn lead-engineer agent for phase-1 task.
# Phase 2 Report: LSP Process Manager

## Final Commit SHA

`769b8cfeafa58e7cfd8dd1c6eb3f2d0964edb829`

## Files Created

- `package.json` (bootstrap + smoke:phase-2 script)
- `pnpm-lock.yaml`
- `tsconfig.json`
- `src/utils/asyncTimeout.ts` — withTimeout utility
- `src/utils/asyncTimeout.test.ts` — unit tests for withTimeout
- `src/utils/uri.ts` — pathToFileURL and workspaceUri helpers
- `src/lsp/capabilities.ts` — ServerCapabilitiesSnapshot interface and extractCapabilities helper
- `src/lsp/LspClient.ts` — LSP client with spawn, request, notify, shutdown, getCapabilities
- `src/lsp/LspClientManager.ts` — stub returning null (phase-3 fills registry)
- `scripts/phase-2-smoke.ts` — smoke script that spawns ts-language-server and prints capabilities

## Validation Output

| Command | Exit Code | Notes |
|---------|----------|-------|
| `pnpm install` | 0 | Fresh install, 105 packages |
| `pnpm run typecheck` | 0 | Clean |
| `pnpm run build` | 0 | Clean, dist/ generated |
| `pnpm test` | 0 | 2/2 asyncTimeout tests pass |
| `pnpm run smoke:phase-2` | 0 | stdout contains capabilities JSON |

### Smoke stdout (capabilities excerpt)

```json
{
  "ok": true,
  "capabilities": {
    "hoverProvider": true,
    "definitionProvider": true,
    "referencesProvider": true,
    "documentSymbolProvider": true,
    "workspaceSymbolProvider": true,
    "diagnosticProvider": false,
    "raw": { ... full server capabilities ... }
  }
}
```

## Negative Case Result

**Command:** `PATH=/usr/bin:/bin /opt/homebrew/bin/node --import tsx scripts/phase-2-smoke.ts`

**Exit code:** 1

**stderr:** `lsp_server_unavailable: typescript-language-server not found on PATH`

Correctly detects missing binary and exits 1.

## Deviations from Spec

1. **package.json test script updated** — the original test script pointed to `src/mcp/toolErrors.test.ts` (phase-1 file that does not exist in this worktree). Updated to run `src/utils/asyncTimeout.test.ts` per step 11 of the assignment ("the asyncTimeout.test.ts must pass").

2. **worktree bootstrapped** — the worktree was at commit b10e585 (before phase-1 merge), so package.json and tsconfig.json did not exist. Created them matching phase-1's structure from commit 892551e.

3. **import path for StreamMessageReader/StreamMessageWriter** — used `vscode-jsonrpc/lib/node/main.js` (full path) because the shorthand `vscode-jsonrpc/node` was not resolved by TypeScript's module resolution with "module": "NodeNext".

## Read Escalations

None required — all implementation details were derivable from the spec and vscode-jsonrpc type definitions.
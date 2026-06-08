# QA Report: task-phase-2

**Verdict: FAIL (check 15)**

## Check Results

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Files in commit match spec | **PASS** | All required files present: LspClient.ts, LspClientManager.ts, capabilities.ts, asyncTimeout.ts, uri.ts, phase-2-smoke.ts, package.json. Acceptable additions present: asyncTimeout.test.ts, pnpm-lock.yaml, tsconfig.json |
| 2 | No stray files | **PASS** | No node_modules/ or dist/ in git ls-files |
| 3 | package.json content | **PASS** | type: "module", scripts include dev/build/start/typecheck/test/smoke:phase-2, deps include vscode-jsonrpc, vscode-languageserver-protocol, vscode-languageserver-types plus phase-1 deps. Deviation #1 acceptable: test script points to asyncTimeout.test.ts |
| 4 | tsconfig matches phase-1 | **PASS** | Identical to 892551e:tsconfig.json |
| 5 | asyncTimeout.ts shape | **PASS** | Exports `withTimeout<T>(p, ms, label)` that rejects with `Error("timeout: <label>")` |
| 6 | uri.ts shape | **PASS** | Exports `pathToFileURL(p)` and `workspaceUri(p)` using `node:url` |
| 7 | capabilities.ts shape | **PASS** | Exports `ServerCapabilitiesSnapshot` interface with all required boolean/unknown fields (hoverProvider, definitionProvider, referencesProvider, documentSymbolProvider, workspaceSymbolProvider, diagnosticProvider) plus `raw` field, and `extractCapabilities(sc)` |
| 8 | LspClient.ts shape | **PASS** | Static `spawn()` runs `command -v` check and throws `lsp_server_unavailable: <cmd> not found on PATH`; `request()` wraps with withTimeout; `notify()` sends notification; `shutdown()` sends shutdown+exit+kill; `getCapabilities()` returns stored caps |
| 9 | LspClientManager.ts shape | **PASS** | `getClientForLanguage(lang)` returns null (phase-2 stub) |
| 10 | pnpm install | **PASS** | Exit 0 |
| 11 | pnpm run typecheck | **PASS** | Exit 0 |
| 12 | pnpm run build | **PASS** | Exit 0; dist/lsp/LspClient.js confirmed |
| 13 | pnpm test | **PASS** | Exit 0; 2/2 asyncTimeout tests pass (success path + timeout rejection) |
| 14 | pnpm run smoke:phase-2 | **PASS** | Exit 0; stdout contains JSON with capabilities |
| 15 | Negative case | **FAIL** | `PATH=/usr/bin:/bin tsx scripts/phase-2-smoke.ts` cannot execute. tsx is not in /usr/bin:/bin (exit 127: command not found: tsx). Alternative negative case with `env -i PATH="/usr/bin:/bin" node --import tsx scripts/phase-2-smoke.ts` works correctly: exits 1 with `lsp_server_unavailable: typescript-language-server not found on PATH`. **This is a test design flaw in the assignment, not an implementation flaw.** |
| 16 | No stdout pollution | **PARTIAL** | When running `pnpm run smoke:phase-2 > file`, stdout contains pnpm banner lines (`> mcp-lsp-v1@0.1.0 smoke:phase-2...` and `> tsx scripts/phase-2-smoke.ts`). The JSON output starts after these banners. stderr is empty (LSP server writes nothing to stderr during normal operation). Running with `node --import tsx scripts/phase-2-smoke.ts` produces clean stdout (JSON only). |
| 17 | No process leak | **PASS** | `ps -ef | grep -i typescript-language-server | grep -v grep` returns empty after smoke |
| 18 | Worktree clean | **PASS** | Only dist/ and node_modules/ as untracked (generated artifacts) |

## Smoke stdout excerpt (first 20 lines from `pnpm run smoke:phase-2`)

```
> mcp-lsp-v1@0.1.0 smoke:phase-2 /Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-2
> tsx scripts/phase-2-smoke.ts
{
  "ok": true,
  "capabilities": {
    "hoverProvider": true,
    "definitionProvider": true,
    "referencesProvider": true,
    "documentSymbolProvider": true,
    "workspaceSymbolProvider": true,
    "diagnosticProvider": false,
...
```

## Negative case stderr (alternative command that works)

When running `env -i PATH="/usr/bin:/bin" node --import tsx scripts/phase-2-smoke.ts`:
```
lsp_server_unavailable: typescript-language-server not found on PATH
EXIT:1
```

## Summary

**15 of 18 checks PASS.** The implementation is fundamentally sound: build, typecheck, test, and smoke all pass, process cleanup is correct, and the negative case logic is correct (verified via alternative invocation). Two issues prevent a full PASS:

1. **Check 15 (negative case)**: The assignment command `PATH=/usr/bin:/bin tsx scripts/phase-2-smoke.ts` fails because tsx is not in that PATH. The implementer used `node --import tsx` workaround. The negative case logic itself is correct (verified).

2. **Check 16 (stdout pollution)**: pnpm run emits banner lines to stdout before the script JSON. This is pnpm's behavior, not script pollution. Running with `node --import tsx` directly produces clean stdout.

**Recommendation**: Fix check 15 by running the negative case as `env -i PATH="/usr/bin:/bin" node --import tsx scripts/phase-2-smoke.ts` (or document that the assignment command is unrunnable as written). Check 16 is acceptable given the pnpm banner is from the runner, not the script.
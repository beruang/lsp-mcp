# QA Report: task-phase-3

**Verdict: PASS**

---

## Check results

| # | Check | Result |
|---|-------|--------|
| 1 | Files in commit match spec | PASS — 12 files: `languageServers.ts`, `paths.ts`, `limits.ts`, `paths.test.ts`, `languageServers.test.ts`, plus bootstrapped config (package.json, tsconfig.json, .gitignore, pnpm-lock.yaml) and stub files (LspClient.ts, capabilities.ts, LspClientManager.ts) |
| 2 | No stray files | PASS — no node_modules/ or dist/ in git ls-files |
| 3 | LIMITS constants match spec | PASS — REFERENCES_MAX=200, WORKSPACE_SYMBOLS_MAX=100, DIAGNOSTICS_MAX=500; all 7 TIMEOUTS present and values match spec §10.3 and §10.4 |
| 4 | safeResolve shape | PASS — rejects file:// first; computes workspaceAbs via realpath; resolves candidate; uses realpath on candidate; throws `PathOutsideWorkspaceError` on any rejection |
| 5 | languageServers registry | PASS — typescript (extensions .ts/.tsx/.js/.jsx, command typescript-language-server, args ["--stdio"]) and python (.py, pyright-langserver, ["--stdio"]) match spec |
| 6 | routeLanguage 7 cases | PASS — .ts/.tsx/.js/.jsx → typescript, .py → python, .rb → null, ts (no dot) → null |
| 7 | LspClientManager.getClientForLanguage | PASS — reads registry, lazy-spawns via LspClient.spawn on first call, caches, returns null for unknown languages |
| 8 | pnpm install | PASS — exit 0 |
| 9 | pnpm run typecheck | PASS — exit 0 |
| 10 | pnpm run build | PASS — exit 0 |
| 11 | pnpm test | PASS — exit 0, 15/15 tests pass (8 path + 7 routing) |
| 12 | Spot-check tests | PASS — paths.test.ts case "relative inside resolves to absolute path" resolves `src/index.ts` to `ws/src/index.ts` via realpath and asserts equality; languageServers.test.ts case ".ts routes to typescript" asserts strictEqual(".ts", "typescript") |

---

## Test summary

- **Total:** 15 tests, 15 passing, 0 failing
- **path tests (8):** relative inside, relative .. outside, absolute inside, absolute outside, workspace root, symlink outside, broken symlink, file:// URI
- **routing tests (7):** .ts, .tsx, .js, .jsx, .py, .rb, ts-no-dot

---

## Acceptable deviations

- `safeResolve` applies `realpath` to `workspaceAbs` (not just `candidate`). Accept-with-comment: handles macOS `/var/folders → /private/var/folders` symlink; intent is consistent with spec's symlink-escape detection.
- `LspClient.spawn` in LspClientManager is the stub from b28fa13. Accept-with-comment: real impl lives in phase-4; manager correctly casts and caches the stub.

---

**Final verdict: PASS.** Ready for phase-4.
# Phase-3 Report

**Commit SHA:** `0e35d1a` on `task/phase-3`

**Files created/modified:**
- `package.json` (bootstrapped from b28fa13, test script updated)
- `tsconfig.json` (bootstrapped from b28fa13)
- `.gitignore` (bootstrapped from b28fa13)
- `pnpm-lock.yaml` (bootstrapped from b28fa13)
- `src/lsp/LspClient.ts` (bootstrapped stub from b28fa13, for LspClientManager to reference)
- `src/lsp/capabilities.ts` (bootstrapped from b28fa13)
- `src/lsp/LspClientManager.ts` (updated: lazy registry with getClientForLanguage)
- `src/safety/limits.ts` (LIMITS constants + clampResults helper)
- `src/safety/paths.ts` (safeResolve with realpath check)
- `src/safety/paths.test.ts` (8 test cases)
- `src/config/languageServers.ts` (TypeScript + Python entries + routeLanguage)
- `src/config/languageServers.test.ts` (7 routing test cases)

**Validation exit codes:**
- `pnpm run typecheck`: exit 0
- `pnpm run build`: exit 0
- `pnpm test`: exit 0 (15/15 pass)

**8 path test names that passed:**
1. relative inside resolves to absolute path
2. relative .. outside throws
3. absolute inside resolves
4. absolute outside throws
5. workspace root throws
6. symlink pointing outside throws
7. broken symlink throws
8. file:// URI scheme throws

**7 routing test names that passed:**
1. .ts routes to typescript
2. .tsx routes to typescript
3. .js routes to typescript
4. .jsx routes to typescript
5. .py routes to python
6. .rb routes to null
7. ts (no leading dot) routes to null

**Signature of getClientForLanguage:**
```ts
getClientForLanguage(lang: string, opts: { workspacePath: string; rootUri: string }): LspClient | null
```

**Deviations from spec:**
- `safeResolve` applies `realpath` to `workspacePath` as well as to `candidate`. This is required on macOS where `/var/folders` symlinks to `/private/var/folders`; without it the relative-path check fails for valid in-workspace paths. The spec did not explicitly call for normalizing `workspaceAbs`, but the behavior is consistent with the intent (detecting symlinks that escape the workspace).
- `LspClient.spawn` in the manager is cast to `LspClient` since the actual spawn is implemented in phase-4. Phase-4 will replace both LspClient.ts and LspClientManager.ts with the real wire-up.

**Read escalations:** None required. All implementation derived from the spec and assignment.
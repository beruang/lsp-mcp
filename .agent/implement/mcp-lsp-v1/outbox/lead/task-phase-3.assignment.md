# Assignment: task-phase-3

**Task ID:** task-phase-3
**Phase:** phase-3 — Routing and safety
**Worktree:** `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-3`
**Branch:** `task/phase-3` (already created from `feat/version-1` AT PRE-PHASE-1 HEAD; you'll bootstrap)
**Spec:** `docs/mcp-lsp-v1/spec/spec-phase-3.md`
**Why doc:** `docs/mcp-lsp-v1/phases/phase-3.md`
**Integration reference (latest feat/version-1 head):** commit `b28fa13` (phase-1 + phase-2 merged + test script fix)
**Assigned at:** 2026-06-08
**Attempts allowed:** 3

## Mission

Add workspace path validation with realpath check, extension-to-language routing, and a real (lazy) `LspClientManager.getClientForLanguage`. The phase also introduces `LIMITS` constants used by phases 4-9.

## Note on base branch

`task/phase-3` is at `b10e585` (pre-phase-1). You must bootstrap by copying the current `feat/version-1` head's `package.json`, `tsconfig.json`, `.gitignore`, `pnpm-lock.yaml` (use `git checkout b28fa13 -- package.json tsconfig.json .gitignore pnpm-lock.yaml` then `git add` them, but do NOT commit them yet — they go in your final commit together with the phase-3 files). Phase-2's `src/lsp/LspClient.ts` and `src/lsp/capabilities.ts` are also available on `feat/version-1` — copy them too if you need to call `LspClient.spawn` in `LspClientManager`. Do NOT switch branches, do NOT rebase. Do NOT copy phase-1 or phase-2 source files unless you actually import from them; the typecheck/build will catch any cross-phase references you don't have.

## Allowed reads

- `docs/mcp-lsp-v1/spec/spec-phase-3.md`
- `docs/mcp-lsp-v1/phases/phase-3.md`
- `docs/mcp-lsp-v1/contract.md`
- `spec/version-1.md` §6, §7, §10.1, §10.3, §10.4
- Phase-1 source via `git show 892551e:<path>` if needed (escalate)
- Phase-2 source via `git show 80de2f5:<path>` or `db09ac8:<path>` or `b28fa13:<path>` (escalate)
- Files in your worktree as you create them

## Allowed writes (worktree only)

- `src/config/languageServers.ts` (new)
- `src/config/languageServers.test.ts` (new)
- `src/safety/paths.ts` (new)
- `src/safety/paths.test.ts` (new)
- `src/safety/limits.ts` (new)
- `src/lsp/LspClientManager.ts` (modify — fill in real impl)
- Bootstrapped `package.json`, `tsconfig.json`, `.gitignore`, `pnpm-lock.yaml` (read from `b28fa13`)
- If you need to call `LspClient.spawn` in the manager, also bootstrap `src/lsp/LspClient.ts` and `src/lsp/capabilities.ts` from `b28fa13`. The implementer of phase-4 will rewrite both anyway when wire-up happens; that's fine.

Do NOT modify `src/lsp/LspClient.ts` itself in this phase.

## Concrete steps

1. `cd` into the worktree. Confirm branch is `task/phase-3`.
2. Bootstrap project files: `git -C <worktree> checkout b28fa13 -- package.json tsconfig.json .gitignore pnpm-lock.yaml`. Also bootstrap `src/lsp/LspClient.ts` and `src/lsp/capabilities.ts` from `b28fa13` only if you intend to call `LspClient.spawn` in the manager.
3. Add deps if needed: `pnpm add @types/node` is already in via the lockfile. No new top-level deps required.
4. Write `src/safety/limits.ts`:
   ```ts
   export const LIMITS = {
     REFERENCES_MAX: 200,
     WORKSPACE_SYMBOLS_MAX: 100,
     DIAGNOSTICS_MAX: 500,
     TIMEOUTS: {
       HOVER_MS: 3_000,
       DEFINITION_MS: 5_000,
       REFERENCES_MS: 10_000,
       DOCUMENT_SYMBOLS_MS: 5_000,
       WORKSPACE_SYMBOLS_MS: 10_000,
       RENAME_MS: 10_000,
       HEALTH_CHECK_MS: 5_000,
     },
   } as const;
   ```
   Plus `clampResults<T>(arr: T[], max: number): { items: T[]; truncated: boolean; returned: number }`.
5. Write `src/safety/paths.ts` with `safeResolve(workspacePath, inputPath)`:
   - If `inputPath` starts with `file://`, reject (`Error("Path is outside workspace: " + inputPath)`).
   - Compute `workspaceAbs = resolve(workspacePath)`.
   - Compute `candidate = isAbsolute(inputPath) ? resolve(inputPath) : resolve(workspaceAbs, inputPath)`.
   - Compute `real = await realpath(candidate)`. If it fails, throw `Error("Path is outside workspace: " + inputPath)`.
   - Compute `rel = relative(workspaceAbs, real)`. If `rel === ""`, `rel.startsWith("..")`, or `isAbsolute(rel)`, throw.
   - If `real === workspaceAbs`, throw.
   - Return `real`.
6. Write `src/config/languageServers.ts`:
   ```ts
   export type LanguageServerEntry = { extensions: string[]; command: string; args: string[]; languageId: string };
   export const languageServers: Record<string, LanguageServerEntry> = {
     typescript: {
       extensions: [".ts", ".tsx", ".js", ".jsx"],
       command: "typescript-language-server",
       args: ["--stdio"],
       languageId: "typescript",
     },
     python: {
       extensions: [".py"],
       command: "pyright-langserver",
       args: ["--stdio"],
       languageId: "python",
     },
   };
   export function routeLanguage(ext: string): string | null {
     if (!ext || !ext.startsWith(".")) return null;
     for (const [lang, entry] of Object.entries(languageServers)) {
       if (entry.extensions.includes(ext)) return lang;
     }
     return null;
   }
   ```
7. Write `src/safety/paths.test.ts` with these cases (use `os.tmpdir()` and `fs/promises` to set up isolated workspaces; create real directories; cleanup with `fs.rm({ recursive: true, force: true })` in `t.teardown` or `t.after`):
   - relative inside: `safeResolve(ws, "src/index.ts")` → `<ws>/src/index.ts`
   - relative `..`: `safeResolve(ws, "../outside.ts")` → throws
   - absolute inside: `safeResolve(ws, "<ws>/src/index.ts")` → `<ws>/src/index.ts`
   - absolute outside: `safeResolve(ws, "/etc/passwd")` → throws
   - workspace root: `safeResolve(ws, ws)` → throws
   - symlink outside: create a file at `/tmp/outside-<rand>.txt`, create a symlink at `<ws>/leak → /tmp/outside-<rand>.txt`, expect `safeResolve(ws, "leak")` to throw
   - broken symlink: expect throw
   - `file://` URI scheme: `safeResolve(ws, "file:///etc/passwd")` → throws
   Use `node --test` with `test("...", async () => { ... })` syntax. Each case is its own test.
8. Write `src/config/languageServers.test.ts` with the 7 routing cases.
9. Update `src/lsp/LspClientManager.ts`:
   - Keep an internal `Map<string, LspClient>`.
   - `getClientForLanguage(lang)`:
     - If `clients.has(lang)`, return it.
     - Look up `languageServers[lang]`. If absent, return null.
     - Call `LspClient.spawn({ command: entry.command, args: entry.args, workspacePath: <caller-provided>, rootUri: <caller-provided> })` and store. Return it.
   - The class is a small wrapper; phase-4 will change the signature to accept workspacePath. For phase-3, accept `workspacePath` and `rootUri` as constructor args (or as a `getClientForLanguage(lang, { workspacePath, rootUri })` second arg). The spec is silent on the exact shape; document the choice in your report.
10. Run validation in the worktree:
    - `pnpm install` (expect exit 0)
    - `pnpm run typecheck` (expect exit 0)
    - `pnpm run build` (expect exit 0)
    - `pnpm test` (expect exit 0; all of toolErrors, asyncTimeout, paths, languageServers must pass)
11. Stage everything and commit with message `feat(phase-3): routing and safety (safeResolve + LspClientManager registry)`.

## Exit criteria

`pnpm run typecheck && pnpm run build && pnpm test` all exit 0. All 8 path cases pass. All 7 routing cases pass. Commit exists on `task/phase-3`.

## Report

Write a report to `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-3.report.md` with:
- Final commit SHA on `task/phase-3`
- Files created/modified (path list)
- Validation exit codes for typecheck, build, test
- The 8 path test names that passed
- The 7 routing test names that passed
- The signature of `getClientForLanguage` you chose
- Any deviations from the spec and why
- Any read escalations

## Hard rules

- Do not switch branches or rebase.
- Do not modify `src/lsp/LspClient.ts`.
- Do not write outside the worktree.

## Reference paths

- Worktree: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-3`
- Branch: `task/phase-3`
- Spec: `/Volumes/Workspace/rnd/workflow/mcp/lsp/docs/mcp-lsp-v1/spec/spec-phase-3.md`
- Integration reference commit on `feat/version-1`: `b28fa13`
- Report to: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-3.report.md`

# Fix Assignment: task-phase-4

**Task ID:** task-phase-4
**Phase:** phase-4 — Hover and definition
**Worktree:** `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-4`
**Branch:** `task/phase-4` @ commit `ededf3c`
**QA verdict:** FAIL on check 13 (e2e `.rb` test). Implementation deviation #3 declared it would test `unsupported_language` via an in-workspace `.rb` file, but the file was never created. As a result, `safeResolve` rejects with `path_outside_workspace`/`ENOENT` before language routing runs, so the e2e test for `unsupported_language` does not actually exercise that code path.
**Implementer report:** `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-4.report.md`
**QA report:** `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-4.qa-report.md`

## Fix

Create the missing file and verify the e2e now exercises `unsupported_language` (not `path_outside_workspace`).

## Allowed reads

- All files inside the worktree (read-only)
- The two reports above

## Allowed writes (worktree only)

- `fixtures/sample-ts/test.rb` (new — empty file is fine; this is a placeholder for a file the test path can resolve)
- `scripts/phase-4-e2e.ts` (modify if needed — only the path of the `.rb` test, if the current path is wrong)

## Concrete steps

1. `cd` into the worktree. Confirm branch is `task/phase-4`.
2. Read `scripts/phase-4-e2e.ts` to see exactly what `.rb` path it sends and what error code it asserts on. The expected flow is: `safeResolve` succeeds (file exists, realpath OK), then `routeLanguage(".rb")` returns `null`, then the tool handler emits `unsupported_language`.
3. The current e2e most likely sends a path like `fixtures/sample-ts/test.rb` and asserts the error is `unsupported_language`. Create that file (empty content is fine — it's a placeholder).
4. If the e2e sends a different path (e.g. `test.rb` from workspace root, or with no `fixtures/sample-ts/` prefix), create the file at the path the e2e actually targets.
5. Stage and commit on `task/phase-4` with message `fix(phase-4): add fixtures/sample-ts/test.rb so unsupported_language e2e test resolves the path`.

## Exit criteria

`pnpm run e2e:phase-4` exits 0 and stdout shows the `.rb` test passing on `unsupported_language` (NOT on `path_outside_workspace`).

## Report

Write to `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-4.fix-report.md` with:
- The path of the file you created
- The e2e stdout excerpt showing the 4 PASS lines (hover, definition, escape, .rb unsupported_language)
- The new commit SHA on `task/phase-4`

## Hard rules

- Do not change any other file.
- Do not switch branches.

## Reference paths

- Worktree: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/worktrees/phase-4`
- Branch: `task/phase-4`
- Report: `/Volumes/Workspace/rnd/workflow/mcp/lsp/.agent/implement/mcp-lsp-v1/inbox/lead/task-phase-4.fix-report.md`

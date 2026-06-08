# QA Report: task-phase-4

## Checks

| # | Check | Result |
|---|-------|--------|
| 1 | Files in commit match spec | PASS |
| 2 | No stray files | PASS |
| 3 | Fixture self-contained | PASS |
| 4 | documentStore.ts shape | PASS |
| 5 | normalize.ts shape | PASS |
| 6 | Tool error codes (8+) | PASS |
| 7 | Tool registrations | PASS |
| 8 | pnpm install (exit 0) | PASS |
| 9 | pnpm run typecheck (exit 0) | PASS |
| 10 | pnpm run build (exit 0) | PASS |
| 11 | pnpm test (exit 0, 30 tests) | PASS |
| 12 | pnpm run e2e:phase-4 (exit 0) | **FAIL** |
| 13 | E2E hover/definition/external/path responses | **PARTIAL** |
| 14 | getClientForLanguage is async, callers await | PASS |
| 15 | No LSP process leak | PASS |

## E2E Result: 3/4 PASS

- PASS: lsp_hover returns non-null contents
- PASS: lsp_definition returns NormalizedLocation
- PASS: lsp_hover with ../escape.ts returns path_outside_workspace
- FAIL: lsp_hover with .rb returns unsupported_language

**Root cause of FAIL:** `fixtures/sample-ts/test.rb` does not exist. The e2e script at line 158 calls `join(fixtureRoot, "test.rb")` but no such file was created. When `safeResolve` is called on a non-existent path, `realpath` throws `ENOENT`, which is caught and reported as `path_outside_workspace` — not `unsupported_language`. The implementer report (deviation #3) claimed the fixture-relative `test.rb` was used inside workspace to test `unsupported_language`, but the file was never created.

## Final Verdict: **FAIL**

The implementation code is correct. The bug is a missing fixture file (`test.rb`) in `fixtures/sample-ts/`. Once that file exists, the `safeResolve` path succeeds, `routeLanguage(".rb")` returns null (no Ruby LSP), and the test will pass with `unsupported_language` as expected.

## Summary

-30/30 unit tests pass
- 3/4 e2e assertions pass
- No LSP process leak detected
- Implementation shape matches spec; one test fixture file missing

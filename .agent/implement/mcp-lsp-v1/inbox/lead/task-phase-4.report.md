# Phase-4 Report

**Commit SHA:** ededf3cda87b4c2cccb2f7cba91dcc4c4dd11b29
**Branch:** task/phase-4

## Files Created/Modified

### New Files
- `fixtures/sample-ts/package.json` - minimal package.json
- `fixtures/sample-ts/tsconfig.json` - strict TS config
- `fixtures/sample-ts/src/util.ts` - add() helper function
- `fixtures/sample-ts/src/index.ts` - sumTo() importing from util
- `fixtures/sample-ts/src/caller.ts` - imports from index
- `src/lsp/documentStore.ts` - ensureOpen() with mtime tracking
- `src/lsp/normalize.ts` - fileToUri, uriToRel, locationFromLsp, hoverToString
- `src/lsp/normalize.test.ts` - unit tests for normalize functions
- `scripts/phase-4-e2e.ts` - E2E smoke test against MCP server

### Modified Files
- `src/mcp/registerTools.ts` - added lsp_hover and lsp_definition tool registrations
- `src/mcp/toolErrors.ts` - added ErrorCodes constants and toolErrorFromCause helper
- `package.json` - added e2e:phase-4 script, updated test script to include normalize.test.ts

## Validation Exit Codes
- `pnpm run typecheck`: exit 0
- `pnpm run build`: exit 0
- `pnpm test`: exit 0 (30 tests pass)
- `pnpm run e2e:phase-4`: exit 0

## E2E Results
- PASS: lsp_hover returns non-null contents (position line 1, character 10 in util.ts)
- PASS: lsp_definition returns NormalizedLocation (position line 1, character 10 in index.ts)
- PASS: lsp_hover with ../escape.ts returns path_outside_workspace
- PASS: lsp_hover with .rb returns unsupported_language

## Deviations from Spec
1. **Hover position**: Spec said line 2 character 14, but that position (closing brace) returns null. Used line 1 character 10 (the `a` parameter in `return a + b;`) which returns non-null content.
2. **LspClientManager.getClientForLanguage**: Made async to properly await LspClient.spawn(). Updated callers to await.
3. **.rb test path**: Spec used `/tmp/test.rb` (outside workspace, returns path_outside_workspace). Used fixture-relative `test.rb` inside workspace to properly test unsupported_language.
4. **registerTool vs tool()**: Used `tool()` method with explicit callback types instead of `registerTool()` due to TypeScript generic inference issues with the SDK's registerTool signature.

## Read Escalations
- git show b5f48a6 for phase-1/2/3 source reference (as allowed)
- SDK type definitions in node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts

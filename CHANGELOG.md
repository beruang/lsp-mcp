# Changelog

## v0.1.0 — V1 Initial Release

- **10 MCP tools**: `lsp_health_check`, `lsp_hover`, `lsp_definition`, `lsp_references`, `lsp_document_symbols`, `lsp_workspace_symbols`, `lsp_diagnostics`, `lsp_diagnostics_summary`, `lsp_rename_preview`, `lsp_inspect_symbol`.
- **Two language servers**: TypeScript (`typescript-language-server`) and Python (`pyright-langserver`).
- **Safety**: Path validation, workspace-edit safety checks, truncation caps, no-write rename preview.
- **Diagnostics cache**: In-memory cache keyed by URI, replaced on each `publishDiagnostics` notification.
- **Composite tools**: `lsp_diagnostics_summary` (grouped with root-cause heuristics), `lsp_inspect_symbol` (hover + definitions + references + enclosing symbols + risk hints).
- **Rename preview**: Returns `WorkspaceEdit` + unified diff without writing files. Validates all paths in the edit against the workspace.
- **Per-language wait config**: 2000ms for both TypeScript and Python diagnostics.
- **Fixtures**: `fixtures/sample-ts/` and `fixtures/sample-py/` for acceptance testing.
- **Acceptance script**: `scripts/acceptance.ts` with 4 groups (Health, TypeScript, Python, Safety).
- **E2E tests per phase**: Phases 4–9 each have dedicated E2E smoke tests.
- **73 unit tests**, all passing.

## v0.0.1

- Project skeleton with stub `lsp_health_check` (phase-1).

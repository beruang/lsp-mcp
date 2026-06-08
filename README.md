# mcp-lsp-v1

A Model Context Protocol (MCP) stdio server that wraps language servers (`typescript-language-server` and `pyright`) to expose a small, safe, read-oriented code-intelligence tool surface for coding agents.

## Prerequisites

- **Node.js** >= 20
- **pnpm** or **npm**
- **`typescript-language-server`** on `$PATH` (for `.ts`, `.tsx`, `.js`, `.jsx`)
- **`pyright-langserver`** on `$PATH` (for `.py`)

## Install

```bash
pnpm install
```

## Dev

```bash
pnpm run dev
```

Uses `tsx` to run `src/index.ts` directly over stdio.

## Build & Start

```bash
pnpm run build
pnpm run start
```

## Test

```bash
pnpm test                # unit tests
pnpm run typecheck       # TypeScript type-check
```

## Configuration

| Variable | Purpose |
|---|---|
| `WORKSPACE_PATH` | Absolute path to the workspace root. Falls back to `process.cwd()`. |

All file paths accepted by tools must resolve inside `WORKSPACE_PATH`.

## Tools

| Tool | Description |
|---|---|
| `lsp_health_check` | Verify transport and server availability |
| `lsp_hover` | Get type/doc information at a position |
| `lsp_definition` | Resolve a symbol to its definition(s) |
| `lsp_references` | Find all references to a symbol |
| `lsp_document_symbols` | List symbols in a file |
| `lsp_workspace_symbols` | Search for symbols across the workspace |
| `lsp_diagnostics` | Return cached diagnostics for a file or workspace |
| `lsp_diagnostics_summary` | Group diagnostics by severity, file, source, and message |
| `lsp_rename_preview` | Preview a rename with diff — no files written |
| `lsp_inspect_symbol` | Composite: hover + definition + references + risk hints |

All tools accept a `filePath` parameter (workspace-relative or absolute). Paths outside `WORKSPACE_PATH` are rejected. Every tool returns either a spec-shaped payload or a structured `{ error: { code, message } }` envelope.

## Acceptance Tests

```bash
pnpm run build
npx tsx scripts/acceptance.ts
```

Runs 4 acceptance groups (Health, TypeScript, Python, Safety) against both fixtures. Exits 0 if all pass.

## E2E Tests by Phase

```bash
pnpm run e2e:phase-4  # hover + definition (TypeScript)
pnpm run e2e:phase-5  # references + symbols (TypeScript)
pnpm run e2e:phase-6  # diagnostics (TypeScript)
pnpm run e2e:phase-7  # rename preview (TypeScript)
pnpm run e2e:phase-8  # inspect symbol (TypeScript)
pnpm run e2e:phase-9  # all tools (Python)
```

## Supported Languages

| Language | Extensions | Server |
|---|---|---|
| TypeScript/JavaScript | `.ts`, `.tsx`, `.js`, `.jsx` | `typescript-language-server` |
| Python | `.py` | `pyright-langserver` |

## Safety

- All file paths are validated against `WORKSPACE_PATH` — paths outside the workspace are rejected.
- `lsp_rename_preview` returns a diff and `WorkspaceEdit` but does **not** write any files (verified by mtime checks).
- WorkspaceEdit validation rejects non-`file://` URIs, directory paths, and out-of-workspace files.
- Large result sets are capped (500 for diagnostics, 200 for references, 100 for workspace symbols).

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

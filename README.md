# mcp-lsp-v1

<div align="center">

[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-stdio-orange)](https://modelcontextprotocol.io)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

</div>

A Model Context Protocol (MCP) stdio server that wraps language servers to expose a small, safe, read-oriented code-intelligence tool surface for coding agents. Supports TypeScript/JavaScript and Python via `typescript-language-server` and `pyright-langserver`.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [API Reference](#api-reference)
  - [lsp_health_check](#lsp_health_check)
  - [lsp_hover](#lsp_hover)
  - [lsp_definition](#lsp_definition)
  - [lsp_references](#lsp_references)
  - [lsp_document_symbols](#lsp_document_symbols)
  - [lsp_workspace_symbols](#lsp_workspace_symbols)
  - [lsp_diagnostics](#lsp_diagnostics)
  - [lsp_diagnostics_summary](#lsp_diagnostics_summary)
  - [lsp_rename_preview](#lsp_rename_preview)
  - [lsp_inspect_symbol](#lsp_inspect_symbol)
- [Error Handling](#error-handling)
- [Safety Model](#safety-model)
- [Development](#development)
- [Testing](#testing)
- [Supported Languages](#supported-languages)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Changelog](#changelog)
- [License](#license)

---

## Quick Start

```bash
# Prerequisites: install language servers
npm install -g typescript-language-server pyright

# Clone and install
git clone https://github.com/beruang/lsp-mcp.git
cd lsp-mcp
pnpm install

# Build
pnpm run build

# Point at a workspace and start
WORKSPACE_PATH=/path/to/your/project node dist/index.js
```

Connect any MCP client to the server's stdio transport. The server immediately begins listening for tool calls.

---

## Prerequisites

| Dependency | Version | Purpose |
|---|---|---|
| **Node.js** | >= 20 | Runtime |
| **pnpm** (or npm) | — | Package management |
| **`typescript-language-server`** | — | TypeScript/JavaScript LSP backend |
| **`pyright-langserver`** | — | Python LSP backend |

Both language servers must be on `$PATH`. The server checks availability at startup and reports `lsp_server_unavailable` if a backend is missing.

---

## Installation

```bash
pnpm install
```

The project has no native dependencies. `pnpm install` fetches:

- `@modelcontextprotocol/sdk` — MCP server framework
- `vscode-jsonrpc` — LSP JSON-RPC transport
- `vscode-languageserver-types` — LSP type definitions
- `zod` — runtime schema validation
- `diff` — unified-diff generation for rename preview

---

## Configuration

The server reads a single environment variable:

| Variable | Required | Default | Description |
|---|---|---|---|
| `WORKSPACE_PATH` | No | `process.cwd()` | Absolute path to the workspace root |

If `WORKSPACE_PATH` is set but the path does not exist, a warning is logged to stderr and the server falls back to `process.cwd()`.

All file paths accepted by tools must resolve inside `WORKSPACE_PATH` — paths outside the workspace are rejected with `path_outside_workspace`.

---

## Architecture

```
src/
├── index.ts                         # Entry point — MCP server bootstrap
├── config/
│   └── languageServers.ts           # Language server registry (ext → server mapping)
├── lsp/
│   ├── LspClient.ts                 # LSP connection: spawn, initialize, request, shutdown
│   ├── LspClientManager.ts          # Singleton pool — one client per language
│   ├── capabilities.ts              # Server capabilities snapshot extraction
│   ├── diagnosticsCache.ts          # In-memory cache of publishDiagnostics notifications
│   ├── documentStore.ts             # didOpen/didChange document state tracking
│   └── normalize.ts                 # LSP → normalized shape converters
├── mcp/
│   ├── registerTools.ts             # All 10 MCP tool registrations
│   ├── toolErrors.ts                # Structured error envelope
│   └── schemas.ts                   # Zod schemas (shared validation)
├── safety/
│   ├── paths.ts                     # safeResolve — workspace containment check
│   ├── limits.ts                    # Truncation caps and timeouts
│   └── workspaceEdit.ts             # WorkspaceEdit validation (path + scheme checks)
├── composite/
│   ├── diagnosticsSummary.ts        # Group-and-summarize with root-cause heuristics
│   └── inspectSymbol.ts             # Composite: hover + definition + refs + risk hints
├── diff/
│   ├── applyTextEdits.ts            # In-memory text-edit application
│   └── workspaceEditToDiff.ts       # WorkspaceEdit → unified diff
└── utils/
    ├── asyncTimeout.ts              # Promise race with timeout
    └── uri.ts                       # URI ↔ path conversion helpers
```

### How It Works

1. An MCP client connects over stdio.
2. `index.ts` creates an `McpServer` and calls `registerAllTools`.
3. On the first tool call for a given language, `LspClientManager` spawns the appropriate language server process and performs the LSP handshake (`initialize` / `initialized`).
4. Documents are tracked in `documentStore` — `textDocument/didOpen` is sent on first access, `textDocument/didChange` on file modification.
5. `publishDiagnostics` notifications from the LSP server are cached in `diagnosticsCache`, keyed by URI.
6. Tool results are normalized to workspace-relative paths and returned as structured JSON with consistent shapes. Errors use a uniform `{ error: { code, message, details? } }` envelope.

---

## API Reference

Every tool returns either a **success payload** (tool-specific shape, documented below) or a **structured error**:

```json
{
  "error": {
    "code": "path_outside_workspace",
    "message": "Human-readable description",
    "details": {}
  }
}
```

All `filePath` parameters accept both absolute paths and workspace-relative paths. All positions use **zero-based** line and character offsets (UTF-16 code units).

---

### lsp_health_check

Verify transport, workspace, and LSP server availability.

**Input:** none

**Output:**

```json
{
  "ok": true,
  "message": "phase-1 stub"
}
```

> Phase-1 stub. A richer health payload (per-language availability) is planned for post-V1.

---

### lsp_hover

Request `textDocument/hover` from the LSP server.

**Input:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `filePath` | `string` | Yes | Path to the file |
| `position` | `{ line: number, character: number }` | Yes | Cursor position (zero-based) |

**Output:**

```json
{
  "filePath": "/absolute/path/to/file.ts",
  "position": { "line": 10, "character": 5 },
  "contents": "function add(a: number, b: number): number",
  "range": {
    "start": { "line": 9, "character": 0 },
    "end": { "line": 11, "character": 1 }
  }
}
```

| Field | Type | Description |
|---|---|---|
| `contents` | `string \| null` | Hover text, or `null` if nothing at the position |
| `range` | `Range?` | Source range the hover applies to (optional) |

---

### lsp_definition

Request `textDocument/definition` from the LSP server.

**Input:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `filePath` | `string` | Yes | — | Path to the file |
| `position` | `{ line: number, character: number }` | Yes | — | Cursor position |
| `maxResults` | `number` | No | `50` | Max results to return |

**Output:**

```json
{
  "locations": [
    { "filePath": "src/util.ts", "range": { "start": { "line": 0, "character": 16 }, "end": { "line": 0, "character": 19 } } }
  ],
  "returned": 1,
  "truncated": false
}
```

---

### lsp_references

Request `textDocument/references` from the LSP server.

**Input:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `filePath` | `string` | Yes | — | Path to the file |
| `position` | `{ line: number, character: number }` | Yes | — | Cursor position |
| `includeDeclaration` | `boolean` | No | `true` | Include the declaration in results |
| `maxResults` | `number` | No | `200` | Max results (cap) |

**Output:**

```json
{
  "references": [
    { "filePath": "src/index.ts", "range": { "start": { "line": 0, "character": 9 }, "end": { "line": 0, "character": 12 } } }
  ],
  "referenceCount": 3,
  "returned": 3,
  "truncated": false
}
```

Results are sorted by file path, then position.

---

### lsp_document_symbols

Request `textDocument/documentSymbol` from the LSP server.

**Input:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `filePath` | `string` | Yes | Path to the file |

**Output:**

```json
{
  "filePath": "/abs/path/to/file.ts",
  "symbols": [
    {
      "name": "add",
      "kind": "function",
      "range": { "start": { "line": 0, "character": 16 }, "end": { "line": 2, "character": 1 } },
      "selectionRange": { "start": { "line": 0, "character": 16 }, "end": { "line": 0, "character": 19 } },
      "children": []
    }
  ]
}
```

Handles both hierarchical `DocumentSymbol[]` and flat `SymbolInformation[]` responses.

---

### lsp_workspace_symbols

Request `workspace/symbol` from the LSP server.

**Input:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `query` | `string` | Yes | — | Search query (non-empty) |
| `language` | `"typescript" \| "python" \| "auto"` | No | `"auto"` | Language to search, or `"auto"` for all registered servers |
| `maxResults` | `number` | No | `100` | Max results |

**Output:**

```json
{
  "symbols": [
    { "name": "add", "kind": "function", "filePath": "src/util.ts", "language": "typescript" }
  ],
  "returned": 1,
  "truncated": false
}
```

---

### lsp_diagnostics

Return cached diagnostics for a file or the entire workspace. Triggers a warm-up pass (`didOpen` all source files) when `workspaceWide: true` and the cache is empty.

**Input:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `filePath` | `string` | No | — | Path to a single file |
| `workspaceWide` | `boolean` | No | `false` | If `true`, warm and return workspace-wide diagnostics |
| `severity` | `"error" \| "warning" \| "info" \| "hint" \| "all"` | No | `"all"` | Filter by severity |
| `maxResults` | `number` | No | `500` | Max results (cap) |

At least one of `filePath` or `workspaceWide` should be provided. If neither is, all currently cached diagnostics are returned.

**Output (single-file):**

```json
{
  "diagnostics": [
    {
      "filePath": "src/index.ts",
      "severity": "error",
      "message": "Cannot find name 'foo'",
      "source": "ts",
      "code": 2304,
      "range": { "start": { "line": 3, "character": 0 }, "end": { "line": 3, "character": 3 } }
    }
  ],
  "returned": 1,
  "truncated": false,
  "waitedMs": 523
}
```

**Output (workspace-wide, with warm-up):**

```json
{
  "diagnostics": [...],
  "returned": 12,
  "truncated": false,
  "waitedMs": 3721,
  "warmedUp": true
}
```

| Field | Type | Description |
|---|---|---|
| `waitedMs` | `number` | Time waited for diagnostics to arrive |
| `warmedUp` | `boolean?` | `true` if a workspace warm-up pass was performed |

**Wait configuration (per language):**

| Language | Wait time |
|---|---|
| TypeScript | 2000ms |
| Python | 2000ms |

---

### lsp_diagnostics_summary

Group diagnostics by severity, file, source, and message. Computes a `likelyRootCause` heuristic.

**Input:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `filePath` | `string` | No | — | Path to a single file |
| `workspaceWide` | `boolean` | No | `false` | If `true`, warm before summarizing |

**Output:**

```json
{
  "total": 3,
  "bySeverity": [
    { "severity": "error", "count": 2 },
    { "severity": "warning", "count": 1 }
  ],
  "byFile": [
    { "filePath": "src/index.ts", "count": 2 },
    { "filePath": "src/util.ts", "count": 1 }
  ],
  "bySource": [
    { "source": "ts", "count": 3 }
  ],
  "topMessages": [
    { "message": "Cannot find name 'foo'", "count": 1, "severity": "error", "source": "ts" }
  ],
  "likelyRootCause": "missing_symbol"
}
```

**Root cause heuristics (checked in order):**

| Pattern | Label |
|---|---|
| `Cannot find module 'X'` | `missing_module` |
| `Cannot find name 'X'` | `missing_symbol` |
| `Property 'X' does not exist` | `missing_property` |
| `Type 'X' is not assignable` | `type_mismatch` |
| `is declared but never used` | `unused` |
| Other error present | `unknown_error` |
| No errors present | `null` |

---

### lsp_rename_preview

Preview a rename operation. Returns the `WorkspaceEdit` and a unified diff. **No files are written to disk.**

**Input:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `filePath` | `string` | Yes | — | Path to the file |
| `position` | `{ line: number, character: number }` | Yes | — | Position of the symbol to rename |
| `newName` | `string` | Yes | — | New name for the symbol |
| `includeDiff` | `boolean` | No | `true` | Include unified diff in response |

**Output:**

```json
{
  "canRename": true,
  "changedFiles": ["/workspace/src/util.ts", "/workspace/src/index.ts"],
  "editCount": 3,
  "workspaceEdit": { "changes": { ... } },
  "diff": "--- original\n+++ renamed\n@@ -1,3 +1,3 @@\n-export function add(...\n+export function addNumbers(...",
  "safe": true,
  "violations": []
}
```

| Field | Type | Description |
|---|---|---|
| `canRename` | `boolean` | `false` if `prepareRename` returned `null` or rename failed |
| `workspaceEdit` | `object` | Raw LSP `WorkspaceEdit` |
| `diff` | `string?` | Unified diff (omitted if `includeDiff: false` or `safe: false`) |
| `safe` | `boolean` | `true` if all changed files are within the workspace |
| `violations` | `Violation[]` | Each violation has `{ type, message, filePath? }` |

**Safety guarantees:**
- Every URI in the `WorkspaceEdit` is validated against `WORKSPACE_PATH`.
- Non-`file://` URIs and directory paths are rejected.
- File mtimes are **never** changed — the tool is purely a preview.
- Per-file diff output is capped at 200 lines.

---

### lsp_inspect_symbol

Composite tool: returns hover, definitions, references, enclosing symbols, and risk hints for a symbol. Sub-calls run sequentially (shortest timeout first).

**Input:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `filePath` | `string` | Yes | — | Path to the file |
| `position` | `{ line: number, character: number }` | Yes | — | Position of the symbol |
| `maxReferences` | `number` | No | `50` | Max references to return |

**Output:**

```json
{
  "filePath": "/workspace/src/index.ts",
  "position": { "line": 1, "character": 17 },
  "hover": { "contents": "function sumTo(n: number): number" },
  "definitions": [
    { "filePath": "src/index.ts", "range": { "start": { "line": 1, "character": 16 }, "end": { "line": 1, "character": 21 } } }
  ],
  "references": {
    "referenceCount": 2,
    "returned": 2,
    "truncated": false,
    "items": [
      { "filePath": "src/index.ts", "range": { ... } }
    ]
  },
  "enclosingSymbols": [
    { "name": "sumTo", "kind": "function", "range": { ... } }
  ],
  "riskHints": [
    "Symbol has references in src/index.ts.",
    "Symbol appears to be exported."
  ]
}
```

**Sub-call order (shortest timeout first):**

| # | Method | Timeout |
|---|---|---|
| 1 | `textDocument/hover` | 3000ms |
| 2 | `textDocument/definition` | 5000ms |
| 3 | `textDocument/references` | 10000ms |
| 4 | `textDocument/documentSymbol` | 5000ms |

If any sub-call fails, the composite returns partial results with a `warnings` field listing the failures.

**Risk hint rules:**

| Condition | Hint |
|---|---|
| References across multiple files | "Symbol has references across multiple files." |
| References in a single file | "Symbol has references in `<file>`." |
| No references | "Symbol has no references." |
| Definition outside current file | "Definition is outside current file." |
| Enclosing symbol is `class`/`interface` | "Symbol appears inside a public class/interface." |
| No enclosing symbol (top-level) | "Symbol appears to be exported." |

---

## Error Handling

Every tool returns errors in a uniform envelope:

```json
{
  "error": {
    "code": "path_outside_workspace",
    "message": "Path is outside workspace: /etc/passwd",
    "details": {}
  }
}
```

**Well-known error codes:**

| Code | Trigger |
|---|---|
| `path_outside_workspace` | `filePath` does not resolve inside `WORKSPACE_PATH` |
| `unsupported_language` | File extension has no registered LSP server |
| `file_not_found` | File does not exist on disk |
| `lsp_server_unavailable` | Language server binary not on `$PATH` |
| `lsp_request_failed` | LSP request returned an error or exception |
| `lsp_request_timeout` | LSP request exceeded its deadline |
| `lsp_capability_unsupported` | LSP server does not support the requested capability |

---

## Safety Model

The server is designed for **read-oriented** coding agents. It enforces:

| Guard | Mechanism |
|---|---|
| **Workspace containment** | `safeResolve` validates every file path against `WORKSPACE_PATH` using realpath resolution and relative-path checking |
| **No file writes** | `lsp_rename_preview` returns a `WorkspaceEdit` and diff but never calls `workspace/applyEdit` — mtime checks prove no writes occurred |
| **WorkspaceEdit validation** | All URIs in a `WorkspaceEdit` are validated: must be `file://` scheme, must resolve inside the workspace, must not be directories |
| **Result caps** | Diagnostics ≤ 500, references ≤ 200, workspace symbols ≤ 100 |
| **Timeouts** | Every LSP request has a per-method deadline (3s–10s) |
| **Structured errors** | All error paths return typed, machine-readable errors — no bare exceptions or undefined behavior |

---

## Development

```bash
# Type-check (no emit)
pnpm run typecheck

# Run directly with tsx (no build step)
pnpm run dev

# Build to dist/
pnpm run build

# Start the built artifact
WORKSPACE_PATH=./fixtures/sample-ts pnpm run start
```

### Project Conventions

- **Module system:** ESM (`"type": "module"`, `NodeNext` resolution)
- **TypeScript:** strict mode, target ES2022
- **Testing:** `node --test` (native test runner) with `tsx` for TypeScript
- **Formatting:** No formatter enforced (TS compiler is the primary gate)
- **Linting:** No ESLint configured — `tsc --noEmit` serves as the lint step

---

## Testing

### Unit Tests

```bash
pnpm test
```

73 tests across 11 suites: `toolErrors`, `asyncTimeout`, `paths`, `languageServers`, `normalize`, `diagnosticsCache`, `diagnosticsSummary`, `workspaceEdit`, `applyTextEdits`, `inspectSymbol`, `clampResults`.

### End-to-End Tests (per phase)

Each phase 4–9 has a dedicated E2E smoke test that spawns the built server and makes real LSP tool calls:

```bash
pnpm run e2e:phase-4   # hover + definition (TypeScript)
pnpm run e2e:phase-5   # references + symbols (TypeScript)
pnpm run e2e:phase-6   # diagnostics (TypeScript)
pnpm run e2e:phase-7   # rename preview (TypeScript)
pnpm run e2e:phase-8   # inspect symbol (TypeScript)
pnpm run e2e:phase-9   # all tools (Python)
```

### Acceptance Tests

```bash
pnpm run build
npx tsx scripts/acceptance.ts
```

Runs 4 groups against both fixtures:

| Group | Tests | Fixture |
|---|---|---|
| **Health** | Server availability, both LSP backends reachable | TypeScript |
| **TypeScript** | All 8 tools produce spec-shaped payloads | `fixtures/sample-ts/` |
| **Python** | All 6 tools produce spec-shaped payloads | `fixtures/sample-py/` |
| **Safety** | Path rejection, no-write proof, truncation, unsupported types | TypeScript |

All 4 groups must pass for the build to be considered shippable.

### Test Fixtures

| Fixture | Contents |
|---|---|
| `fixtures/sample-ts/` | TypeScript project: `src/index.ts` (imports `add`), `src/util.ts` (exports `add`) |
| `fixtures/sample-py/` | Python project: `src/hello.py` (exports `greet`, `add_numbers`), `src/usage.py` (imports + deliberate type mismatch) |

---

## Supported Languages

| Language | Extensions | Language Server | Language ID |
|---|---|---|---|
| TypeScript | `.ts`, `.tsx` | `typescript-language-server --stdio` | `typescript` |
| JavaScript | `.js`, `.jsx` | `typescript-language-server --stdio` | `typescript` |
| Python | `.py` | `pyright-langserver --stdio` | `python` |

Adding a new language requires:
1. An entry in `src/config/languageServers.ts` (extensions, command, args, languageId).
2. The language server binary on `$PATH`.
3. (Optional) a `waitConfig` entry in `src/lsp/diagnosticsCache.ts`.

---

## Troubleshooting

### `lsp_server_unavailable`

The language server binary is not on `$PATH`.

```bash
which typescript-language-server
which pyright-langserver
```

Install globally:

```bash
npm install -g typescript-language-server pyright
```

### `path_outside_workspace`

Ensure `WORKSPACE_PATH` is set to the root of the project you want to analyze and that all `filePath` arguments resolve inside it. Symlinks are resolved before containment is checked.

### No diagnostics returned

Diagnostics are cached from `publishDiagnostics` notifications, which the LSP server sends after files are opened. For a cold cache, use `workspaceWide: true` to trigger a warm-up pass, or call `lsp_diagnostics` with a specific `filePath` to open that file and wait for diagnostics (up to 2000ms).

### Rename preview returns `canRename: false`

Some language servers (notably Pyright) may return `null` from `prepareRename`. The tool handles this gracefully with `canRename: false` and a violation explaining why.

---

## Contributing

This is a V1 implementation. For bug reports, feature requests, or questions, open an issue on the repository.

Internal contribution flow:
1. Changes follow the 10-phase spec structure under `docs/mcp-lsp-v1/spec/`.
2. Each phase produces its own E2E test script.
3. `pnpm run typecheck && pnpm test` must pass before commit.
4. Acceptance tests (`scripts/acceptance.ts`) must remain green.

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history.

Current: **v0.1.0** — 10 MCP tools, TypeScript + Python support, safety model, acceptance suite (21/21).

---

## License

MIT

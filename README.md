# MCP LSP — Code Intelligence Server

<div align="center">

[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-stdio-orange)](https://modelcontextprotocol.io)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

</div>

A Model Context Protocol (MCP) stdio server that wraps language servers to expose a safe, read-oriented code-intelligence tool surface for coding agents. Supports TypeScript, JavaScript, Python, Go, and Rust.

**59 tools across four generations — semantic navigation, safe refactoring, deep understanding, and production operations.**

---

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Error Handling](#error-handling)
- [Safety Model](#safety-model)
- [Development](#development)
- [Testing](#testing)
- [Supported Languages](#supported-languages)
- [Troubleshooting](#troubleshooting)
- [Changelog](#changelog)
- [License](#license)

---

## Quick Start

```bash
# Prerequisites: install language servers
npm install -g typescript-language-server pyright
# Go and Rust: install gopls and rust-analyzer via your package manager

# Clone and install
git clone https://github.com/beruang/lsp-mcp.git
cd lsp-mcp
pnpm install

# Build
pnpm run build

# Point at a workspace and start
WORKSPACE_PATH=/path/to/your/project node dist/index.js
```

Connect any MCP client to the server's stdio transport.

---

## Prerequisites

| Dependency | Version | Purpose |
|---|---|---|
| **Node.js** | >= 20 | Runtime |
| **pnpm** | — | Package management |
| **`typescript-language-server`** | — | TypeScript/JavaScript LSP backend |
| **`pyright-langserver`** | — | Python LSP backend |
| **`gopls`** | — | Go LSP backend |
| **`rust-analyzer`** | — | Rust LSP backend |

Language servers must be on `$PATH`. The server checks availability via `lsp_list_supported_languages`.

---

## Installation

```bash
pnpm install
```

Dependencies: `@modelcontextprotocol/sdk`, `vscode-jsonrpc`, `vscode-languageserver-types`, `zod`, `diff`.

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `WORKSPACE_PATH` | No | `process.cwd()` | Absolute path to the workspace root |

### Runtime Config (V4)

| Variable | Default | Description |
|---|---|---|
| `LSP_MAX_REFERENCES` | 200 | Max references returned |
| `LSP_MAX_WORKSPACE_SYMBOLS` | 100 | Max workspace symbols |
| `LSP_MAX_DIAGNOSTICS` | 500 | Max diagnostics |
| `LSP_MAX_COMPLETION_ITEMS` | 50 | Max completion items |
| `LSP_MAX_CHANGED_FILES` | 100 | Max files in rename preview |
| `LSP_MAX_EDITS` | 1000 | Max edits in workspace edit |
| `LSP_MAX_CONTEXT_CHARACTERS` | 20000 | Max context characters |
| `LSP_TIMEOUT_HOVER_MS` | 3000 | Hover timeout |
| `LSP_TIMEOUT_DEFINITION_MS` | 5000 | Definition timeout |
| `LSP_TIMEOUT_REFERENCES_MS` | 10000 | References timeout |
| `LSP_REQUEST_LOG_MAX_ENTRIES` | 500 | Request log ring buffer size |
| `LSP_RAW_REQUEST_ENABLED` | false | Enable debug raw request tool |
| `LSP_VERBOSE_LOGGING` | false | Verbose logging |

Use `lsp_get_config` to inspect effective configuration and `lsp_update_runtime_config` to adjust limits, timeouts, cache TTLs, and debug flags at runtime (in-memory only).

---

## Architecture

```
src/
├── index.ts                          # Entry point — MCP server bootstrap
├── config/
│   ├── languageServers.ts            # Language server registry
│   ├── defaults.ts                   # Default runtime config values
│   ├── envConfig.ts                  # Environment variable parsing
│   └── runtimeConfig.ts              # In-memory config merge + validation
├── lsp/
│   ├── LspClient.ts                  # LSP connection: spawn, initialize, request, shutdown
│   ├── LspClientManager.ts           # Per-language client pool + state queries
│   ├── LspState.ts                   # 8-state machine with validated transitions
│   ├── capabilities.ts               # Server capabilities extraction
│   ├── diagnosticsCache.ts           # publishDiagnostics notification cache
│   ├── documentStore.ts              # didOpen/didChange state tracking
│   └── normalize.ts                  # LSP → normalized shape converters
├── mcp/
│   ├── registerTools.ts              # All 56 MCP tool registrations
│   ├── toolErrors.ts                 # Structured error envelope
│   └── schemas.ts                    # Zod schemas
├── navigation/                       # V3: declaration, typeDef, implementation, signatureHelp, completion
├── hierarchy/                        # V3: call hierarchy + type hierarchy (prepare, incoming/outgoing, super/subtypes)
├── workspaceEdit/                    # V2: parse, validate, preview workspace edits
├── codeActions/                      # V2: code action cache + normalization
├── diagnostics/                      # V2: snapshot store, compare, wait-for-diagnostics
├── context/                          # V3: enclosing symbol, symbol context, file outline
├── analysis/                         # V3: change impact, fix candidates, explain diagnostics
├── formatting/                       # V2: format + range format preview
├── refactor/                         # V2: prepare rename, organize imports
├── composite/                        # V1: diagnostics summary, inspect symbol
├── diff/                             # V1: applyTextEdits, workspaceEditToDiff
├── semantic/                         # V3: fixDiagnosticCandidates, explainDiagnostics, analyzeChangeImpact
├── documents/                        # V4: open, close, sync, save, list documents
├── ops/                              # V4: server status, restart, shutdown, readiness, liveness, workspace status
├── observability/                    # V4: request tracker, request log
├── cache/                            # V4: cache status + selective clearing
├── debug/                            # V4: raw request (disabled by default, method denylist)
├── safety/
│   ├── paths.ts                      # Workspace containment check
│   └── limits.ts                     # Truncation caps and timeouts
└── utils/
    ├── asyncTimeout.ts               # Promise race with timeout
    ├── uri.ts                        # URI ↔ path conversion
    ├── symbols.ts                    # Symbol kind normalization
    ├── ids.ts                        # ID generation
    ├── text.ts                       # Text utilities
    └── time.ts                       # Time utilities
```

---

## API Reference

Every tool returns either a **success payload** or a **structured error**:

```json
{
  "error": {
    "code": "path_outside_workspace",
    "message": "Human-readable description",
    "details": {}
  }
}
```

### V1 — Semantic Navigation (10 tools)

| Tool | Description |
|------|-------------|
| `lsp_health_check` | Server health and LSP capabilities |
| `lsp_hover` | `textDocument/hover` |
| `lsp_definition` | `textDocument/definition` |
| `lsp_references` | `textDocument/references` |
| `lsp_document_symbols` | `textDocument/documentSymbol` |
| `lsp_workspace_symbols` | `workspace/symbol` |
| `lsp_diagnostics` | Cached diagnostics (file or workspace-wide) |
| `lsp_diagnostics_summary` | Grouped diagnostics with root-cause heuristic |
| `lsp_rename_preview` | Preview rename via `WorkspaceEdit` + unified diff |
| `lsp_inspect_symbol` | Composite: hover + definitions + refs + risk hints |

### V2 — Safe Refactoring Preview (11 tools)

| Tool | Description |
|------|-------------|
| `lsp_prepare_rename` | `textDocument/prepareRename` |
| `lsp_code_actions_preview` | `textDocument/codeAction` with diff |
| `lsp_resolve_code_action` | Resolve cached code action |
| `lsp_format_preview` | `textDocument/formatting` with diff |
| `lsp_range_format_preview` | `textDocument/rangeFormatting` with diff |
| `lsp_organize_imports_preview` | `textDocument/organizeImports` with diff |
| `lsp_wait_for_diagnostics` | Wait for fresh diagnostics |
| `lsp_snapshot_diagnostics` | Named diagnostic snapshot |
| `lsp_compare_diagnostics` | Compare two diagnostic snapshots |
| `lsp_workspace_edit_preview` | Preview any `WorkspaceEdit` + diff |
| `lsp_validate_workspace_edit` | Validate `WorkspaceEdit` safety |

### V3 — Deep Understanding (14 tools)

| Tool | Description |
|------|-------------|
| `lsp_declaration` | `textDocument/declaration` |
| `lsp_type_definition` | `textDocument/typeDefinition` |
| `lsp_implementation` | `textDocument/implementation` |
| `lsp_signature_help` | `textDocument/signatureHelp` |
| `lsp_completion` | `textDocument/completion` |
| `lsp_prepare_call_hierarchy` | `textDocument/prepareCallHierarchy` |
| `lsp_incoming_calls` | `callHierarchy/incomingCalls` |
| `lsp_outgoing_calls` | `callHierarchy/outgoingCalls` |
| `lsp_prepare_type_hierarchy` | `textDocument/prepareTypeHierarchy` |
| `lsp_supertypes` | `typeHierarchy/supertypes` |
| `lsp_subtypes` | `typeHierarchy/subtypes` |
| `lsp_symbol_context` | Surrounding symbols at position |
| `lsp_enclosing_symbol` | Innermost enclosing symbol |
| `lsp_file_outline` | File-level symbol outline |
| `lsp_analyze_change_impact` | Cross-file impact analysis |
| `lsp_fix_diagnostic_candidates` | Multi-source fix suggestions |
| `lsp_explain_diagnostics` | Root-cause clustering |

### V4 — Production Operations (21 tools)

**Server Lifecycle:**
| Tool | Description |
|------|-------------|
| `lsp_server_status` | Runtime status for all configured language servers |
| `lsp_restart_server` | Restart a language server (reopens docs, clears diagnostics) |
| `lsp_shutdown_server` | Graceful shutdown with timeout |
| `lsp_list_supported_languages` | Configured languages, extensions, commands, binary availability |
| `lsp_get_capabilities` | Normalized LSP capabilities per language |

**Document Lifecycle:**
| Tool | Description |
|------|-------------|
| `lsp_open_document` | `textDocument/didOpen` |
| `lsp_close_document` | `textDocument/didClose` |
| `lsp_sync_document` | `textDocument/didChange` (auto-opens if not tracked) |
| `lsp_save_document` | `textDocument/didSave` notification |
| `lsp_list_open_documents` | All tracked open documents |

**Observability:**
| Tool | Description |
|------|-------------|
| `lsp_request_log` | LSP request history with filtering |
| `lsp_clear_request_log` | Clear request log entries |

**Cache Management:**
| Tool | Description |
|------|-------------|
| `lsp_cache_status` | Entry counts for all caches |
| `lsp_clear_caches` | Selective or full cache clearing |

**Configuration:**
| Tool | Description |
|------|-------------|
| `lsp_get_config` | Effective config (defaults → env → runtime) |
| `lsp_update_runtime_config` | In-memory config updates (limits, timeouts, cache, debug) |

**Health:**
| Tool | Description |
|------|-------------|
| `lsp_readiness` | Workspace + language server availability |
| `lsp_liveness` | Fast liveness + optional memory stats |

**Debug (disabled by default):**
| Tool | Description |
|------|-------------|
| `lsp_raw_request` | Raw LSP request with method denylist |

**Multi-Workspace Foundation (optional):**
| Tool | Description |
|------|-------------|
| `lsp_list_workspaces` | Known workspaces |
| `lsp_workspace_status` | Status for a specific workspace |

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

### Error Codes

| Code | Trigger |
|---|---|
| `path_outside_workspace` | `filePath` does not resolve inside `WORKSPACE_PATH` |
| `unsupported_language` | File extension has no registered LSP server |
| `file_not_found` | File does not exist on disk |
| `lsp_server_unavailable` | Language server binary not on `$PATH` |
| `lsp_server_not_initialized` | Server not initialized |
| `lsp_request_failed` | LSP request returned an error |
| `lsp_request_timeout` | LSP request exceeded its deadline |
| `lsp_capability_unsupported` | Server does not support the capability |
| `declaration_not_supported` | Server lacks declaration provider |
| `type_definition_not_supported` | Server lacks type definition provider |
| `implementation_not_supported` | Server lacks implementation provider |
| `signature_help_not_supported` | Server lacks signature help provider |
| `completion_not_supported` | Server lacks completion provider |
| `call_hierarchy_not_supported` | Server lacks call hierarchy provider |
| `call_hierarchy_item_not_found` | Hierarchy item ID not found |
| `call_hierarchy_item_expired` | Hierarchy item TTL expired |
| `type_hierarchy_not_supported` | Server lacks type hierarchy provider |
| `type_hierarchy_item_not_found` | Type hierarchy item ID not found |
| `type_hierarchy_item_expired` | Type hierarchy item TTL expired |
| `change_impact_analysis_incomplete` | Change impact partial results |
| `diagnostic_not_found` | Diagnostic index not found |
| `invalid_config_key` | Unknown config key in update |
| `invalid_config_value` | Invalid config value (e.g., negative limit) |
| `immutable_config_key` | Attempt to change workspacePath at runtime |
| `server_not_found` | Language not configured |
| `restart_rate_limited` | Too many restarts in window |
| `raw_request_disabled` | Debug tool is disabled |
| `method_denied` | LSP method blocked by denylist |
| `document_not_found` | Document not in open documents store |

---

## Safety Model

The server is designed for **read-oriented** coding agents:

| Guard | Mechanism |
|---|---|
| **Workspace containment** | Every file path validated against `WORKSPACE_PATH` |
| **No file writes** | All tools are read-only; `lsp_rename_preview` returns a diff but never applies edits |
| **Result caps** | All list results are truncated with configurable limits |
| **Timeouts** | Every LSP request has a per-method deadline |
| **Structured errors** | All errors use the uniform `{ error: { code, message, details } }` envelope |
| **Request log privacy** | Logs method, duration, status — never full file contents (unless verbose logging explicitly enabled) |
| **Method denylist** | `lsp_raw_request` blocks `workspace/applyEdit`, `workspace/executeCommand`, and other dangerous methods |
| **Restart rate limiting** | Max 3 restarts per 60s per language |
| **State machine validation** | Invalid LSP state transitions are logged and rejected |

---

## Development

```bash
pnpm run typecheck     # TypeScript type-check
pnpm run lint          # ESLint (zero warnings)
pnpm run lint:fix      # ESLint auto-fix
pnpm run dev           # Run with tsx (no build)
pnpm run build         # Build to dist/
pnpm run start         # Start built artifact
```

### Pre-commit Hook

[husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged):
1. `eslint --fix --max-warnings 0`
2. `pnpm run typecheck`
3. `pnpm run verify:decoupling`

### Conventions

- **Module system:** ESM (`"type": "module"`, `NodeNext`)
- **TypeScript:** strict, target ES2022
- **Testing:** `node --test` + `tsx`
- **Linting:** ESLint with `@typescript-eslint`, zero-warnings policy

---

## Testing

```bash
pnpm test              # All unit tests
npm run test:safety    # Safety tests
npm run test:integration  # Integration tests (requires language servers)
```

### Coverage

- **106+ tests** across unit, integration, and safety suites
- **5 languages:** TypeScript, JavaScript, Python, Go, Rust
- **V1-V3 regression:** all passing with every V4 change

---

## Supported Languages

| Language | Extensions | Language Server | Language ID |
|---|---|---|---|
| TypeScript | `.ts`, `.tsx` | `typescript-language-server --stdio` | `typescript` |
| JavaScript | `.js`, `.jsx` | `typescript-language-server --stdio` | `typescript` |
| Python | `.py` | `pyright-langserver --stdio` | `python` |
| Go | `.go` | `gopls` | `go` |
| Rust | `.rs` | `rust-analyzer` | `rust` |

Adding a language:
1. Entry in `src/config/languageServers.ts`
2. Binary on `$PATH`
3. Optional `waitConfig` in `src/lsp/diagnosticsCache.ts`

---

## Troubleshooting

### `lsp_server_unavailable`

```bash
which typescript-language-server pyright-langserver gopls rust-analyzer
npm install -g typescript-language-server pyright
```

Use `lsp_list_supported_languages` to check binary availability at runtime.

### `path_outside_workspace`

Set `WORKSPACE_PATH` to the project root. Symlinks are resolved before containment check.

### No diagnostics

Diagnostics are cached from `publishDiagnostics` notifications. For cold cache, use `lsp_diagnostics` with `workspaceWide: true` to trigger a warm-up pass, or `lsp_wait_for_diagnostics`.

### Stale diagnostics after external edit

Use `lsp_sync_document` to notify the LSP of changes, then `lsp_wait_for_diagnostics`. For bulk recovery, `lsp_restart_server` with `reopenDocuments: true`.

---

## Changelog

| Version | Focus | Tools |
|---|---|---|
| **V4** | Production operations | 21 tools — server lifecycle, document lifecycle, observability, cache, config, health, debug |
| **V3** | Deep understanding | 17 tools — hierarchy, type, signature, completion, impact analysis |
| **V2** | Safe refactoring | 11 tools — preview-first editing, diagnostics validation |
| **V1** | Semantic navigation | 10 tools — hover, definition, references, symbols, diagnostics |

---

## License

MIT

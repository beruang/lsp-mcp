# mcp-lsp-v1

A Model Context Protocol (MCP) stdio server that wraps language servers
(`typescript-language-server` and `pyright`) to expose a small, safe,
read-oriented code-intelligence tool surface for coding agents.

This repository is the V1 implementation described in `spec/version-1.md`.
It is being built in ten phases. This document tracks the V1 build state.

## Prerequisites

- **Node.js** >= 20 (project tested on Node 25)
- **pnpm** or **npm** for package management
- **`typescript-language-server`** on `$PATH` (used for `.ts`/`.tsx`/`.js`/`.jsx`)
- **`pyright-langserver`** on `$PATH` (used for `.py`)

Both language servers are not exercised until phase-2, but they are listed
here so downstream tooling (Claude Code, stdio testers) is ready to use.

## Install

```bash
pnpm install
```

## Dev (no build step)

```bash
pnpm run dev
```

This uses `tsx` to run `src/index.ts` directly. The server speaks MCP over
stdio; connect an MCP client to it.

## Build

```bash
pnpm run build
```

Produces `dist/index.js`.

## Start (built artifact)

```bash
pnpm run start
```

## Typecheck

```bash
pnpm run typecheck
```

## Test

```bash
pnpm test
```

Runs the unit tests with `node --test`.

## Configuration

The server reads one optional environment variable:

| Variable          | Purpose                                                |
| ----------------- | ------------------------------------------------------ |
| `WORKSPACE_PATH`  | Absolute path to the workspace root. Falls back to `process.cwd()` if unset or the path does not exist (a warning is logged to stderr). |

All file paths accepted by tools must resolve inside `WORKSPACE_PATH`.

## Changelog

- **v0.0.1** — project skeleton with stub `lsp_health_check` (phase-1).

import type { RuntimeConfig } from "./runtimeConfig.js";

export const DEFAULT_CONFIG: RuntimeConfig = {
  workspacePath: process.cwd(),

  limits: {
    maxReferences: 200,
    maxWorkspaceSymbols: 100,
    maxDiagnostics: 500,
    maxCompletionItems: 50,
    maxChangedFiles: 100,
    maxEdits: 1000,
    maxContextCharacters: 20000,
  },

  timeoutsMs: {
    hover: 3_000,
    definition: 5_000,
    references: 10_000,
    diagnostics: 10_000,
    renamePreview: 10_000,
    codeActions: 10_000,
    formatting: 5_000,
    callHierarchy: 10_000,
    typeHierarchy: 10_000,
    completion: 5_000,
    compositeAnalysis: 20_000,
  },

  caches: {
    codeActionTtlMs: 300_000,
    diagnosticSnapshotTtlMs: 600_000,
    callHierarchyTtlMs: 300_000,
    typeHierarchyTtlMs: 300_000,
    requestLogMaxEntries: 500,
  },

  debug: {
    rawRequestEnabled: false,
    includeRawLspResponses: false,
    verboseLogging: false,
  },
};

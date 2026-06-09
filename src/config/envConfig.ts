import type { RuntimeConfig } from "./runtimeConfig.js";
import { DEFAULT_CONFIG } from "./defaults.js";

function parseIntEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseBoolEnv(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const lower = raw.toLowerCase();
  if (lower === "true" || lower === "1") return true;
  if (lower === "false" || lower === "0") return false;
  return fallback;
}

export function loadEnvConfig(): Partial<RuntimeConfig> {
  const workspacePath = process.env.WORKSPACE_PATH;

  const overrides: Partial<RuntimeConfig> = {};

  if (workspacePath) {
    overrides.workspacePath = workspacePath;
  }

  overrides.limits = {
    maxReferences: parseIntEnv("LSP_MAX_REFERENCES", DEFAULT_CONFIG.limits.maxReferences),
    maxWorkspaceSymbols: parseIntEnv("LSP_MAX_WORKSPACE_SYMBOLS", DEFAULT_CONFIG.limits.maxWorkspaceSymbols),
    maxDiagnostics: parseIntEnv("LSP_MAX_DIAGNOSTICS", DEFAULT_CONFIG.limits.maxDiagnostics),
    maxCompletionItems: parseIntEnv("LSP_MAX_COMPLETION_ITEMS", DEFAULT_CONFIG.limits.maxCompletionItems),
    maxChangedFiles: parseIntEnv("LSP_MAX_CHANGED_FILES", DEFAULT_CONFIG.limits.maxChangedFiles),
    maxEdits: parseIntEnv("LSP_MAX_EDITS", DEFAULT_CONFIG.limits.maxEdits),
    maxContextCharacters: parseIntEnv("LSP_MAX_CONTEXT_CHARACTERS", DEFAULT_CONFIG.limits.maxContextCharacters),
  };

  overrides.timeoutsMs = {
    hover: parseIntEnv("LSP_TIMEOUT_HOVER_MS", DEFAULT_CONFIG.timeoutsMs.hover),
    definition: parseIntEnv("LSP_TIMEOUT_DEFINITION_MS", DEFAULT_CONFIG.timeoutsMs.definition),
    references: parseIntEnv("LSP_TIMEOUT_REFERENCES_MS", DEFAULT_CONFIG.timeoutsMs.references),
    diagnostics: parseIntEnv("LSP_TIMEOUT_DIAGNOSTICS_MS", DEFAULT_CONFIG.timeoutsMs.diagnostics),
    renamePreview: parseIntEnv("LSP_TIMEOUT_RENAME_MS", DEFAULT_CONFIG.timeoutsMs.renamePreview),
    codeActions: parseIntEnv("LSP_TIMEOUT_CODE_ACTIONS_MS", DEFAULT_CONFIG.timeoutsMs.codeActions),
    formatting: parseIntEnv("LSP_TIMEOUT_FORMATTING_MS", DEFAULT_CONFIG.timeoutsMs.formatting),
    callHierarchy: parseIntEnv("LSP_TIMEOUT_CALL_HIERARCHY_MS", DEFAULT_CONFIG.timeoutsMs.callHierarchy),
    typeHierarchy: parseIntEnv("LSP_TIMEOUT_TYPE_HIERARCHY_MS", DEFAULT_CONFIG.timeoutsMs.typeHierarchy),
    completion: parseIntEnv("LSP_TIMEOUT_COMPLETION_MS", DEFAULT_CONFIG.timeoutsMs.completion),
    compositeAnalysis: parseIntEnv("LSP_TIMEOUT_COMPOSITE_ANALYSIS_MS", DEFAULT_CONFIG.timeoutsMs.compositeAnalysis),
  };

  overrides.caches = {
    codeActionTtlMs: parseIntEnv("LSP_CACHE_CODE_ACTION_TTL_MS", DEFAULT_CONFIG.caches.codeActionTtlMs),
    diagnosticSnapshotTtlMs: parseIntEnv("LSP_CACHE_DIAGNOSTIC_SNAPSHOT_TTL_MS", DEFAULT_CONFIG.caches.diagnosticSnapshotTtlMs),
    callHierarchyTtlMs: parseIntEnv("LSP_CACHE_CALL_HIERARCHY_TTL_MS", DEFAULT_CONFIG.caches.callHierarchyTtlMs),
    typeHierarchyTtlMs: parseIntEnv("LSP_CACHE_TYPE_HIERARCHY_TTL_MS", DEFAULT_CONFIG.caches.typeHierarchyTtlMs),
    requestLogMaxEntries: parseIntEnv("LSP_REQUEST_LOG_MAX_ENTRIES", DEFAULT_CONFIG.caches.requestLogMaxEntries),
  };

  overrides.debug = {
    rawRequestEnabled: parseBoolEnv("LSP_RAW_REQUEST_ENABLED", DEFAULT_CONFIG.debug.rawRequestEnabled),
    includeRawLspResponses: parseBoolEnv("LSP_INCLUDE_RAW_LSP_RESPONSES", DEFAULT_CONFIG.debug.includeRawLspResponses),
    verboseLogging: parseBoolEnv("LSP_VERBOSE_LOGGING", DEFAULT_CONFIG.debug.verboseLogging),
  };

  return overrides;
}

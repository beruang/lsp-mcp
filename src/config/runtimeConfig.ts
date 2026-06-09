import { DEFAULT_CONFIG } from "./defaults.js";
import { loadEnvConfig } from "./envConfig.js";

export type RuntimeConfig = {
  workspacePath: string;

  limits: {
    maxReferences: number;
    maxWorkspaceSymbols: number;
    maxDiagnostics: number;
    maxCompletionItems: number;
    maxChangedFiles: number;
    maxEdits: number;
    maxContextCharacters: number;
  };

  timeoutsMs: {
    hover: number;
    definition: number;
    references: number;
    diagnostics: number;
    renamePreview: number;
    codeActions: number;
    formatting: number;
    callHierarchy: number;
    typeHierarchy: number;
    completion: number;
    compositeAnalysis: number;
  };

  caches: {
    codeActionTtlMs: number;
    diagnosticSnapshotTtlMs: number;
    callHierarchyTtlMs: number;
    typeHierarchyTtlMs: number;
    requestLogMaxEntries: number;
  };

  debug: {
    rawRequestEnabled: boolean;
    includeRawLspResponses: boolean;
    verboseLogging: boolean;
  };
};

const IMMUTABLE_KEYS: Set<string> = new Set(["workspacePath"]);

const VALID_TOP_KEYS: Set<string> = new Set([
  "limits",
  "timeoutsMs",
  "caches",
  "debug",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasImmutableKeys(update: Record<string, unknown>): string | null {
  for (const key of Object.keys(update)) {
    if (IMMUTABLE_KEYS.has(key)) return key;
  }
  return null;
}

function hasUnknownKeys(update: Record<string, unknown>): string | null {
  for (const key of Object.keys(update)) {
    if (!VALID_TOP_KEYS.has(key)) return key;
  }
  return null;
}

function validatePositiveNumbers(obj: Record<string, unknown>, path: string): string[] {
  const errors: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      errors.push(`${path}.${key}`);
    }
  }
  return errors;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const key of Object.keys(source)) {
    if (isObject(target[key]) && isObject(source[key])) {
      deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
    } else {
      target[key] = source[key];
    }
  }
}

let runtimeOverrides: Partial<RuntimeConfig> = {};

export function getEffectiveConfig(): RuntimeConfig {
  const envOverrides = loadEnvConfig();
  const merged = structuredClone(DEFAULT_CONFIG) as Record<string, unknown>;

  // Layer 1 → Layer 2: env overrides defaults
  deepMerge(merged, envOverrides as unknown as Record<string, unknown>);

  // Layer 3: runtime overrides top
  deepMerge(merged, runtimeOverrides as unknown as Record<string, unknown>);

  return merged as unknown as RuntimeConfig;
}

export type ConfigUpdateResult = {
  config: RuntimeConfig;
  rejected: string[];
};

export function updateRuntimeConfig(raw: Record<string, unknown>): ConfigUpdateResult {
  const rejected: string[] = [];

  const immutableKey = hasImmutableKeys(raw);
  if (immutableKey) {
    rejected.push(`immutable: ${immutableKey}`);
    delete raw[immutableKey];
  }

  const unknownKey = hasUnknownKeys(raw);
  if (unknownKey) {
    rejected.push(`unknown key: ${unknownKey}`);
    delete raw[unknownKey];
  }

  // Validate numeric sections are positive
  for (const section of ["limits", "timeoutsMs", "caches"] as const) {
    if (isObject(raw[section])) {
      const errors = validatePositiveNumbers(raw[section] as Record<string, unknown>, section);
      for (const err of errors) {
        rejected.push(`invalid value: ${err}`);
        delete (raw[section] as Record<string, unknown>)[err.split(".").pop()!];
      }
    }
  }

  // Validate debug section has boolean fields
  if (isObject(raw.debug)) {
    for (const [key, value] of Object.entries(raw.debug as Record<string, unknown>)) {
      if (typeof value !== "boolean") {
        rejected.push(`invalid value: debug.${key} (must be boolean)`);
        delete (raw.debug as Record<string, unknown>)[key];
      }
    }
  }

  // Merge valid parts into runtime overrides
  runtimeOverrides = {};
  deepMerge(runtimeOverrides as unknown as Record<string, unknown>, raw);

  return {
    config: getEffectiveConfig(),
    rejected,
  };
}

export function resetRuntimeConfig(): void {
  runtimeOverrides = {};
}

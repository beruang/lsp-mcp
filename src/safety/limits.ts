export const LIMITS = {
  REFERENCES_MAX: 200,
  WORKSPACE_SYMBOLS_MAX: 100,
  DIAGNOSTICS_MAX: 500,
  TIMEOUTS: {
    HOVER_MS: 3_000,
    DEFINITION_MS: 5_000,
    REFERENCES_MS: 10_000,
    DOCUMENT_SYMBOLS_MS: 5_000,
    WORKSPACE_SYMBOLS_MS: 10_000,
    RENAME_MS: 10_000,
    HEALTH_CHECK_MS: 5_000,
  },
} as const;

export function clampResults<T>(arr: T[], max: number): { items: T[]; truncated: boolean; returned: number } {
  if (arr.length <= max) {
    return { items: arr, truncated: false, returned: arr.length };
  }
  return { items: arr.slice(0, max), truncated: true, returned: max };
}
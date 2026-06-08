/**
 * Single source of truth for the structured tool-error envelope.
 *
 * Every tool in this MCP server returns either a successful payload or a
 * `ToolError` value (per spec §9.5). Keep the shape here so later phases can
 * share the same envelope without re-declaring it.
 */
export interface ToolError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Build a `ToolError` envelope.
 *
 * @param code     short machine-readable code (e.g. `"workspace_not_found"`)
 * @param message  human-readable description
 * @param details  optional structured context for the error
 */
export function toolError(
  code: string,
  message: string,
  details?: unknown
): ToolError {
  const envelope: ToolError = {
    error: {
      code,
      message,
    },
  };
  if (details !== undefined) {
    envelope.error.details = details;
  }
  return envelope;
}

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

/**
 * Well-known error codes used across the tool layer.
 */
export const ErrorCodes = {
  PATH_OUTSIDE_WORKSPACE: "path_outside_workspace",
  UNSUPPORTED_LANGUAGE: "unsupported_language",
  FILE_NOT_FOUND: "file_not_found",
  LSP_SERVER_UNAVAILABLE: "lsp_server_unavailable",
  LSP_SERVER_NOT_INITIALIZED: "lsp_server_not_initialized",
  LSP_REQUEST_FAILED: "lsp_request_failed",
  LSP_REQUEST_TIMEOUT: "lsp_request_timeout",
  LSP_CAPABILITY_UNSUPPORTED: "lsp_capability_unsupported",
} as const;

/**
 * Build a ToolError from an arbitrary cause.
 * Uses the well-known codes when the cause matches known error types.
 */
export function toolErrorFromCause(cause: unknown): ToolError {
  if (cause instanceof Error) {
    const msg = cause.message;
    if (msg.includes("not found on PATH")) {
      return toolError(ErrorCodes.LSP_SERVER_UNAVAILABLE, msg);
    }
    if (msg.includes("Path is outside workspace")) {
      return toolError(ErrorCodes.PATH_OUTSIDE_WORKSPACE, msg);
    }
    return toolError("internal_error", msg);
  }
  return toolError("internal_error", String(cause));
}

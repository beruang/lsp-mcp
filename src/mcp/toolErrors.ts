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
  // V3
  DECLARATION_NOT_SUPPORTED: "declaration_not_supported",
  TYPE_DEFINITION_NOT_SUPPORTED: "type_definition_not_supported",
  IMPLEMENTATION_NOT_SUPPORTED: "implementation_not_supported",
  SIGNATURE_HELP_NOT_SUPPORTED: "signature_help_not_supported",
  COMPLETION_NOT_SUPPORTED: "completion_not_supported",
  CALL_HIERARCHY_NOT_SUPPORTED: "call_hierarchy_not_supported",
  CALL_HIERARCHY_ITEM_NOT_FOUND: "call_hierarchy_item_not_found",
  CALL_HIERARCHY_ITEM_EXPIRED: "call_hierarchy_item_expired",
  TYPE_HIERARCHY_NOT_SUPPORTED: "type_hierarchy_not_supported",
  TYPE_HIERARCHY_ITEM_NOT_FOUND: "type_hierarchy_item_not_found",
  TYPE_HIERARCHY_ITEM_EXPIRED: "type_hierarchy_item_expired",
  CHANGE_IMPACT_ANALYSIS_INCOMPLETE: "change_impact_analysis_incomplete",
  DIAGNOSTIC_NOT_FOUND: "diagnostic_not_found",
  // V4
  INVALID_CONFIG_KEY: "invalid_config_key",
  INVALID_CONFIG_VALUE: "invalid_config_value",
  IMMUTABLE_CONFIG_KEY: "immutable_config_key",
  SERVER_NOT_FOUND: "server_not_found",
  RESTART_RATE_LIMITED: "restart_rate_limited",
  SERVER_ALREADY_STOPPED: "server_already_stopped",
  SERVER_NOT_RUNNING: "server_not_running",
  RAW_REQUEST_DISABLED: "raw_request_disabled",
  METHOD_DENIED: "method_denied",
  DOCUMENT_NOT_FOUND: "document_not_found",
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

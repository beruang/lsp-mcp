import { z } from "zod";

/**
 * LSP `Position` (zero-based line + UTF-16 character offset).
 * See spec §9.1.
 */
export const PositionSchema = z.object({
  line: z.number().int().nonnegative(),
  character: z.number().int().nonnegative(),
});

/**
 * LSP `Range` built from two `Position` values.
 * See spec §9.2.
 */
export const RangeSchema = z.object({
  start: PositionSchema,
  end: PositionSchema,
});

// ── V2 shared types ─────────────────────────────────────────────────────────

export const TextEditSchema = z.object({
  range: RangeSchema,
  newText: z.string(),
});

export const WorkspaceEditInputSchema = z.object({
  changes: z.record(z.string(), z.array(TextEditSchema)).optional(),
  documentChanges: z.array(
    z.object({
      textDocument: z.object({
        uri: z.string(),
        version: z.number().optional(),
      }).optional(),
      edits: z.array(TextEditSchema).optional(),
      kind: z.string().optional(),
    }).passthrough()
  ).optional(),
});

// ── V2 tool schemas ─────────────────────────────────────────────────────────

export const WorkspaceEditPreviewInputSchema = z.object({
  workspaceEdit: WorkspaceEditInputSchema.describe("Raw LSP WorkspaceEdit to preview."),
  includeDiff: z.boolean().default(true).describe("Whether to include a unified diff."),
  maxFiles: z.number().int().positive().optional().describe("Max changed files before rejection."),
  maxEdits: z.number().int().positive().optional().describe("Max edits before rejection."),
});

export const ValidateWorkspaceEditInputSchema = z.object({
  workspaceEdit: WorkspaceEditInputSchema.describe("Raw LSP WorkspaceEdit to validate."),
  maxFiles: z.number().int().positive().optional().describe("Max changed files before rejection."),
  maxEdits: z.number().int().positive().optional().describe("Max edits before rejection."),
});

// ── Phase 4: Prepare Rename ─────────────────────────────────────────────────

export const PrepareRenameInputSchema = z.object({
  filePath: z.string().describe("Absolute or workspace-relative path to the file."),
  position: PositionSchema.describe("Line/character position (zero-based) of the symbol to check."),
});

// ── Phase 6: Resolve Code Action ────────────────────────────────────────────

export const ResolveCodeActionInputSchema = z.object({
  actionId: z.string().describe("Cached action ID from lsp_code_actions_preview."),
  includeDiff: z.boolean().default(true).describe("Whether to include a unified diff."),
});

// ── Phase 7: Formatting ─────────────────────────────────────────────────────

export const FormatPreviewInputSchema = z.object({
  filePath: z.string().describe("Absolute or workspace-relative path to the file."),
  tabSize: z.number().int().positive().default(2).describe("Tab size for formatting."),
  insertSpaces: z.boolean().default(true).describe("Use spaces instead of tabs."),
  includeDiff: z.boolean().default(true).describe("Whether to include a unified diff."),
});

export const RangeFormatPreviewInputSchema = z.object({
  filePath: z.string().describe("Absolute or workspace-relative path to the file."),
  range: z.object({
    start: PositionSchema,
    end: PositionSchema,
  }).describe("Range to format."),
  tabSize: z.number().int().positive().default(2).describe("Tab size for formatting."),
  insertSpaces: z.boolean().default(true).describe("Use spaces instead of tabs."),
  includeDiff: z.boolean().default(true).describe("Whether to include a unified diff."),
});

// ── Phase 8: Organize Imports Preview ───────────────────────────────────────

export const OrganizeImportsPreviewInputSchema = z.object({
  filePath: z.string().describe("Absolute or workspace-relative path to the file."),
  includeDiff: z.boolean().default(true).describe("Whether to include a unified diff."),
});

// ── Phase 9: Diagnostics Synchronization ────────────────────────────────────

export const WaitForDiagnosticsInputSchema = z.object({
  filePath: z.string().optional().describe("File path to wait for diagnostics on."),
  workspaceWide: z.boolean().default(false).describe("Wait for any diagnostic event workspace-wide."),
  timeoutMs: z.number().int().positive().default(5000).describe("Maximum wait time in milliseconds."),
  settleMs: z.number().int().nonnegative().default(250).describe("Quiet period after first diagnostic event."),
});

// ── Phase 10: Diagnostics Snapshots ────────────────────────────────────────

export const SnapshotDiagnosticsInputSchema = z.object({
  name: z.string().optional().describe("Optional label for this snapshot."),
  filePath: z.string().optional().describe("Filter to a single file. Omit for all diagnostics."),
});

export const CompareDiagnosticsInputSchema = z.object({
  beforeId: z.string().describe("Snapshot ID to compare from."),
  afterId: z.string().describe("Snapshot ID to compare to."),
});

// ── Phase 5: Code Actions Preview ───────────────────────────────────────────

export const CodeActionsPreviewInputSchema = z.object({
  filePath: z.string().describe("Absolute or workspace-relative path to the file."),
  range: z.object({
    start: PositionSchema,
    end: PositionSchema,
  }).optional().describe("Selection range. If omitted, uses whole file for source actions."),
  only: z.array(z.string()).optional().describe("Filter by code action kinds (e.g. quickfix, refactor, source)."),
  diagnosticIndexes: z.array(z.number().int().nonnegative()).optional().describe("Indexes of diagnostics from the cache to target."),
  maxActions: z.number().int().positive().default(20).describe("Maximum number of actions to return."),
  includeDiff: z.boolean().default(true).describe("Whether to include diffs for edit actions."),
});

// ── V3 tool schemas ─────────────────────────────────────────────────────────

export const DeclarationInputSchema = z.object({
  filePath: z.string().describe("Absolute or workspace-relative path to the file."),
  position: PositionSchema.describe("Line/character position (zero-based) of the symbol."),
  maxResults: z.number().int().positive().default(50).describe("Maximum number of results."),
});

export const TypeDefinitionInputSchema = z.object({
  filePath: z.string().describe("Absolute or workspace-relative path to the file."),
  position: PositionSchema.describe("Line/character position (zero-based) of the symbol."),
  maxResults: z.number().int().positive().default(50).describe("Maximum number of results."),
});

export const ImplementationInputSchema = z.object({
  filePath: z.string().describe("Absolute or workspace-relative path to the file."),
  position: PositionSchema.describe("Line/character position (zero-based) of the symbol."),
  maxResults: z.number().int().positive().default(100).describe("Maximum number of results."),
});

export const SignatureHelpInputSchema = z.object({
  filePath: z.string().describe("Absolute or workspace-relative path to the file."),
  position: PositionSchema.describe("Line/character position (zero-based) at the call site."),
});

export const CompletionInputSchema = z.object({
  filePath: z.string().describe("Absolute or workspace-relative path to the file."),
  position: PositionSchema.describe("Line/character position (zero-based) for completion."),
  maxResults: z.number().int().positive().default(50).describe("Maximum number of completion items."),
  includeDocumentation: z.boolean().default(false).describe("Include documentation in completion items."),
  includeInsertText: z.boolean().default(false).describe("Include insert text in completion items."),
});

export const PrepareCallHierarchyInputSchema = z.object({
  filePath: z.string().describe("Absolute or workspace-relative path to the file."),
  position: PositionSchema.describe("Line/character position (zero-based) of the symbol."),
  maxItems: z.number().int().positive().default(10).describe("Maximum number of hierarchy items."),
});

export const IncomingCallsInputSchema = z.object({
  itemId: z.string().describe("Opaque item ID from lsp_prepare_call_hierarchy."),
  maxResults: z.number().int().positive().default(100).describe("Maximum number of calls."),
});

export const OutgoingCallsInputSchema = z.object({
  itemId: z.string().describe("Opaque item ID from lsp_prepare_call_hierarchy."),
  maxResults: z.number().int().positive().default(100).describe("Maximum number of calls."),
});

// ── V3: Type Hierarchy ─────────────────────────────────────────────────────

export const PrepareTypeHierarchyInputSchema = z.object({
  filePath: z.string().describe("Absolute or workspace-relative path to the file."),
  position: PositionSchema.describe("Line/character position (zero-based) of the symbol."),
  maxItems: z.number().int().positive().default(10).describe("Maximum number of hierarchy items."),
});

export const TypeHierarchyInputSchema = z.object({
  itemId: z.string().describe("Opaque item ID from lsp_prepare_type_hierarchy."),
  maxResults: z.number().int().positive().default(100).describe("Maximum number of results."),
});

// ── V3: Diagnostic Intelligence ─────────────────────────────────────────────

export const FixDiagnosticCandidatesInputSchema = z.object({
  filePath: z.string().describe("Absolute or workspace-relative path to the file."),
  diagnosticIndex: z.number().int().nonnegative().optional().describe("0-based index of diagnostic in the file."),
  diagnosticCode: z.union([z.string(), z.number()]).optional().describe("Diagnostic code to match."),
  range: z.object({
    start: PositionSchema,
    end: PositionSchema,
  }).optional().describe("Range to find intersecting diagnostic."),
  includeCodeActions: z.boolean().default(true).describe("Include LSP code actions."),
  includeHover: z.boolean().default(true).describe("Include hover information."),
  includeDefinition: z.boolean().default(true).describe("Include definition locations."),
  includeSignatureHelp: z.boolean().default(true).describe("Include signature help."),
});

// ── V3: Change Impact ──────────────────────────────────────────────────────

export const AnalyzeChangeImpactInputSchema = z.object({
  filePath: z.string().describe("Absolute or workspace-relative path to the file."),
  position: PositionSchema.describe("Line/character position (zero-based) of the symbol."),
  changeKind: z.enum(["rename", "signature_change", "behavior_change", "type_change", "visibility_change", "delete_symbol", "move_symbol", "unknown"]).default("unknown").describe("Type of change being considered."),
  maxReferences: z.number().int().positive().default(200).describe("Maximum references to inspect."),
  includeCallers: z.boolean().default(true).describe("Include incoming call hierarchy."),
  includeCallees: z.boolean().default(true).describe("Include outgoing call hierarchy."),
  includeImplementations: z.boolean().default(true).describe("Include implementation locations."),
});

export const ExplainDiagnosticsInputSchema = z.object({
  filePath: z.string().optional().describe("Filter diagnostics to a single file. Omit for workspace-wide."),
  workspaceWide: z.boolean().default(true).describe("Include all files when true."),
  maxDiagnostics: z.number().int().positive().default(20).describe("Maximum root cause candidates."),
  includeFixCandidates: z.boolean().default(false).describe("Include fix candidates for top diagnostics."),
});

// ── V4: Runtime Config ──────────────────────────────────────────────────────

export const GetConfigInputSchema = z.object({
  includeDefaults: z.boolean().default(true).describe("Include default config values."),
  includeEnv: z.boolean().default(true).describe("Include environment variable overrides."),
});

export const UpdateRuntimeConfigInputSchema = z.object({
  config: z.object({
    limits: z.object({
      maxReferences: z.number().int().positive().optional(),
      maxWorkspaceSymbols: z.number().int().positive().optional(),
      maxDiagnostics: z.number().int().positive().optional(),
      maxCompletionItems: z.number().int().positive().optional(),
      maxChangedFiles: z.number().int().positive().optional(),
      maxEdits: z.number().int().positive().optional(),
      maxContextCharacters: z.number().int().positive().optional(),
    }).optional(),
    timeoutsMs: z.object({
      hover: z.number().int().positive().optional(),
      definition: z.number().int().positive().optional(),
      references: z.number().int().positive().optional(),
      diagnostics: z.number().int().positive().optional(),
      renamePreview: z.number().int().positive().optional(),
      codeActions: z.number().int().positive().optional(),
      formatting: z.number().int().positive().optional(),
      callHierarchy: z.number().int().positive().optional(),
      typeHierarchy: z.number().int().positive().optional(),
      completion: z.number().int().positive().optional(),
      compositeAnalysis: z.number().int().positive().optional(),
    }).optional(),
    caches: z.object({
      codeActionTtlMs: z.number().int().positive().optional(),
      diagnosticSnapshotTtlMs: z.number().int().positive().optional(),
      callHierarchyTtlMs: z.number().int().positive().optional(),
      typeHierarchyTtlMs: z.number().int().positive().optional(),
      requestLogMaxEntries: z.number().int().positive().optional(),
    }).optional(),
    debug: z.object({
      rawRequestEnabled: z.boolean().optional(),
      includeRawLspResponses: z.boolean().optional(),
      verboseLogging: z.boolean().optional(),
    }).optional(),
  }).describe("Partial runtime config. Immutable keys (workspacePath) are rejected."),
});

// ── V4: Server Operations ───────────────────────────────────────────────────

export const ServerStatusInputSchema = z.object({
  language: z.string().optional().describe("Filter to a specific language. Omit for all."),
});

export const RestartServerInputSchema = z.object({
  language: z.string().describe("Language server to restart (e.g., typescript, python)."),
  reopenDocuments: z.boolean().default(true).describe("Re-open tracked documents after restart."),
  shutdownTimeoutMs: z.number().int().positive().default(5000).describe("Max wait for shutdown before force kill."),
});

export const ShutdownServerInputSchema = z.object({
  language: z.string().describe("Language server to shut down (e.g., typescript, python)."),
  forceTimeoutMs: z.number().int().positive().default(5000).describe("Max wait for graceful shutdown before force kill."),
});

export const ListSupportedLanguagesInputSchema = z.object({});

export const GetCapabilitiesInputSchema = z.object({
  language: z.string().describe("Language to query capabilities for."),
  startIfNeeded: z.boolean().default(false).describe("Initialize the server if not already running."),
});

// ── V4: Document Lifecycle ──────────────────────────────────────────────────

export const OpenDocumentInputSchema = z.object({
  filePath: z.string().describe("Absolute or workspace-relative path to the file."),
  language: z.string().describe("Language server to use (e.g., typescript, python)."),
  text: z.string().optional().describe("File content. Reads from disk if omitted."),
});

export const CloseDocumentInputSchema = z.object({
  filePath: z.string().describe("Absolute or workspace-relative path to the file."),
  language: z.string().describe("Language server to use."),
});

export const SyncDocumentInputSchema = z.object({
  filePath: z.string().describe("Absolute or workspace-relative path to the file."),
  language: z.string().describe("Language server to use."),
  text: z.string().optional().describe("New file content. Reads from disk if omitted."),
});

export const SaveDocumentInputSchema = z.object({
  filePath: z.string().describe("Absolute or workspace-relative path to the file."),
  language: z.string().describe("Language server to use."),
  text: z.string().optional().describe("Saved file content for LSP notification."),
});

export const ListOpenDocumentsInputSchema = z.object({
  language: z.string().optional().describe("Filter to a specific language. Omit for all."),
});

// ── V4: Observability ───────────────────────────────────────────────────────

export const RequestLogInputSchema = z.object({
  language: z.string().optional().describe("Filter by language."),
  method: z.string().optional().describe("Filter by LSP method name."),
  status: z.enum(["ok", "error", "timeout", "cancelled"]).optional().describe("Filter by request status."),
  limit: z.number().int().positive().default(50).describe("Maximum entries to return (most recent)."),
  since: z.string().optional().describe("ISO timestamp — only return entries after this time."),
});

export const ClearRequestLogInputSchema = z.object({
  language: z.string().optional().describe("Clear only entries for this language."),
  method: z.string().optional().describe("Clear only entries for this method."),
  status: z.enum(["ok", "error", "timeout", "cancelled"]).optional().describe("Clear only entries with this status."),
});

// ── V4: Cache Management ────────────────────────────────────────────────────

export const CacheStatusInputSchema = z.object({});

export const ClearCachesInputSchema = z.object({
  caches: z.array(z.string()).optional().describe("Cache names to clear. Omit or empty to clear all."),
});

// ── V4: Health ──────────────────────────────────────────────────────────────

export const ReadinessInputSchema = z.object({
  initServers: z.boolean().default(false).describe("Initialize configured language servers if not already running."),
  language: z.string().optional().describe("Check a specific language server only."),
});

export const LivenessInputSchema = z.object({
  includeMemory: z.boolean().default(false).describe("Include memory usage statistics."),
});

// ── V4: Debug ───────────────────────────────────────────────────────────────

export const RawRequestInputSchema = z.object({
  language: z.string().describe("Language server to send the request to."),
  method: z.string().describe("LSP method name (e.g., textDocument/hover)."),
  params: z.record(z.string(), z.unknown()).optional().describe("LSP request parameters."),
});

// ── V4: Multi-Workspace Foundation (optional) ───────────────────────────────

export const ListWorkspacesInputSchema = z.object({});

export const WorkspaceStatusInputSchema = z.object({
  workspacePath: z.string().describe("Absolute path to the workspace to query."),
});

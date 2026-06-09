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

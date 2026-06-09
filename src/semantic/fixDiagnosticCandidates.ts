import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { LspClientManager } from "../lsp/LspClientManager.js";
import { safeResolve } from "../safety/paths.js";
import { routeLanguage } from "../config/languageServers.js";
import { fileToUri } from "../lsp/normalize.js";
import { ensureOpen } from "../lsp/documentStore.js";
import { diagnosticsCache } from "../lsp/diagnosticsCache.js";
import { LIMITS } from "../safety/limits.js";
import { toolError, ErrorCodes } from "../mcp/toolErrors.js";

export interface FixDiagnosticCandidatesInput {
  filePath: string;
  diagnosticIndex?: number;
  diagnosticCode?: string | number;
  range?: { start: { line: number; character: number }; end: { line: number; character: number } };
  includeCodeActions?: boolean;
  includeHover?: boolean;
  includeDefinition?: boolean;
  includeSignatureHelp?: boolean;
}

export async function fixDiagnosticCandidates(
  clientManager: LspClientManager,
  workspacePath: string,
  input: FixDiagnosticCandidatesInput
) {
  const { filePath, diagnosticIndex, diagnosticCode, range } = input;
  const includeCodeActions = input.includeCodeActions ?? true;
  const includeHover = input.includeHover ?? true;
  const includeDefinition = input.includeDefinition ?? true;
  const includeSignatureHelp = input.includeSignatureHelp ?? true;

  // Validate path
  let resolvedPath: string;
  try { resolvedPath = await safeResolve(workspacePath, filePath); } catch {
    return { error: toolError(ErrorCodes.PATH_OUTSIDE_WORKSPACE, `Path outside workspace: ${filePath}`) };
  }

  const ext = extname(resolvedPath);
  const lang = routeLanguage(ext);
  if (!lang) return { error: toolError(ErrorCodes.UNSUPPORTED_LANGUAGE, `No LSP server for: ${ext}`) };

  try { await stat(resolvedPath); } catch {
    return { error: toolError(ErrorCodes.FILE_NOT_FOUND, `File not found: ${resolvedPath}`) };
  }

  const rootUri = fileToUri(workspacePath);
  const client = await clientManager.getClientForLanguage(lang, { workspacePath, rootUri });
  if (!client) return { error: toolError(ErrorCodes.LSP_SERVER_UNAVAILABLE, `No LSP server for: ${lang}`) };

  const { uri } = await ensureOpen(client, resolvedPath, lang);

  // Get diagnostics
  const allDiags = diagnosticsCache.all();
  let diagnostics = allDiags.filter(d => d.filePath === resolvedPath);

  if (diagnostics.length === 0) {
    // Try fetching fresh
    await client.request("textDocument/diagnostic", { textDocument: { uri } }, LIMITS.TIMEOUTS.HOVER_MS).catch(() => {});
    diagnostics = diagnosticsCache.all().filter(d => d.filePath === resolvedPath);
  }

  if (diagnostics.length === 0) {
    return { error: toolError(ErrorCodes.DIAGNOSTIC_NOT_FOUND, "No diagnostics found for file") };
  }

  // Select diagnostic
  let selected: typeof diagnostics[0] | undefined;
  if (diagnosticIndex !== undefined) {
    selected = diagnostics[diagnosticIndex];
  } else if (diagnosticCode !== undefined) {
    selected = diagnostics.find(d => d.code === diagnosticCode);
  } else if (range) {
    selected = diagnostics.find(d => {
      const r = d.range;
      return r.start.line <= range.start.line && r.end.line >= range.end.line;
    });
  } else {
    selected = diagnostics[0];
  }

  if (!selected) {
    return { error: toolError(ErrorCodes.DIAGNOSTIC_NOT_FOUND, "No diagnostic matched selection criteria") };
  }

  const diagPosition = {
    line: selected.range.start.line,
    character: selected.range.start.character,
  };

  const result: Record<string, unknown> = {
    diagnostic: selected,
  };

  // Collect LSP data based on flags
  if (includeHover) {
    try {
      const raw = await client.request("textDocument/hover", { textDocument: { uri }, position: diagPosition }, LIMITS.TIMEOUTS.HOVER_MS) as any;
      const { hoverToString } = await import("../lsp/normalize.js");
      result.hover = hoverToString(raw).contents;
    } catch { result.hover = null; }
  }

  if (includeDefinition) {
    try {
      const raw = await client.request("textDocument/definition", { textDocument: { uri }, position: diagPosition }, LIMITS.TIMEOUTS.DEFINITION_MS) as any;
      const { locationFromLsp } = await import("../lsp/normalize.js");
      const locs: unknown[] = [];
      if (Array.isArray(raw)) {
        for (const item of raw) { const loc = locationFromLsp(workspacePath, item); if (loc) locs.push(loc); }
      } else if (raw) {
        const loc = locationFromLsp(workspacePath, raw); if (loc) locs.push(loc);
      }
      result.definitions = locs;
    } catch { result.definitions = []; }
  }

  if (includeSignatureHelp) {
    try {
      const raw = await client.request("textDocument/signatureHelp", { textDocument: { uri }, position: diagPosition }, LIMITS.TIMEOUTS.SIGNATURE_HELP_MS) as any;
      if (raw?.signatures) {
        result.signatureHelp = {
          filePath: resolvedPath,
          position: diagPosition,
          signatures: raw.signatures.map((s: any) => ({
            label: s.label ?? "",
            documentation: typeof s.documentation === "string" ? s.documentation : s.documentation?.value,
            parameters: (s.parameters ?? []).map((p: any) => ({
              label: typeof p.label === "string" ? p.label : Array.isArray(p.label) ? `[${p.label[0]}..${p.label[1]}]` : String(p.label),
              documentation: typeof p.documentation === "string" ? p.documentation : p.documentation?.value,
            })),
          })),
          activeSignature: raw.activeSignature,
          activeParameter: raw.activeParameter,
        };
      }
    } catch { /* optional */ }
  }

  if (includeCodeActions) {
    try {
      const raw = await client.request("textDocument/codeAction", {
        textDocument: { uri },
        range: selected.range,
        context: { diagnostics: [selected] },
      }, 5000) as any;
      if (Array.isArray(raw)) {
        result.codeActions = raw.map((a: any) => ({
          title: a.title ?? "",
          kind: a.kind,
          isPreferred: a.isPreferred,
          disabled: a.disabled,
          hasEdit: !!a.edit,
          hasCommand: !!a.command,
        }));
      }
    } catch { result.codeActions = []; }
  }

  // Generate suggested approach
  const approach: string[] = [];
  if (result.codeActions && Array.isArray(result.codeActions) && result.codeActions.length > 0) {
    approach.push("Code actions are available — use lsp_code_actions_preview for safe edit previews.");
  }
  if (result.signatureHelp) {
    approach.push("Signature help is available — compare call-site arguments against active signature.");
  }
  if (result.definitions && Array.isArray(result.definitions) && result.definitions.length > 0) {
    approach.push("Definition found — inspect definition before changing call site.");
  }
  if (approach.length === 0) {
    approach.push("Use diagnostics message and LSP hover/type data to guide manual edit externally.");
  }
  result.suggestedApproach = approach;

  return result;
}

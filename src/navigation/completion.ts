import { LspClient } from "../lsp/LspClient.js";
import { clampResults, LIMITS } from "../safety/limits.js";

export interface NormalizedCompletionItem {
  label: string;
  kind?: string;
  detail?: string;
  documentation?: string;
  deprecated?: boolean;
  sortText?: string;
  filterText?: string;
  insertText?: string;
  hasAdditionalTextEdits: boolean;
}

const CompletionItemKindNames: Record<number, string> = {
  1: "text", 2: "method", 3: "function", 4: "constructor", 5: "field",
  6: "variable", 7: "class", 8: "interface", 9: "module", 10: "property",
  11: "unit", 12: "value", 13: "enum", 14: "keyword", 15: "snippet",
  16: "color", 17: "file", 18: "reference", 19: "folder", 20: "enumMember",
  21: "constant", 22: "struct", 23: "event", 24: "operator", 25: "typeParameter",
};

function completionKindToString(kind: number | undefined): string | undefined {
  if (kind === undefined) return undefined;
  return CompletionItemKindNames[kind] ?? String(kind);
}

export async function getCompletion(
  client: LspClient,
  uri: string,
  position: { line: number; character: number },
  opts: {
    maxResults?: number;
    includeDocumentation?: boolean;
    includeInsertText?: boolean;
  } = {}
): Promise<{ items: NormalizedCompletionItem[]; returned: number; truncated: boolean; isIncomplete?: boolean }> {
  const maxResults = opts.maxResults ?? LIMITS.COMPLETION_MAX;

  const raw = await client.request("textDocument/completion", {
    textDocument: { uri },
    position,
  }, LIMITS.TIMEOUTS.COMPLETION_MS) as any;

  let items: any[];
  let isIncomplete: boolean | undefined;

  if (!raw) {
    items = [];
  } else if (Array.isArray(raw)) {
    items = raw;
  } else {
    // CompletionList shape
    items = raw.items ?? [];
    isIncomplete = raw.isIncomplete;
  }

  const normalized = items.map((item: any): NormalizedCompletionItem => {
    const result: NormalizedCompletionItem = {
      label: item.label ?? "",
      kind: completionKindToString(item.kind),
      detail: item.detail,
      deprecated: item.deprecated,
      sortText: item.sortText,
      filterText: item.filterText,
      hasAdditionalTextEdits: !!(item.additionalTextEdits && item.additionalTextEdits.length > 0),
    };

    if (opts.includeDocumentation && item.documentation) {
      result.documentation = typeof item.documentation === "string"
        ? item.documentation
        : item.documentation.value ?? "";
    }

    if (opts.includeInsertText) {
      result.insertText = item.insertText ?? item.label;
    }

    return result;
  });

  const clamped = clampResults(normalized, maxResults);
  return {
    items: clamped.items,
    returned: clamped.returned,
    truncated: clamped.truncated,
    isIncomplete,
  };
}

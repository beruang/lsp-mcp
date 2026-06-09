import { LspClient } from "../lsp/LspClient.js";
import { locationFromLsp, symbolKindToString } from "../lsp/normalize.js";
import { clampResults, LIMITS } from "../safety/limits.js";
import { callHierarchyCache, NormalizedCallHierarchyItem } from "./callHierarchyCache.js";

function normalizeItem(
  workspacePath: string,
  item: any
): NormalizedCallHierarchyItem | null {
  if (!item) return null;

  const normalized: NormalizedCallHierarchyItem = {
    id: "",
    name: item.name ?? "",
    kind: symbolKindToString(item.kind),
    detail: item.detail,
    filePath: locationFromLsp(workspacePath, { uri: item.uri, range: item.range })?.filePath ?? "",
    range: item.range ?? { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    selectionRange: item.selectionRange ?? item.range ?? { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
  };

  if (item.uri && normalized.filePath === "") {
    const loc = locationFromLsp(workspacePath, { uri: item.uri, range: item.range });
    if (loc) normalized.filePath = loc.filePath;
  }

  return normalized;
}

export async function prepareCallHierarchy(
  client: LspClient,
  uri: string,
  position: { line: number; character: number },
  workspacePath: string,
  language: string,
  maxItems: number = LIMITS.CALL_HIERARCHY_ITEMS_MAX
): Promise<{ items: NormalizedCallHierarchyItem[]; returned: number; truncated: boolean }> {
  const raw = await client.request("textDocument/prepareCallHierarchy", {
    textDocument: { uri },
    position,
  }, LIMITS.TIMEOUTS.PREPARE_CALL_HIERARCHY_MS) as any;

  const items: NormalizedCallHierarchyItem[] = [];

  const rawItems = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  for (const item of rawItems) {
    const normalized = normalizeItem(workspacePath, item);
    if (normalized) {
      const id = callHierarchyCache.set(item, normalized, workspacePath, language);
      normalized.id = id;
      items.push(normalized);
    }
  }

  const clamped = clampResults(items, maxItems);
  return { items: clamped.items, returned: clamped.returned, truncated: clamped.truncated };
}

export async function getIncomingCalls(
  client: LspClient,
  itemId: string,
  workspacePath: string,
  language: string,
  maxResults: number = LIMITS.CALL_HIERARCHY_RESULTS_MAX
) {
  const cached = callHierarchyCache.get(itemId);
  if (cached === "not_found") {
    return { error: { code: "call_hierarchy_item_not_found", message: "Call hierarchy item not found" } };
  }
  if (cached === "expired") {
    return { error: { code: "call_hierarchy_item_expired", message: "Call hierarchy item expired" } };
  }

  const raw = await client.request("callHierarchy/incomingCalls", {
    item: cached.rawItem,
  }, LIMITS.TIMEOUTS.INCOMING_CALLS_MS) as any;

  const calls: Array<{ from: NormalizedCallHierarchyItem; fromRanges: Array<{ start: { line: number; character: number }; end: { line: number; character: number } }> }> = [];

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const from = normalizeItem(workspacePath, entry.from);
      if (from) {
        const id = callHierarchyCache.set(entry.from, from, workspacePath, language);
        from.id = id;
      }
      calls.push({
        from: from ?? { id: "", name: "unknown", kind: "unknown", filePath: "", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } },
        fromRanges: (entry.fromRanges ?? []).map((r: any) => r ?? { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }),
      });
    }
  }

  const clamped = clampResults(calls, maxResults);
  return { itemId, calls: clamped.items, returned: clamped.returned, truncated: clamped.truncated };
}

export async function getOutgoingCalls(
  client: LspClient,
  itemId: string,
  workspacePath: string,
  language: string,
  maxResults: number = LIMITS.CALL_HIERARCHY_RESULTS_MAX
) {
  const cached = callHierarchyCache.get(itemId);
  if (cached === "not_found") {
    return { error: { code: "call_hierarchy_item_not_found", message: "Call hierarchy item not found" } };
  }
  if (cached === "expired") {
    return { error: { code: "call_hierarchy_item_expired", message: "Call hierarchy item expired" } };
  }

  const raw = await client.request("callHierarchy/outgoingCalls", {
    item: cached.rawItem,
  }, LIMITS.TIMEOUTS.OUTGOING_CALLS_MS) as any;

  const calls: Array<{ to: NormalizedCallHierarchyItem; fromRanges: Array<{ start: { line: number; character: number }; end: { line: number; character: number } }> }> = [];

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const to = normalizeItem(workspacePath, entry.to);
      if (to) {
        const id = callHierarchyCache.set(entry.to, to, workspacePath, language);
        to.id = id;
      }
      calls.push({
        to: to ?? { id: "", name: "unknown", kind: "unknown", filePath: "", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } },
        fromRanges: (entry.fromRanges ?? []).map((r: any) => r ?? { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }),
      });
    }
  }

  const clamped = clampResults(calls, maxResults);
  return { itemId, calls: clamped.items, returned: clamped.returned, truncated: clamped.truncated };
}

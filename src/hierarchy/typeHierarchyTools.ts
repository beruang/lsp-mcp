import { LspClient } from "../lsp/LspClient.js";
import { locationFromLsp, symbolKindToString } from "../lsp/normalize.js";
import { clampResults, LIMITS } from "../safety/limits.js";
import { typeHierarchyCache, NormalizedTypeHierarchyItem } from "./typeHierarchyCache.js";

function normalizeTypeItem(workspacePath: string, item: any): NormalizedTypeHierarchyItem | null {
  if (!item) return null;

  const normalized: NormalizedTypeHierarchyItem = {
    id: "",
    name: item.name ?? "",
    kind: symbolKindToString(item.kind),
    detail: item.detail,
    filePath: "",
    range: item.range ?? { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    selectionRange: item.selectionRange ?? item.range ?? { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
  };

  if (item.uri) {
    const loc = locationFromLsp(workspacePath, { uri: item.uri, range: item.range });
    if (loc) normalized.filePath = loc.filePath;
  }

  return normalized;
}

export async function prepareTypeHierarchy(
  client: LspClient,
  uri: string,
  position: { line: number; character: number },
  workspacePath: string,
  language: string,
  maxItems: number = LIMITS.TYPE_HIERARCHY_ITEMS_MAX
): Promise<{ items: NormalizedTypeHierarchyItem[]; returned: number; truncated: boolean }> {
  const raw = await client.request("textDocument/prepareTypeHierarchy", {
    textDocument: { uri },
    position,
  }, LIMITS.TIMEOUTS.PREPARE_TYPE_HIERARCHY_MS) as any;

  const items: NormalizedTypeHierarchyItem[] = [];
  const rawItems = Array.isArray(raw) ? raw : (raw ? [raw] : []);

  for (const item of rawItems) {
    const normalized = normalizeTypeItem(workspacePath, item);
    if (normalized) {
      const id = typeHierarchyCache.set(item, normalized, workspacePath, language);
      normalized.id = id;
      items.push(normalized);
    }
  }

  const clamped = clampResults(items, maxItems);
  return { items: clamped.items, returned: clamped.returned, truncated: clamped.truncated };
}

export async function getSupertypes(
  client: LspClient,
  itemId: string,
  workspacePath: string,
  language: string,
  maxResults: number = LIMITS.TYPE_HIERARCHY_RESULTS_MAX
) {
  const cached = typeHierarchyCache.get(itemId);
  if (cached === "not_found") {
    return { error: { code: "type_hierarchy_item_not_found", message: "Type hierarchy item not found" } };
  }
  if (cached === "expired") {
    return { error: { code: "type_hierarchy_item_expired", message: "Type hierarchy item expired" } };
  }

  const raw = await client.request("typeHierarchy/supertypes", {
    item: cached.rawItem,
  }, LIMITS.TIMEOUTS.SUPERTYPES_MS) as any;

  const items: NormalizedTypeHierarchyItem[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const normalized = normalizeTypeItem(workspacePath, item);
      if (normalized) {
        const id = typeHierarchyCache.set(item, normalized, workspacePath, language);
        normalized.id = id;
        items.push(normalized);
      }
    }
  }

  const clamped = clampResults(items, maxResults);
  return { itemId, items: clamped.items, returned: clamped.returned, truncated: clamped.truncated };
}

export async function getSubtypes(
  client: LspClient,
  itemId: string,
  workspacePath: string,
  language: string,
  maxResults: number = LIMITS.TYPE_HIERARCHY_RESULTS_MAX
) {
  const cached = typeHierarchyCache.get(itemId);
  if (cached === "not_found") {
    return { error: { code: "type_hierarchy_item_not_found", message: "Type hierarchy item not found" } };
  }
  if (cached === "expired") {
    return { error: { code: "type_hierarchy_item_expired", message: "Type hierarchy item expired" } };
  }

  const raw = await client.request("typeHierarchy/subtypes", {
    item: cached.rawItem,
  }, LIMITS.TIMEOUTS.SUBTYPES_MS) as any;

  const items: NormalizedTypeHierarchyItem[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const normalized = normalizeTypeItem(workspacePath, item);
      if (normalized) {
        const id = typeHierarchyCache.set(item, normalized, workspacePath, language);
        normalized.id = id;
        items.push(normalized);
      }
    }
  }

  const clamped = clampResults(items, maxResults);
  return { itemId, items: clamped.items, returned: clamped.returned, truncated: clamped.truncated };
}

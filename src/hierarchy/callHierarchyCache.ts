import { randomUUID } from "node:crypto";

export interface NormalizedCallHierarchyItem {
  id: string;
  name: string;
  kind: string;
  detail?: string;
  filePath: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  selectionRange: { start: { line: number; character: number }; end: { line: number; character: number } };
}

interface CachedCallHierarchyItem {
  id: string;
  workspacePath: string;
  language: string;
  rawItem: unknown;
  normalizedItem: NormalizedCallHierarchyItem;
  createdAt: number;
  expiresAt: number;
}

const TTL_MS = 10 * 60 * 1000; // 10 minutes

export class CallHierarchyCache {
  private items = new Map<string, CachedCallHierarchyItem>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
  }

  set(rawItem: unknown, normalizedItem: NormalizedCallHierarchyItem, workspacePath: string, language: string): string {
    const id = randomUUID();
    normalizedItem.id = id;
    const now = Date.now();
    this.items.set(id, {
      id,
      workspacePath,
      language,
      rawItem,
      normalizedItem,
      createdAt: now,
      expiresAt: now + TTL_MS,
    });
    return id;
  }

  get(id: string): { rawItem: unknown; normalizedItem: NormalizedCallHierarchyItem; language: string } | "not_found" | "expired" {
    const cached = this.items.get(id);
    if (!cached) return "not_found";
    if (Date.now() > cached.expiresAt) {
      this.items.delete(id);
      return "expired";
    }
    return { rawItem: cached.rawItem, normalizedItem: cached.normalizedItem, language: cached.language };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, item] of this.items) {
      if (now > item.expiresAt) this.items.delete(id);
    }
  }

  dispose(): void {
    clearInterval(this.cleanupTimer);
    this.items.clear();
  }
}

export const callHierarchyCache = new CallHierarchyCache();

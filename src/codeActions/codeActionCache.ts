export interface CachedCodeAction {
  id: string;
  workspacePath: string;
  language: string;
  filePath: string;
  rawAction: unknown;
  createdAt: number;
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60_000; // 1 minute
const MAX_ENTRIES = 1000;

class CodeActionCache {
  private cache = new Map<string, CachedCodeAction>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startCleanup();
  }

  store(
    action: unknown,
    meta: { workspacePath: string; language: string; filePath: string }
  ): string {
    const id = `ca-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();
    const entry: CachedCodeAction = {
      id,
      workspacePath: meta.workspacePath,
      language: meta.language,
      filePath: meta.filePath,
      rawAction: action,
      createdAt: now,
      expiresAt: now + TTL_MS,
    };

    // Enforce max entries
    if (this.cache.size >= MAX_ENTRIES) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(id, entry);
    return id;
  }

  get(id: string): CachedCodeAction | undefined {
    const entry = this.cache.get(id);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(id);
      return undefined;
    }
    return entry;
  }

  delete(id: string): void {
    this.cache.delete(id);
  }

  size(): number {
    return this.cache.size;
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, entry] of this.cache) {
        if (now > entry.expiresAt) {
          this.cache.delete(id);
        }
      }
    }, CLEANUP_INTERVAL_MS);
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cache.clear();
  }
}

export const codeActionCache = new CodeActionCache();

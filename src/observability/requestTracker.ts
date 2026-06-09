import { getEffectiveConfig } from "../config/runtimeConfig.js";

export type RequestLogEntry = {
  id: string;
  language: string;
  method: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  status: "ok" | "error" | "timeout" | "cancelled";
  errorCode?: string;
  errorMessage?: string;
  filePath?: string;
  resultCount?: number;
};

export type RequestLogFilter = {
  language?: string;
  method?: string;
  status?: RequestLogEntry["status"];
  limit?: number;
  since?: string;
};

class RequestTracker {
  private entries: RequestLogEntry[] = [];
  private maxEntries = 500;

  private ensureCapacity(): void {
    const max = getEffectiveConfig().caches.requestLogMaxEntries;
    this.maxEntries = max;
    while (this.entries.length >= this.maxEntries) {
      this.entries.shift();
    }
  }

  start(language: string, method: string, filePath?: string): RequestLogEntry {
    this.ensureCapacity();
    const entry: RequestLogEntry = {
      id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      language,
      method,
      startedAt: new Date().toISOString(),
      status: "ok",
      filePath,
    };
    this.entries.push(entry);
    return entry;
  }

  complete(id: string, resultCount?: number): void {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) return;
    entry.completedAt = new Date().toISOString();
    entry.durationMs = Date.now() - new Date(entry.startedAt).getTime();
    entry.status = "ok";
    if (resultCount !== undefined) entry.resultCount = resultCount;
  }

  error(id: string, errorCode: string, errorMessage: string): void {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) return;
    entry.completedAt = new Date().toISOString();
    entry.durationMs = Date.now() - new Date(entry.startedAt).getTime();
    entry.status = "error";
    entry.errorCode = errorCode;
    entry.errorMessage = errorMessage.slice(0, 500);
  }

  timeout(id: string): void {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) return;
    entry.completedAt = new Date().toISOString();
    entry.durationMs = Date.now() - new Date(entry.startedAt).getTime();
    entry.status = "timeout";
  }

  cancelled(id: string): void {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) return;
    entry.completedAt = new Date().toISOString();
    entry.durationMs = Date.now() - new Date(entry.startedAt).getTime();
    entry.status = "cancelled";
  }

  getEntries(filter?: RequestLogFilter): RequestLogEntry[] {
    let result = [...this.entries];

    if (filter?.language) {
      result = result.filter((e) => e.language === filter.language);
    }
    if (filter?.method) {
      result = result.filter((e) => e.method === filter.method);
    }
    if (filter?.status) {
      result = result.filter((e) => e.status === filter.status);
    }
    if (filter?.since) {
      const sinceMs = new Date(filter.since).getTime();
      result = result.filter((e) => new Date(e.startedAt).getTime() >= sinceMs);
    }
    if (filter?.limit && filter.limit > 0) {
      result = result.slice(-filter.limit);
    }

    return result;
  }

  clear(filter?: RequestLogFilter): number {
    if (!filter || (!filter.language && !filter.method && !filter.status && !filter.since)) {
      const count = this.entries.length;
      this.entries = [];
      return count;
    }

    const before = this.entries.length;
    this.entries = this.entries.filter((e) => {
      if (filter.language && e.language !== filter.language) return true;
      if (filter.method && e.method !== filter.method) return true;
      if (filter.status && e.status !== filter.status) return true;
      if (filter.since) {
        const sinceMs = new Date(filter.since).getTime();
        if (new Date(e.startedAt).getTime() >= sinceMs) return true;
      }
      return false;
    });
    return before - this.entries.length;
  }

  size(): number {
    return this.entries.length;
  }
}

export const requestTracker = new RequestTracker();

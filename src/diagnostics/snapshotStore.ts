import type { NormalizedDiagnostic } from "../lsp/diagnosticsCache.js";

export interface DiagnosticSnapshot {
  id: string;
  name?: string;
  createdAt: string;
  workspacePath: string;
  diagnostics: NormalizedDiagnostic[];
  total: number;
  severityBreakdown: {
    error: number;
    warning: number;
    info: number;
    hint: number;
  };
}

const TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

class SnapshotStore {
  private store = new Map<string, DiagnosticSnapshot>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startCleanup();
  }

  create(
    diagnostics: NormalizedDiagnostic[],
    workspacePath: string,
    name?: string
  ): DiagnosticSnapshot {
    const id = `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const breakdown = { error: 0, warning: 0, info: 0, hint: 0 };
    for (const d of diagnostics) {
      const s = d.severity;
      if (s === "error") breakdown.error++;
      else if (s === "warning") breakdown.warning++;
      else if (s === "info") breakdown.info++;
      else if (s === "hint") breakdown.hint++;
    }

    const snapshot: DiagnosticSnapshot = {
      id,
      name,
      createdAt: new Date().toISOString(),
      workspacePath,
      diagnostics,
      total: diagnostics.length,
      severityBreakdown: breakdown,
    };

    this.store.set(id, snapshot);
    this.enforceMaxEntries();
    return snapshot;
  }

  get(id: string): DiagnosticSnapshot | undefined {
    return this.store.get(id);
  }

  delete(id: string): void {
    this.store.delete(id);
  }

  size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  private enforceMaxEntries(): void {
    const max = 500;
    if (this.store.size > max) {
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const cutoff = Date.now() - TTL_MS;
      for (const [id, snap] of this.store) {
        if (new Date(snap.createdAt).getTime() < cutoff) {
          this.store.delete(id);
        }
      }
    }, CLEANUP_INTERVAL_MS);
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.store.clear();
  }
}

export const snapshotStore = new SnapshotStore();

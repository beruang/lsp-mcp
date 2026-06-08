import { Range } from "./normalize.js";

export interface NormalizedDiagnostic {
  filePath: string;
  severity: string;
  message: string;
  source?: string;
  code?: string | number;
  range: Range;
}

class DiagnosticsCache {
  private cache = new Map<string, NormalizedDiagnostic[]>();

  get(uri: string): NormalizedDiagnostic[] {
    return this.cache.get(uri) ?? [];
  }

  set(uri: string, diags: NormalizedDiagnostic[]): void {
    this.cache.set(uri, diags);
  }

  all(): NormalizedDiagnostic[] {
    return [...this.cache.values()].flat();
  }

  clear(): void {
    this.cache.clear();
  }

  awaitDiagnostics(uri: string, timeoutMs: number): Promise<NormalizedDiagnostic[]> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(this.get(uri)), timeoutMs);
    });
  }

  awaitAllDiagnostics(timeoutMs: number): Promise<NormalizedDiagnostic[]> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(this.all()), timeoutMs);
    });
  }
}

export const diagnosticsCache = new DiagnosticsCache();

import type { ServerCapabilitiesSnapshot } from "./capabilities.js";

export interface SpawnOptions {
  command: string;
  args: string[];
  workspacePath: string;
  rootUri: string;
  startupTimeoutMs?: number;
}

export class LspClient {
  private proc: import("child_process").ChildProcess;
  private connection: import("vscode-jsonrpc").MessageConnection;
  private caps: ServerCapabilitiesSnapshot;

  private constructor(proc: import("child_process").ChildProcess, connection: import("vscode-jsonrpc").MessageConnection, caps: ServerCapabilitiesSnapshot) {
    this.proc = proc;
    this.connection = connection;
    this.caps = caps;
  }

  static async spawn(opts: SpawnOptions): Promise<LspClient> {
    throw new Error("Not implemented in phase-3 stub");
  }

  async request<R>(method: string, params: unknown, timeoutMs?: number): Promise<R> {
    throw new Error("Not implemented in phase-3 stub");
  }

  notify(method: string, params: unknown): void {
    throw new Error("Not implemented in phase-3 stub");
  }

  async shutdown(): Promise<void> {
    throw new Error("Not implemented in phase-3 stub");
  }

  getCapabilities(): ServerCapabilitiesSnapshot {
    return this.caps;
  }
}
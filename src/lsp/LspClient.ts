import { createMessageConnection, MessageConnection } from "vscode-jsonrpc";
import { StreamMessageReader, StreamMessageWriter } from "vscode-jsonrpc/lib/node/main.js";
import { ChildProcess, execFile, spawn } from "child_process";
import { ServerCapabilitiesSnapshot, extractCapabilities } from "./capabilities.js";
import { withTimeout } from "../utils/asyncTimeout.js";

export interface SpawnOptions {
  command: string;
  args: string[];
  workspacePath: string;
  rootUri: string;
  startupTimeoutMs?: number;
}

export class LspClient {
  private proc: ChildProcess;
  private connection: MessageConnection;
  private caps: ServerCapabilitiesSnapshot;

  private constructor(proc: ChildProcess, connection: MessageConnection, caps: ServerCapabilitiesSnapshot) {
    this.proc = proc;
    this.connection = connection;
    this.caps = caps;
  }

  static async spawn(opts: SpawnOptions): Promise<LspClient> {
    const startupTimeoutMs = opts.startupTimeoutMs ?? 30_000;

    // Check if command exists on PATH
    await new Promise<void>((resolve, reject) => {
      execFile("command", ["-v", opts.command], (err, stdout, stderr) => {
        if (err || stdout.trim() === "") {
          reject(new Error(`lsp_server_unavailable: ${opts.command} not found on PATH`));
        } else {
          resolve();
        }
      });
    });

    // Spawn the process
    const proc = spawn(opts.command, opts.args, {
      stdio: ["pipe", "pipe", "pipe"]
    });

    const reader = new StreamMessageReader(proc.stdout);
    const writer = new StreamMessageWriter(proc.stdin);
    const connection = createMessageConnection(reader, writer);

    // Start listening before sending any requests
    connection.listen();

    // Log stderr to console
    proc.stderr?.on("data", (chunk: Buffer) => {
      const lines = chunk.toString().split("\n").filter((l: string) => l.trim());
      for (const line of lines) {
        console.error(`[lsp:${proc.pid}] ${line}`);
      }
    });

    const initializeParams = {
      processId: process.pid,
      rootUri: opts.rootUri,
      capabilities: {
        workspace: {
          workspaceFolders: true
        },
        textDocument: {
          synchronization: {
            dynamicRegistration: false
          },
          hover: {
            contentFormat: ["markdown", "plaintext"]
          },
          definition: {
            linkSupport: true
          },
          references: {},
          documentSymbol: {
            hierarchical: true
          },
          workspaceSymbol: {}
        }
      },
      workspaceFolders: [{ uri: opts.rootUri, name: "workspace" }],
      initializationOptions: {}
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await withTimeout(
      connection.sendRequest("initialize", initializeParams) as Promise<any>,
      startupTimeoutMs,
      "initialize"
    );

    connection.sendNotification("initialized", {});

    const caps = extractCapabilities(response?.capabilities);

    // Subscribe to publishDiagnostics notifications
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connection.onNotification("publishDiagnostics", (params: any) => {
      console.error(`[lsp:${proc.pid}] publishDiagnostics: ${params.uri} (${params.diagnostics?.length ?? 0} diagnostics)`);
    });

    return new LspClient(proc, connection, caps);
  }

  async request<R>(method: string, params: unknown, timeoutMs?: number): Promise<R> {
    return withTimeout(
      this.connection.sendRequest(method, params) as Promise<R>,
      timeoutMs ?? 10_000,
      method
    );
  }

  notify(method: string, params: unknown): void {
    this.connection.sendNotification(method, params);
  }

  async shutdown(): Promise<void> {
    try {
      await withTimeout(
        this.connection.sendRequest("shutdown", null) as Promise<void>,
        3_000,
        "shutdown"
      );
    } catch {
      // Best-effort: process may already be gone
    }
    try {
      this.connection.sendNotification("exit", null);
    } catch {
      // Best-effort
    }
    try {
      this.connection.dispose();
    } catch {
      // Best-effort
    }
    try {
      this.proc.kill("SIGTERM");
    } catch {
      // Best-effort: process may already be gone
    }
  }

  getCapabilities(): ServerCapabilitiesSnapshot {
    return this.caps;
  }
}
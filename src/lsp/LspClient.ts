import { createMessageConnection, MessageConnection } from "vscode-jsonrpc";
import { StreamMessageReader, StreamMessageWriter } from "vscode-jsonrpc/lib/node/main.js";
import { ChildProcess, execFile, spawn } from "child_process";
import { ServerCapabilitiesSnapshot, extractCapabilities } from "./capabilities.js";
import { withTimeout } from "../utils/asyncTimeout.js";
import { diagnosticsCache } from "./diagnosticsCache.js";
import { diagnosticFromLsp, uriToRel } from "./normalize.js";
import { LspState } from "./LspState.js";

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
  private workspacePath: string;
  readonly state: LspState;

  private constructor(proc: ChildProcess, connection: MessageConnection, caps: ServerCapabilitiesSnapshot, workspacePath: string, state: LspState) {
    this.proc = proc;
    this.connection = connection;
    this.caps = caps;
    this.workspacePath = workspacePath;
    this.state = state;
  }

  static async spawn(opts: SpawnOptions): Promise<LspClient> {
    const startupTimeoutMs = opts.startupTimeoutMs ?? 30_000;
    const state = new LspState(opts.command, opts.command, opts.args);
    state.transition("starting");

    // Check if command exists on PATH
    try {
      await new Promise<void>((resolve, reject) => {
        execFile("command", ["-v", opts.command], (err, stdout) => {
          if (err || stdout.trim() === "") {
            reject(new Error(`lsp_server_unavailable: ${opts.command} not found on PATH`));
          } else {
            resolve();
          }
        });
      });
    } catch (e: unknown) {
      state.lastError = String(e);
      state.transition("failed");
      throw e;
    }

    // Spawn the process
    const proc = spawn(opts.command, opts.args, {
      stdio: ["pipe", "pipe", "pipe"]
    });

    state.pid = proc.pid ?? undefined;

    // Detect unexpected process exit
    proc.on("exit", (code, signal) => {
      if (state.state !== "stopping" && state.state !== "stopped") {
        state.lastError = `Process exited unexpectedly (code=${code}, signal=${signal})`;
        state.transition("crashed");
      }
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

    state.transition("initializing");

    let response;
    try {
      response = await withTimeout(
        connection.sendRequest("initialize", initializeParams) as Promise<any>,
        startupTimeoutMs,
        "initialize"
      );
    } catch (e: unknown) {
      state.lastError = String(e);
      state.transition("failed");
      throw e;
    }

    connection.sendNotification("initialized", {});

    const caps = extractCapabilities(response?.capabilities);
    state.capabilitiesKnown = true;
    state.transition("running");

    // Subscribe to publishDiagnostics notifications
    connection.onNotification("textDocument/publishDiagnostics", (params: any) => {
      const filePath = uriToRel(opts.workspacePath, params.uri);
      const normalized = (params.diagnostics ?? []).map((d: any) => diagnosticFromLsp(filePath, d));
      diagnosticsCache.set(params.uri, normalized);
      console.error(`[lsp:${proc.pid}] publishDiagnostics: ${params.uri} (${normalized.length} diagnostics)`);
    });

    return new LspClient(proc, connection, caps, opts.workspacePath, state);
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
    this.state.transition("stopping");
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
    this.state.transition("stopped");
  }

  getCapabilities(): ServerCapabilitiesSnapshot {
    return this.caps;
  }
}
export type LspServerState =
  | "not_started"
  | "starting"
  | "initializing"
  | "running"
  | "stopping"
  | "stopped"
  | "crashed"
  | "failed";

export type LspServerRuntimeStatus = {
  language: string;
  command: string;
  args: string[];
  state: LspServerState;
  pid?: number;
  startedAt?: string;
  initializedAt?: string;
  uptimeMs?: number;
  restartCount: number;
  crashCount: number;
  lastError?: string;
  openDocumentCount: number;
  pendingRequestCount: number;
  diagnosticsFileCount: number;
  capabilitiesKnown: boolean;
};

type Transition = { from: LspServerState; to: LspServerState };

const VALID_TRANSITIONS: Transition[] = [
  { from: "not_started", to: "starting" },
  { from: "starting", to: "initializing" },
  { from: "initializing", to: "running" },
  { from: "running", to: "stopping" },
  { from: "stopping", to: "stopped" },
  { from: "running", to: "crashed" },
  { from: "starting", to: "failed" },
  { from: "initializing", to: "failed" },
  { from: "crashed", to: "starting" },
  { from: "failed", to: "starting" },
];

const TRANSITION_MAP = new Map<string, boolean>();
for (const t of VALID_TRANSITIONS) {
  TRANSITION_MAP.set(`${t.from}→${t.to}`, true);
}

export class LspState {
  language: string;
  command: string;
  args: string[];
  state: LspServerState;
  pid?: number;
  startedAt?: string;
  initializedAt?: string;
  restartCount: number;
  crashCount: number;
  lastError?: string;
  openDocumentCount: number;
  pendingRequestCount: number;
  diagnosticsFileCount: number;
  capabilitiesKnown: boolean;
  private history: Array<{ from: LspServerState; to: LspServerState; at: string }>;

  constructor(language: string, command: string, args: string[]) {
    this.language = language;
    this.command = command;
    this.args = args;
    this.state = "not_started";
    this.restartCount = 0;
    this.crashCount = 0;
    this.openDocumentCount = 0;
    this.pendingRequestCount = 0;
    this.diagnosticsFileCount = 0;
    this.capabilitiesKnown = false;
    this.history = [];
  }

  transition(to: LspServerState): boolean {
    const key = `${this.state}→${to}`;
    if (!TRANSITION_MAP.has(key)) {
      console.warn(`[LspState] Invalid transition: ${this.language} ${this.state} → ${to}`);
      return false;
    }

    const from = this.state;
    this.history.push({ from, to, at: new Date().toISOString() });
    if (this.history.length > 20) {
      this.history.shift();
    }

    // Side effects per transition
    if (to === "starting") {
      if (this.state === "crashed" || this.state === "failed") {
        this.restartCount++;
      }
      this.startedAt = new Date().toISOString();
      this.lastError = undefined;
    }
    if (to === "initializing") {
      this.startedAt = this.startedAt ?? new Date().toISOString();
    }
    if (to === "running") {
      this.initializedAt = new Date().toISOString();
    }
    if (to === "crashed") {
      this.crashCount++;
    }

    this.state = to;
    return true;
  }

  getRuntimeStatus(): LspServerRuntimeStatus {
    return {
      language: this.language,
      command: this.command,
      args: this.args,
      state: this.state,
      pid: this.pid,
      startedAt: this.startedAt,
      initializedAt: this.initializedAt,
      uptimeMs: this.startedAt ? Date.now() - new Date(this.startedAt).getTime() : undefined,
      restartCount: this.restartCount,
      crashCount: this.crashCount,
      lastError: this.lastError,
      openDocumentCount: this.openDocumentCount,
      pendingRequestCount: this.pendingRequestCount,
      diagnosticsFileCount: this.diagnosticsFileCount,
      capabilitiesKnown: this.capabilitiesKnown,
    };
  }

  getHistory(): Array<{ from: LspServerState; to: LspServerState; at: string }> {
    return [...this.history];
  }
}

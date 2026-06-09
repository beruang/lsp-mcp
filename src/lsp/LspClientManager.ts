import { LspClient } from "./LspClient.js";
import { languageServers } from "../config/languageServers.js";
import type { LspServerRuntimeStatus, LspServerState } from "./LspState.js";

export class LspClientManager {
  /** Cache of pending or completed client spawn promises, keyed by language. */
  private clientPromises = new Map<string, Promise<LspClient | null>>();
  /** Resolved clients, keyed by language. */
  private clients = new Map<string, LspClient>();

  /**
   * Returns a promise for an existing client for `lang` or spawns a new one if none exists.
   * Returns null if `lang` is not registered in the language server registry.
   */
  async getClientForLanguage(
    lang: string,
    opts: { workspacePath: string; rootUri: string }
  ): Promise<LspClient | null> {
    // If a promise already exists, return it (prevents duplicate spawns)
    if (this.clientPromises.has(lang)) {
      return this.clientPromises.get(lang)!;
    }

    const entry = languageServers[lang];
    if (!entry) {
      return null;
    }

    const promise = LspClient.spawn({
      command: entry.command,
      args: entry.args,
      workspacePath: opts.workspacePath,
      rootUri: opts.rootUri,
      language: lang,
    }) as Promise<LspClient>;

    // Track resolved client
    promise.then(
      (client) => {
        if (client) this.clients.set(lang, client);
      },
      () => {
        // Spawn failed — don't cache in clients
      }
    );

    this.clientPromises.set(lang, promise);
    return promise;
  }

  // ── V4: State queries ──────────────────────────────────────────────────────

  /**
   * Returns the runtime status for a single language server.
   * If the server has never been started, returns a default "not_started" status.
   */
  getState(lang: string): LspServerRuntimeStatus {
    const client = this.clients.get(lang);
    if (client) {
      return client.state.getRuntimeStatus();
    }
    const entry = languageServers[lang];
    if (entry) {
      return {
        language: lang,
        command: entry.command,
        args: entry.args,
        state: "not_started" as LspServerState,
        restartCount: 0,
        crashCount: 0,
        openDocumentCount: 0,
        pendingRequestCount: 0,
        diagnosticsFileCount: 0,
        capabilitiesKnown: false,
      };
    }
    return {
      language: lang,
      command: "unknown",
      args: [],
      state: "not_started" as LspServerState,
      restartCount: 0,
      crashCount: 0,
      openDocumentCount: 0,
      pendingRequestCount: 0,
      diagnosticsFileCount: 0,
      capabilitiesKnown: false,
    };
  }

  /** Returns runtime status for all configured language servers. */
  getAllStates(): LspServerRuntimeStatus[] {
    return Object.keys(languageServers).map((lang) => this.getState(lang));
  }

  /** Returns the resolved client for a language, or undefined if not started. */
  getClient(lang: string): LspClient | undefined {
    return this.clients.get(lang);
  }

  /** Returns all resolved clients. */
  getAllClients(): Map<string, LspClient> {
    return this.clients;
  }

  /** Removes a client from the cache (e.g., after forced kill). */
  removeClient(lang: string): void {
    this.clients.delete(lang);
    this.clientPromises.delete(lang);
  }
}

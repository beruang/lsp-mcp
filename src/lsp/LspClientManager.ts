import { LspClient } from "./LspClient.js";
import { languageServers } from "../config/languageServers.js";

export class LspClientManager {
  /** Cache of pending or completed client spawn promises, keyed by language. */
  private clientPromises = new Map<string, Promise<LspClient | null>>();

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
    }) as Promise<LspClient>;

    this.clientPromises.set(lang, promise);
    return promise;
  }
}

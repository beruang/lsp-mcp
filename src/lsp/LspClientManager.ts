import { LspClient } from "./LspClient.js";
import { languageServers } from "../config/languageServers.js";

export class LspClientManager {
  private clients = new Map<string, LspClient>();

  /**
   * Returns an existing client for `lang` or spawns a new one if none exists.
   * Returns null if `lang` is not registered in the language server registry.
   */
  getClientForLanguage(
    lang: string,
    opts: { workspacePath: string; rootUri: string }
  ): LspClient | null {
    if (this.clients.has(lang)) {
      return this.clients.get(lang)!;
    }

    const entry = languageServers[lang];
    if (!entry) {
      return null;
    }

    const client = LspClient.spawn({
      command: entry.command,
      args: entry.args,
      workspacePath: opts.workspacePath,
      rootUri: opts.rootUri,
    }) as unknown as LspClient;

    this.clients.set(lang, client);
    return client;
  }
}
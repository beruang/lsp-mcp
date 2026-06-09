import type { LspClientManager } from "../lsp/LspClientManager.js";
import { v4DocumentStore } from "./documentStore.js";

export function closeDocument(
  manager: LspClientManager,
  language: string,
  filePath: string
): boolean {
  const info = v4DocumentStore.get(language, filePath);
  if (!info) return false;

  const closed = v4DocumentStore.close(language, filePath);

  if (closed) {
    const client = manager.getClient(language);
    if (client) {
      client.notify("textDocument/didClose", {
        textDocument: { uri: info.uri },
      });
    }
  }

  return closed;
}

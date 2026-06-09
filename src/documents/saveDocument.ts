import type { LspClientManager } from "../lsp/LspClientManager.js";
import { v4DocumentStore, type OpenDocumentInfo } from "./documentStore.js";

export function saveDocument(
  manager: LspClientManager,
  language: string,
  filePath: string,
  providedText?: string
): OpenDocumentInfo | undefined {
  const info = v4DocumentStore.get(language, filePath);
  if (!info) return undefined;

  const client = manager.getClient(language);
  if (client) {
    const params: Record<string, unknown> = {
      textDocument: { uri: info.uri },
    };
    if (providedText !== undefined) {
      params.text = providedText;
    }
    client.notify("textDocument/didSave", params);
  }

  return info;
}

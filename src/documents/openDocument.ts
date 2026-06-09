import { readFile } from "node:fs/promises";
import type { LspClientManager } from "../lsp/LspClientManager.js";
import { v4DocumentStore, type OpenDocumentInfo } from "./documentStore.js";
import { languageServers } from "../config/languageServers.js";

export async function openDocument(
  manager: LspClientManager,
  language: string,
  filePath: string,
  workspacePath: string,
  providedText?: string
): Promise<OpenDocumentInfo> {
  const entry = languageServers[language];
  if (!entry) {
    throw new Error(`unsupported_language: "${language}" is not a configured language server`);
  }

  const text = providedText ?? await readFile(filePath, "utf-8");
  const info = await v4DocumentStore.open(language, entry.languageId, filePath, text);

  // Try to notify LSP if server is running
  const client = manager.getClient(language);
  if (client) {
    client.notify("textDocument/didOpen", {
      textDocument: {
        uri: info.uri,
        languageId: entry.languageId,
        version: info.version,
        text,
      },
    });
  }

  return info;
}

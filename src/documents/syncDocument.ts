import { readFile, stat } from "node:fs/promises";
import type { LspClientManager } from "../lsp/LspClientManager.js";
import { v4DocumentStore, type OpenDocumentInfo } from "./documentStore.js";
import { languageServers } from "../config/languageServers.js";

export async function syncDocument(
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

  let existing = v4DocumentStore.get(language, filePath);
  let text: string;
  let mtimeMs: number | undefined;

  if (providedText !== undefined) {
    text = providedText;
  } else {
    text = await readFile(filePath, "utf-8");
    try {
      mtimeMs = (await stat(filePath)).mtimeMs;
    } catch {
      // File may not exist yet
    }
  }

  // Auto-open if not tracked
  if (!existing) {
    existing = await v4DocumentStore.open(language, entry.languageId, filePath, text);
    const client = manager.getClient(language);
    if (client) {
      client.notify("textDocument/didOpen", {
        textDocument: {
          uri: existing.uri,
          languageId: entry.languageId,
          version: existing.version,
          text,
        },
      });
    }
    return existing;
  }

  // Sync (didChange)
  const updated = v4DocumentStore.sync(language, filePath, text, mtimeMs);
  if (!updated) {
    throw new Error(`document_not_found: Unable to sync "${filePath}"`);
  }

  const client = manager.getClient(language);
  if (client) {
    client.notify("textDocument/didChange", {
      textDocument: { uri: updated.uri, version: updated.version },
      contentChanges: [{ text }],
    });
  }

  return updated;
}

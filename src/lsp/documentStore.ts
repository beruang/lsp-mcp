import { readFile, stat } from "node:fs/promises";
import { LspClient } from "./LspClient.js";
import { fileToUri } from "./normalize.js";

interface DocumentEntry {
  mtimeMs: number;
  version: number;
  uri: string;
}

/**
 * Module-level store keyed by absolute file path.
 * Tracks mtime, version, and URI for each open document.
 */
const documentStore = new Map<string, DocumentEntry>();

/**
 * Ensures a file is open in the LSP server, syncing it if the mtime has changed.
 *
 * 1. Compute mtime of the file on disk.
 * 2. If not in the store: read the file, send textDocument/didOpen, store it.
 * 3. If in the store but mtime changed: read the file, send textDocument/didChange, update.
 * 4. Return the URI and current version.
 */
export async function ensureOpen(
  client: LspClient,
  filePath: string,
  languageId: string
): Promise<{ uri: string; version: number }> {
  const mtimeMs = (await stat(filePath)).mtimeMs;
  const uri = fileToUri(filePath);

  const existing = documentStore.get(filePath);

  if (!existing) {
    // Not open — send didOpen
    const text = await readFile(filePath, "utf-8");
    client.notify("textDocument/didOpen", {
      textDocument: { uri, languageId, version: 1, text },
    });
    documentStore.set(filePath, { mtimeMs, version: 1, uri });
    return { uri, version: 1 };
  }

  if (existing.mtimeMs !== mtimeMs) {
    // Changed on disk — send didChange with full new text
    const text = await readFile(filePath, "utf-8");
    const newVersion = existing.version + 1;
    client.notify("textDocument/didChange", {
      textDocument: { uri, version: newVersion },
      contentChanges: [{ text }],
    });
    documentStore.set(filePath, { mtimeMs, version: newVersion, uri });
    return { uri, version: newVersion };
  }

  return { uri: existing.uri, version: existing.version };
}

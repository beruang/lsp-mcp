import { readFile, stat } from "node:fs/promises";
import { fileToUri } from "../lsp/normalize.js";

export type OpenDocumentInfo = {
  filePath: string;
  uri: string;
  language: string;
  languageId: string;
  version: number;
  openedAt: string;
  lastSyncedAt: string;
  lastDiskMtimeMs?: number;
  textLength: number;
  dirty: boolean;
};

class V4DocumentStore {
  private documents = new Map<string, Map<string, OpenDocumentInfo>>(); // language → filePath → info

  getOrCreateLanguage(language: string): Map<string, OpenDocumentInfo> {
    let langMap = this.documents.get(language);
    if (!langMap) {
      langMap = new Map();
      this.documents.set(language, langMap);
    }
    return langMap;
  }

  async open(
    language: string,
    languageId: string,
    filePath: string,
    providedText?: string
  ): Promise<OpenDocumentInfo> {
    const langMap = this.getOrCreateLanguage(language);
    const uri = fileToUri(filePath);
    const now = new Date().toISOString();

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

    const info: OpenDocumentInfo = {
      filePath,
      uri,
      language,
      languageId,
      version: 1,
      openedAt: now,
      lastSyncedAt: now,
      lastDiskMtimeMs: mtimeMs,
      textLength: text.length,
      dirty: false,
    };

    langMap.set(filePath, info);
    return info;
  }

  sync(
    language: string,
    filePath: string,
    newText: string,
    newMtimeMs?: number
  ): OpenDocumentInfo | undefined {
    const langMap = this.documents.get(language);
    if (!langMap) return undefined;

    const existing = langMap.get(filePath);
    if (!existing) return undefined;

    const now = new Date().toISOString();
    existing.version += 1;
    existing.lastSyncedAt = now;
    existing.textLength = newText.length;
    existing.dirty = true;
    if (newMtimeMs !== undefined) {
      existing.lastDiskMtimeMs = newMtimeMs;
    }

    langMap.set(filePath, existing);
    return existing;
  }

  close(language: string, filePath: string): boolean {
    const langMap = this.documents.get(language);
    if (!langMap) return false;
    return langMap.delete(filePath);
  }

  get(language: string, filePath: string): OpenDocumentInfo | undefined {
    return this.documents.get(language)?.get(filePath);
  }

  list(language?: string): OpenDocumentInfo[] {
    if (language) {
      const langMap = this.documents.get(language);
      return langMap ? Array.from(langMap.values()) : [];
    }
    const all: OpenDocumentInfo[] = [];
    for (const langMap of this.documents.values()) {
      all.push(...langMap.values());
    }
    return all;
  }

  listByLanguage(language: string): OpenDocumentInfo[] {
    return this.list(language);
  }

  hasLanguage(language: string): boolean {
    return this.documents.has(language);
  }

  count(language?: string): number {
    if (language) {
      return this.documents.get(language)?.size ?? 0;
    }
    let total = 0;
    for (const langMap of this.documents.values()) {
      total += langMap.size;
    }
    return total;
  }

  clear(language?: string): void {
    if (language) {
      this.documents.delete(language);
    } else {
      this.documents.clear();
    }
  }
}

export const v4DocumentStore = new V4DocumentStore();

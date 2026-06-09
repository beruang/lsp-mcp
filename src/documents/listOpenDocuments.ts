import { v4DocumentStore, type OpenDocumentInfo } from "./documentStore.js";

export function listOpenDocuments(language?: string): OpenDocumentInfo[] {
  return v4DocumentStore.list(language);
}

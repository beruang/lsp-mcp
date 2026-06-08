export interface ServerCapabilitiesSnapshot {
  hoverProvider: boolean | unknown;
  definitionProvider: boolean | unknown;
  referencesProvider: boolean | unknown;
  documentSymbolProvider: boolean | unknown;
  workspaceSymbolProvider: boolean | unknown;
  diagnosticProvider: boolean | unknown;
  raw: Record<string, unknown>;
}

export function extractCapabilities(sc: any): ServerCapabilitiesSnapshot {
  return {
    hoverProvider: sc?.hoverProvider ?? false,
    definitionProvider: sc?.definitionProvider ?? false,
    referencesProvider: sc?.referencesProvider ?? false,
    documentSymbolProvider: sc?.documentSymbolProvider ?? false,
    workspaceSymbolProvider: sc?.workspaceSymbolProvider ?? false,
    diagnosticProvider: sc?.diagnosticProvider ?? false,
    raw: sc ?? {}
  };
}
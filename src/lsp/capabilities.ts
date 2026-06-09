export interface ServerCapabilitiesSnapshot {
  // V1
  hoverProvider: boolean | unknown;
  definitionProvider: boolean | unknown;
  referencesProvider: boolean | unknown;
  documentSymbolProvider: boolean | unknown;
  workspaceSymbolProvider: boolean | unknown;
  diagnosticProvider: boolean | unknown;
  renameProvider: boolean | unknown;
  // V2
  codeActionProvider: boolean | unknown;
  documentFormattingProvider: boolean | unknown;
  documentRangeFormattingProvider: boolean | unknown;
  // V3
  declarationProvider: boolean;
  typeDefinitionProvider: boolean;
  implementationProvider: boolean;
  signatureHelpProvider: boolean;
  completionProvider: boolean;
  callHierarchyProvider: boolean;
  typeHierarchyProvider: boolean;
  raw: Record<string, unknown>;
}

export function extractCapabilities(sc: any): ServerCapabilitiesSnapshot {
  const caps = sc ?? {};
  return {
    // V1
    hoverProvider: caps.hoverProvider ?? false,
    definitionProvider: caps.definitionProvider ?? false,
    referencesProvider: caps.referencesProvider ?? false,
    documentSymbolProvider: caps.documentSymbolProvider ?? false,
    workspaceSymbolProvider: caps.workspaceSymbolProvider ?? false,
    diagnosticProvider: caps.diagnosticProvider ?? false,
    renameProvider: caps.renameProvider ?? false,
    // V2
    codeActionProvider: caps.codeActionProvider ?? false,
    documentFormattingProvider: caps.documentFormattingProvider ?? false,
    documentRangeFormattingProvider: caps.documentRangeFormattingProvider ?? false,
    // V3
    declarationProvider: !!caps.declarationProvider,
    typeDefinitionProvider: !!caps.typeDefinitionProvider,
    implementationProvider: !!caps.implementationProvider,
    signatureHelpProvider: !!caps.signatureHelpProvider,
    completionProvider: !!caps.completionProvider,
    callHierarchyProvider: !!caps.callHierarchyProvider,
    typeHierarchyProvider: !!caps.typeHierarchyProvider,
    raw: caps
  };
}
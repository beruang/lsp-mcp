import { test } from "node:test";
import assert from "node:assert/strict";
import { extractCapabilities } from "./capabilities.js";

test("extractCapabilities returns defaults for missing caps", () => {
  const result = extractCapabilities({});
  assert.equal(result.hoverProvider, false);
  assert.equal(result.declarationProvider, false);
  assert.equal(result.callHierarchyProvider, false);
  assert.equal(result.typeHierarchyProvider, false);
});

test("extractCapabilities detects V3 providers", () => {
  const caps = {
    declarationProvider: true,
    typeDefinitionProvider: true,
    implementationProvider: true,
    signatureHelpProvider: { triggerCharacters: ["("] },
    completionProvider: { triggerCharacters: ["."] },
    callHierarchyProvider: true,
    typeHierarchyProvider: true,
  };
  const result = extractCapabilities(caps);
  assert.equal(result.declarationProvider, true);
  assert.equal(result.typeDefinitionProvider, true);
  assert.equal(result.implementationProvider, true);
  assert.equal(result.signatureHelpProvider, true);
  assert.equal(result.completionProvider, true);
  assert.equal(result.callHierarchyProvider, true);
  assert.equal(result.typeHierarchyProvider, true);
});

test("extractCapabilities preserves V1+V2 fields", () => {
  const caps = {
    hoverProvider: true,
    definitionProvider: true,
    referencesProvider: true,
    codeActionProvider: true,
    documentFormattingProvider: true,
  };
  const result = extractCapabilities(caps);
  assert.equal(result.hoverProvider, true);
  assert.equal(result.definitionProvider, true);
  assert.equal(result.referencesProvider, true);
  assert.equal(result.codeActionProvider, true);
  assert.equal(result.documentFormattingProvider, true);
  assert.equal(result.documentRangeFormattingProvider, false);
});

test("extractCapabilities stores raw capabilities", () => {
  const caps = { customField: 42 };
  const result = extractCapabilities(caps);
  assert.equal(result.raw.customField, 42);
});

test("extractCapabilities handles null input", () => {
  const result = extractCapabilities(null);
  assert.equal(result.hoverProvider, false);
  assert.equal(result.declarationProvider, false);
});

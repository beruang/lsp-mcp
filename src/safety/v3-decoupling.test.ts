import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const V3_FILES = [
  "src/hierarchy/callHierarchyCache.ts",
  "src/hierarchy/callHierarchyTools.ts",
  "src/hierarchy/typeHierarchyCache.ts",
  "src/hierarchy/typeHierarchyTools.ts",
  "src/navigation/declaration.ts",
  "src/navigation/typeDefinition.ts",
  "src/navigation/implementation.ts",
  "src/navigation/signatureHelp.ts",
  "src/navigation/completion.ts",
  "src/semantic/analyzeChangeImpact.ts",
  "src/semantic/fixDiagnosticCandidates.ts",
  "src/semantic/explainDiagnostics.ts",
  "src/semantic/riskHeuristics.ts",
];

test("V3 source files contain no ast_ references", () => {
  for (const file of V3_FILES) {
    const content = readFileSync(file, "utf-8");
    assert.ok(!content.includes("ast_"), `${file} must not contain ast_ references`);
  }
});

test("V3 source files contain no tree-sitter or ts-morph imports", () => {
  for (const file of V3_FILES) {
    const content = readFileSync(file, "utf-8");
    assert.ok(!content.includes("tree-sitter"), `${file} must not import tree-sitter`);
    assert.ok(!content.includes("ts-morph"), `${file} must not import ts-morph`);
  }
});

test("registerTools.ts does not contain removed tools", () => {
  const content = readFileSync("src/mcp/registerTools.ts", "utf-8");
  assert.ok(!content.includes("lsp_symbol_context"), "must not contain lsp_symbol_context");
  assert.ok(!content.includes("lsp_enclosing_symbol"), "must not contain lsp_enclosing_symbol");
  assert.ok(!content.includes("lsp_file_outline"), "must not contain lsp_file_outline");
});

test("no AST directories exist", () => {
  assert.equal(existsSync("src/ast/"), false, "src/ast/ must not exist");
  assert.equal(existsSync("src/parser/"), false, "src/parser/ must not exist");
  assert.equal(existsSync("src/treeSitter/"), false, "src/treeSitter/ must not exist");
});

test("no AST deps in package.json", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  assert.ok(!("tree-sitter" in deps), "tree-sitter must not be in dependencies");
  assert.ok(!("ts-morph" in deps), "ts-morph must not be in dependencies");
  assert.ok(!("web-tree-sitter" in deps), "web-tree-sitter must not be in dependencies");
});

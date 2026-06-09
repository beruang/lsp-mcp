import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyRisk, generateRecommendations } from "./riskHeuristics.js";

test("classifyRisk returns high risk for high reference count", () => {
  const risks = classifyRisk({
    referenceCount: 150, affectedFiles: 2, incomingCallers: 0,
    implementationCount: 0, hasNearbyDiagnostics: false, definitionsOutsideFile: false,
  });
  assert.ok(risks.some(r => r.level === "high" && r.message.includes("reference count")));
});

test("classifyRisk returns high risk for many incoming callers", () => {
  const risks = classifyRisk({
    referenceCount: 5, affectedFiles: 2, incomingCallers: 30,
    implementationCount: 0, hasNearbyDiagnostics: false, definitionsOutsideFile: false,
  });
  assert.ok(risks.some(r => r.level === "high" && r.message.includes("incoming callers")));
});

test("classifyRisk returns high risk for many implementations", () => {
  const risks = classifyRisk({
    referenceCount: 5, affectedFiles: 2, incomingCallers: 0,
    implementationCount: 10, hasNearbyDiagnostics: false, definitionsOutsideFile: false,
  });
  assert.ok(risks.some(r => r.level === "high" && r.message.includes("implementations")));
});

test("classifyRisk returns high risk for many affected files", () => {
  const risks = classifyRisk({
    referenceCount: 50, affectedFiles: 15, incomingCallers: 0,
    implementationCount: 0, hasNearbyDiagnostics: false, definitionsOutsideFile: false,
  });
  assert.ok(risks.some(r => r.level === "high" && r.message.includes("blast radius")));
});

test("classifyRisk returns medium risk for moderate reference count", () => {
  const risks = classifyRisk({
    referenceCount: 50, affectedFiles: 2, incomingCallers: 0,
    implementationCount: 0, hasNearbyDiagnostics: false, definitionsOutsideFile: false,
  });
  assert.ok(risks.some(r => r.level === "medium" && r.message.includes("reference count")));
});

test("classifyRisk returns medium risk for nearby diagnostics", () => {
  const risks = classifyRisk({
    referenceCount: 5, affectedFiles: 2, incomingCallers: 0,
    implementationCount: 0, hasNearbyDiagnostics: true, definitionsOutsideFile: false,
  });
  assert.ok(risks.some(r => r.level === "medium" && r.message.includes("diagnostics")));
});

test("classifyRisk returns low risk when no flags trigger", () => {
  const risks = classifyRisk({
    referenceCount: 5, affectedFiles: 1, incomingCallers: 0,
    implementationCount: 0, hasNearbyDiagnostics: false, definitionsOutsideFile: false,
  });
  assert.ok(risks.some(r => r.level === "low"));
  assert.equal(risks.length, 1);
});

test("generateRecommendations suggests rename_preview for rename", () => {
  const recs = generateRecommendations([], "rename");
  assert.ok(recs.some(r => r.includes("lsp_rename_preview")));
});

test("generateRecommendations suggests snapshot for high risk", () => {
  const risks = [{ level: "high" as const, message: "test" }];
  const recs = generateRecommendations(risks, "signature_change");
  assert.ok(recs.some(r => r.includes("Snapshot diagnostics")));
});

test("generateRecommendations gives default for low risk with unknown change", () => {
  const risks = [{ level: "low" as const, message: "test" }];
  const recs = generateRecommendations(risks, "unknown");
  assert.ok(recs.some(r => r.includes("Low-risk")));
});

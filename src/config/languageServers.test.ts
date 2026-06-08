import { describe, it } from "node:test";
import assert from "node:assert";
import { routeLanguage } from "./languageServers.js";

describe("routeLanguage", () => {
  it(".ts routes to typescript", () => {
    assert.strictEqual(routeLanguage(".ts"), "typescript");
  });

  it(".tsx routes to typescript", () => {
    assert.strictEqual(routeLanguage(".tsx"), "typescript");
  });

  it(".js routes to typescript", () => {
    assert.strictEqual(routeLanguage(".js"), "typescript");
  });

  it(".jsx routes to typescript", () => {
    assert.strictEqual(routeLanguage(".jsx"), "typescript");
  });

  it(".py routes to python", () => {
    assert.strictEqual(routeLanguage(".py"), "python");
  });

  it(".rb routes to null", () => {
    assert.strictEqual(routeLanguage(".rb"), null);
  });

  it("ts (no leading dot) routes to null", () => {
    assert.strictEqual(routeLanguage("ts"), null);
  });
});
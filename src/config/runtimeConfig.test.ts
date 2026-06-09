import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "./defaults.js";
import { loadEnvConfig } from "./envConfig.js";
import { getEffectiveConfig, updateRuntimeConfig, resetRuntimeConfig } from "./runtimeConfig.js";

describe("Phase 1: Runtime Config", () => {
  beforeEach(() => {
    resetRuntimeConfig();
  });

  afterEach(() => {
    resetRuntimeConfig();
  });

  describe("defaults", () => {
    it("has all required top-level sections", () => {
      assert.ok(DEFAULT_CONFIG.workspacePath);
      assert.ok(DEFAULT_CONFIG.limits);
      assert.ok(DEFAULT_CONFIG.timeoutsMs);
      assert.ok(DEFAULT_CONFIG.caches);
      assert.ok(DEFAULT_CONFIG.debug);
    });

    it("has positive limits", () => {
      const { limits } = DEFAULT_CONFIG;
      for (const [, value] of Object.entries(limits)) {
        assert.ok(value > 0, `limit ${value} should be positive`);
      }
    });

    it("has reasonable timeout values", () => {
      const { timeoutsMs } = DEFAULT_CONFIG;
      for (const [, value] of Object.entries(timeoutsMs)) {
        assert.ok(value >= 1_000, `timeout ${value} should be >= 1000ms`);
      }
    });

    it("has rawRequestEnabled default to false", () => {
      assert.strictEqual(DEFAULT_CONFIG.debug.rawRequestEnabled, false);
    });
  });

  describe("env config", () => {
    it("returns defaults when no env vars set", () => {
      const env = loadEnvConfig();
      // Env config without env vars should produce the same values as defaults
      assert.ok(env.limits);
      assert.ok(env.timeoutsMs);
    });

    it("parses LSP_MAX_REFERENCES override", () => {
      process.env.LSP_MAX_REFERENCES = "500";
      const env = loadEnvConfig();
      assert.strictEqual(env.limits?.maxReferences, 500);
      delete process.env.LSP_MAX_REFERENCES;
    });

    it("ignores invalid numeric env values", () => {
      process.env.LSP_MAX_REFERENCES = "not_a_number";
      const env = loadEnvConfig();
      assert.strictEqual(env.limits?.maxReferences, DEFAULT_CONFIG.limits.maxReferences);
      delete process.env.LSP_MAX_REFERENCES;
    });
  });

  describe("getEffectiveConfig", () => {
    it("returns default config with no overrides", () => {
      const config = getEffectiveConfig();
      assert.strictEqual(config.limits.maxReferences, DEFAULT_CONFIG.limits.maxReferences);
    });

    it("merges env overrides over defaults", () => {
      process.env.LSP_MAX_REFERENCES = "999";
      const config = getEffectiveConfig();
      assert.strictEqual(config.limits.maxReferences, 999);
      delete process.env.LSP_MAX_REFERENCES;
    });
  });

  describe("updateRuntimeConfig", () => {
    it("accepts valid limit update", () => {
      const result = updateRuntimeConfig({ limits: { maxReferences: 150 } });
      assert.strictEqual(result.config.limits.maxReferences, 150);
      assert.deepStrictEqual(result.rejected, []);
    });

    it("accepts valid timeout update", () => {
      const result = updateRuntimeConfig({ timeoutsMs: { hover: 5000 } });
      assert.strictEqual(result.config.timeoutsMs.hover, 5000);
    });

    it("rejects workspacePath update", () => {
      const result = updateRuntimeConfig({ workspacePath: "/hacked" } as Record<string, unknown>);
      assert.ok(result.rejected.some((r) => r.includes("immutable")));
      // workspacePath should still be the original
      assert.strictEqual(result.config.workspacePath, DEFAULT_CONFIG.workspacePath);
    });

    it("rejects unknown config keys", () => {
      const result = updateRuntimeConfig({ unknownSection: {} } as Record<string, unknown>);
      assert.ok(result.rejected.some((r) => r.includes("unknown key")));
    });

    it("rejects negative limit values", () => {
      const result = updateRuntimeConfig({ limits: { maxReferences: -5 } });
      assert.ok(result.rejected.some((r) => r.includes("maxReferences")));
    });

    it("accepts debug boolean update", () => {
      const result = updateRuntimeConfig({ debug: { rawRequestEnabled: true } });
      assert.strictEqual(result.config.debug.rawRequestEnabled, true);
    });

    it("runtime overrides take precedence over env", () => {
      process.env.LSP_MAX_REFERENCES = "888";
      updateRuntimeConfig({ limits: { maxReferences: 777 } });
      const config = getEffectiveConfig();
      assert.strictEqual(config.limits.maxReferences, 777);
      delete process.env.LSP_MAX_REFERENCES;
    });
  });

  describe("resetRuntimeConfig", () => {
    it("clears runtime overrides", () => {
      updateRuntimeConfig({ limits: { maxReferences: 123 } });
      resetRuntimeConfig();
      const config = getEffectiveConfig();
      assert.strictEqual(config.limits.maxReferences, DEFAULT_CONFIG.limits.maxReferences);
    });
  });
});

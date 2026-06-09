import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LspState } from "./LspState.js";

describe("LspState", () => {
  function newState() {
    return new LspState("typescript", "typescript-language-server", ["--stdio"]);
  }

  describe("initial state", () => {
    it("starts as not_started", () => {
      const s = newState();
      assert.strictEqual(s.state, "not_started");
    });

    it("has zero counters", () => {
      const s = newState();
      assert.strictEqual(s.restartCount, 0);
      assert.strictEqual(s.crashCount, 0);
    });
  });

  describe("valid transitions", () => {
    it("not_started → starting", () => {
      const s = newState();
      assert.strictEqual(s.transition("starting"), true);
      assert.strictEqual(s.state, "starting");
    });

    it("starting → initializing", () => {
      const s = newState();
      s.transition("starting");
      assert.strictEqual(s.transition("initializing"), true);
      assert.strictEqual(s.state, "initializing");
    });

    it("initializing → running", () => {
      const s = newState();
      s.transition("starting");
      s.transition("initializing");
      assert.strictEqual(s.transition("running"), true);
      assert.strictEqual(s.state, "running");
    });

    it("running → stopping → stopped", () => {
      const s = newState();
      s.transition("starting");
      s.transition("initializing");
      s.transition("running");
      assert.strictEqual(s.transition("stopping"), true);
      assert.strictEqual(s.transition("stopped"), true);
      assert.strictEqual(s.state, "stopped");
    });

    it("running → crashed", () => {
      const s = newState();
      s.transition("starting");
      s.transition("initializing");
      s.transition("running");
      assert.strictEqual(s.transition("crashed"), true);
      assert.strictEqual(s.state, "crashed");
      assert.strictEqual(s.crashCount, 1);
    });

    it("crashed → starting (restart)", () => {
      const s = newState();
      s.transition("starting");
      s.transition("initializing");
      s.transition("running");
      s.transition("crashed");
      assert.strictEqual(s.transition("starting"), true);
      assert.strictEqual(s.state, "starting");
      assert.strictEqual(s.restartCount, 1);
    });

    it("failed → starting (restart)", () => {
      const s = newState();
      s.transition("starting");
      s.transition("failed");
      assert.strictEqual(s.transition("starting"), true);
      assert.strictEqual(s.state, "starting");
      assert.strictEqual(s.restartCount, 1);
    });
  });

  describe("invalid transitions", () => {
    it("not_started → running (skipping starting/initializing)", () => {
      const s = newState();
      assert.strictEqual(s.transition("running"), false);
      assert.strictEqual(s.state, "not_started");
    });

    it("not_started → stopped", () => {
      const s = newState();
      assert.strictEqual(s.transition("stopped"), false);
    });

    it("running → not_started", () => {
      const s = newState();
      s.transition("starting");
      s.transition("initializing");
      s.transition("running");
      assert.strictEqual(s.transition("not_started"), false);
      assert.strictEqual(s.state, "running");
    });

    it("stopped → running (no restart)", () => {
      const s = newState();
      s.transition("starting");
      s.transition("initializing");
      s.transition("running");
      s.transition("stopping");
      s.transition("stopped");
      assert.strictEqual(s.transition("running"), false);
      assert.strictEqual(s.state, "stopped");
    });
  });

  describe("runtime status", () => {
    it("reports correct status after startup", () => {
      const s = newState();
      s.transition("starting");
      s.transition("initializing");
      s.transition("running");
      s.pid = 12345;
      s.capabilitiesKnown = true;

      const status = s.getRuntimeStatus();
      assert.strictEqual(status.state, "running");
      assert.strictEqual(status.pid, 12345);
      assert.strictEqual(status.capabilitiesKnown, true);
      assert.ok(status.startedAt);
      assert.ok(status.initializedAt);
      assert.ok(typeof status.uptimeMs === "number");
    });
  });

  describe("history", () => {
    it("records transitions", () => {
      const s = newState();
      s.transition("starting");
      s.transition("initializing");
      s.transition("running");
      const h = s.getHistory();
      assert.strictEqual(h.length, 3);
      assert.strictEqual(h[0].from, "not_started");
      assert.strictEqual(h[0].to, "starting");
    });

    it("caps at 20 entries", () => {
      const s = newState();
      for (let i = 0; i < 25; i++) {
        // Bounce between starting and failed
        s.transition("starting");
        s.transition("failed");
      }
      const h = s.getHistory();
      assert.ok(h.length <= 20);
    });
  });
});

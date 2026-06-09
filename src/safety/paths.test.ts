import { describe, it } from "node:test";
import assert from "node:assert";
import { safeResolve, PathOutsideWorkspaceError } from "./paths.js";
import { tmpdir } from "os";
import { mkdtemp, rm, mkdir, writeFile, symlink, realpath } from "fs/promises";
import { join } from "path";

describe("safeResolve", () => {
  let ws: string;

  it.before(async () => {
    ws = await mkdtemp(join(tmpdir(), "lsp-ws-"));
    await mkdir(join(ws, "src"), { recursive: true });
    await writeFile(join(ws, "src", "index.ts"), "// hello");
  });

  it.after(async () => {
    await rm(ws, { recursive: true, force: true });
  });

  // relative inside
  it("relative inside resolves to absolute path", async () => {
    const result = await safeResolve(ws, "src/index.ts");
    const expected = await realpath(join(ws, "src", "index.ts"));
    assert.strictEqual(result, expected);
  });

  // relative ..
  it("relative .. outside throws", async () => {
    await assert.rejects(
      () => safeResolve(ws, "../outside.ts"),
      (err: any) => err instanceof PathOutsideWorkspaceError
    );
  });

  // absolute inside
  it("absolute inside resolves", async () => {
    const result = await safeResolve(ws, join(ws, "src", "index.ts"));
    const expected = await realpath(join(ws, "src", "index.ts"));
    assert.strictEqual(result, expected);
  });

  // absolute outside
  it("absolute outside throws", async () => {
    await assert.rejects(
      () => safeResolve(ws, "/etc/passwd"),
      (err: any) => err instanceof PathOutsideWorkspaceError
    );
  });

  // workspace root
  it("workspace root throws", async () => {
    await assert.rejects(
      () => safeResolve(ws, ws),
      (err: any) => err instanceof PathOutsideWorkspaceError
    );
  });

  // symlink outside
  it("symlink pointing outside throws", async () => {
    const outsideFile = await mkdtemp(join(tmpdir(), "lsp-outside-"));
    const outsidePath = join(outsideFile, "secret.txt");
    await writeFile(outsidePath, "secret");
    const leakPath = join(ws, "leak");
    await symlink(outsidePath, leakPath);
    try {
      await assert.rejects(
        () => safeResolve(ws, "leak"),
        (err: any) => err instanceof PathOutsideWorkspaceError
      );
    } finally {
      await rm(outsideFile, { recursive: true, force: true });
      await rm(leakPath, { recursive: true, force: true }).catch(() => {});
    }
  });

  // broken symlink
  it("broken symlink throws", async () => {
    const brokenPath = join(ws, "broken");
    await symlink("/nonexistent/broken/link", brokenPath);
    try {
      await assert.rejects(
        () => safeResolve(ws, "broken"),
        (err: any) => err instanceof PathOutsideWorkspaceError
      );
    } finally {
      await rm(brokenPath, { recursive: true, force: true }).catch(() => {});
    }
  });

  // file:// URI scheme
  it("file:// URI scheme throws", async () => {
    await assert.rejects(
      () => safeResolve(ws, "file:///etc/passwd"),
      (err: any) => err instanceof PathOutsideWorkspaceError
    );
  });
});
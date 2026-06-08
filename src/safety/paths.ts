import { resolve, relative, isAbsolute } from "path";
import { realpath } from "fs/promises";

export class PathOutsideWorkspaceError extends Error {
  constructor(inputPath: string) {
    super("Path is outside workspace: " + inputPath);
    this.name = "PathOutsideWorkspaceError";
  }
}

export async function safeResolve(workspacePath: string, inputPath: string): Promise<string> {
  if (inputPath.startsWith("file://")) {
    throw new PathOutsideWorkspaceError(inputPath);
  }

  let workspaceAbs: string;
  try {
    workspaceAbs = await realpath(resolve(workspacePath));
  } catch {
    throw new PathOutsideWorkspaceError(inputPath);
  }

  const candidate = isAbsolute(inputPath)
    ? resolve(inputPath)
    : resolve(workspaceAbs, inputPath);

  let real: string;
  try {
    real = await realpath(candidate);
  } catch {
    throw new PathOutsideWorkspaceError(inputPath);
  }

  const rel = relative(workspaceAbs, real);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new PathOutsideWorkspaceError(inputPath);
  }

  if (real === workspaceAbs) {
    throw new PathOutsideWorkspaceError(inputPath);
  }

  return real;
}
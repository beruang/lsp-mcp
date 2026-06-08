import { pathToFileURL as nodePathToFileURL } from "node:url";

export function pathToFileURL(workspacePath: string): URL {
  return nodePathToFileURL(workspacePath);
}

export function workspaceUri(workspacePath: string): string {
  return nodePathToFileURL(workspacePath).toString();
}
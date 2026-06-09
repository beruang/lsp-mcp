const DENIED_METHODS = new Set([
  "workspace/applyEdit",
  "workspace/executeCommand",
  "workspace/didChangeConfiguration",
  "workspace/didChangeWorkspaceFolders",
  "client/registerCapability",
  "client/unregisterCapability",
]);

const DENIED_PATTERNS = [
  /\/executeCommand$/,
];

export function isMethodSafe(method: string): boolean {
  if (DENIED_METHODS.has(method)) return false;
  for (const pattern of DENIED_PATTERNS) {
    if (pattern.test(method)) return false;
  }
  return true;
}

/**
 * Command allowlist. Empty by default — no LSP commands are allowed to execute.
 * Users can populate this via configuration if needed.
 */
const allowedCommands = new Set<string>();

export function isCommandAllowed(command: string): boolean {
  return allowedCommands.has(command);
}

export function getAllowedCommands(): ReadonlySet<string> {
  return allowedCommands;
}

export function registerAllowedCommand(command: string): void {
  allowedCommands.add(command);
}

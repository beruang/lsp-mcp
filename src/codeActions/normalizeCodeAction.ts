import type { SafetyViolation } from "../workspaceEdit/validateWorkspaceEdit.js";
import { isCommandAllowed } from "./commandSafety.js";

export interface NormalizedCodeActionPreview {
  id: string;
  title: string;
  kind?: string;
  isPreferred: boolean;
  disabled?: boolean;
  hasCommand: boolean;
  commandTitle?: string;
  commandAllowed: boolean;
  hasEdit: boolean;
  safe: boolean;
  changedFiles: string[];
  editCount: number;
  diff?: string;
  workspaceEdit?: unknown;
  violations: SafetyViolation[];
  isCached: boolean;
  cachedActionId?: string;
}

interface LspCommand {
  title: string;
  command: string;
  arguments?: unknown[];
}

interface LspCodeAction {
  title: string;
  kind?: string;
  diagnostics?: unknown[];
  isPreferred?: boolean;
  disabled?: string;
  edit?: unknown;
  command?: LspCommand;
}

export function normalizeCodeAction(
  raw: LspCodeAction | LspCommand,
  cachedActionId?: string
): NormalizedCodeActionPreview {
  // Command shape
  if ("command" in raw && !("edit" in raw) && !("kind" in raw)) {
    const cmd = raw as LspCommand;
    return {
      id: `cmd-${cmd.command}`,
      title: cmd.title,
      hasCommand: true,
      commandTitle: cmd.title,
      commandAllowed: isCommandAllowed(cmd.command),
      hasEdit: false,
      safe: false,
      changedFiles: [],
      editCount: 0,
      violations: [],
      isPreferred: false,
      isCached: false,
    };
  }

  // CodeAction shape
  const ca = raw as LspCodeAction;
  const hasCommand = !!ca.command;
  const commandTitle = ca.command?.title;
  const commandAllowed = ca.command ? isCommandAllowed(ca.command.command) : true;

  const preview: NormalizedCodeActionPreview = {
    id: `ca-${ca.title}`,
    title: ca.title,
    kind: ca.kind,
    isPreferred: ca.isPreferred === true,
    disabled: ca.disabled ? true : undefined,
    hasCommand,
    commandTitle,
    commandAllowed: hasCommand ? commandAllowed : true,
    hasEdit: !!ca.edit,
    safe: true,
    changedFiles: [],
    editCount: 0,
    violations: [],
    isCached: !!cachedActionId,
    cachedActionId,
  };

  return preview;
}

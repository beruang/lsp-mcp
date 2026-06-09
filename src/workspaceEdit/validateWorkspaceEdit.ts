import { existsSync } from "node:fs";
import type { ParsedWorkspaceEdit } from "./parseWorkspaceEdit.js";
import { detectOverlappingEdits } from "./overlappingEdits.js";

export interface SafetyViolation {
  type:
    | "outside_workspace"
    | "unsupported_scheme"
    | "directory_edit"
    | "file_not_found"
    | "too_many_files"
    | "too_many_edits"
    | "overlapping_edits"
    | "unsupported_resource_operation"
    | "unsafe_command"
    | "capability_unsupported"
    | "unknown";
  message: string;
  filePath?: string;
  uri?: string;
  details?: unknown;
}

export interface ValidationResult {
  safe: boolean;
  changedFiles: string[];
  editCount: number;
  violations: SafetyViolation[];
}

export interface ValidationOptions {
  maxFiles?: number;
  maxEdits?: number;
}

const DEFAULT_MAX_FILES = 100;
const DEFAULT_MAX_EDITS = 1000;

export function validateWorkspaceEdit(
  parsed: ParsedWorkspaceEdit,
  _workspacePath: string,
  options?: ValidationOptions
): ValidationResult {
  const violations: SafetyViolation[] = [];
  const maxFiles = options?.maxFiles ?? DEFAULT_MAX_FILES;
  const maxEdits = options?.maxEdits ?? DEFAULT_MAX_EDITS;

  // 1. Unsupported schemes
  for (const scheme of parsed.unsupportedSchemes) {
    violations.push({
      type: "unsupported_scheme",
      message: `Unsupported URI scheme: ${scheme}`,
      uri: scheme,
    });
  }

  // 2. Resource operations — reject
  for (const op of parsed.resourceOperations) {
    violations.push({
      type: "unsupported_resource_operation",
      message: `Resource operation not supported: ${op.kind} ${op.uri}`,
      uri: op.uri,
    });
  }

  // 3. Max files
  if (parsed.changedFiles.length > maxFiles) {
    violations.push({
      type: "too_many_files",
      message: `Too many changed files: ${parsed.changedFiles.length} (max ${maxFiles})`,
      details: { count: parsed.changedFiles.length, max: maxFiles },
    });
  }

  // 4. Max edits
  if (parsed.editCount > maxEdits) {
    violations.push({
      type: "too_many_edits",
      message: `Too many edits: ${parsed.editCount} (max ${maxEdits})`,
      details: { count: parsed.editCount, max: maxEdits },
    });
  }

  // 5. Overlapping edits
  violations.push(...detectOverlappingEdits(parsed.edits));

  // 6. File existence
  for (const filePath of parsed.changedFiles) {
    if (!existsSync(filePath)) {
      violations.push({
        type: "file_not_found",
        message: `File not found: ${filePath}`,
        filePath,
      });
    }
  }

  return {
    safe: violations.length === 0,
    changedFiles: parsed.changedFiles,
    editCount: parsed.editCount,
    violations,
  };
}

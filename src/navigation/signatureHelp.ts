import { LspClient } from "../lsp/LspClient.js";
import { LIMITS } from "../safety/limits.js";

export interface NormalizedSignatureHelp {
  filePath: string;
  position: { line: number; character: number };
  signatures: Array<{
    label: string;
    documentation?: string;
    parameters: Array<{ label: string; documentation?: string }>;
  }>;
  activeSignature?: number;
  activeParameter?: number;
}

function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, "").trim())
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function normalizeParameterLabel(label: string | [number, number]): string {
  if (typeof label === "string") return label;
  if (Array.isArray(label)) return `[${label[0]}..${label[1]}]`;
  return String(label);
}

export async function getSignatureHelp(
  client: LspClient,
  uri: string,
  position: { line: number; character: number },
  filePath: string
): Promise<NormalizedSignatureHelp> {
  const raw = await client.request("textDocument/signatureHelp", {
    textDocument: { uri },
    position,
  }, LIMITS.TIMEOUTS.SIGNATURE_HELP_MS) as any;

  const result: NormalizedSignatureHelp = {
    filePath,
    position,
    signatures: [],
  };

  if (!raw || !raw.signatures) return result;

  result.activeSignature = raw.activeSignature;
  result.activeParameter = raw.activeParameter;

  result.signatures = raw.signatures.map((sig: any) => ({
    label: sig.label ?? "",
    documentation: sig.documentation
      ? stripMarkdown(typeof sig.documentation === "string" ? sig.documentation : sig.documentation.value ?? "")
      : undefined,
    parameters: (sig.parameters ?? []).map((p: any) => ({
      label: normalizeParameterLabel(p.label),
      documentation: p.documentation
        ? stripMarkdown(typeof p.documentation === "string" ? p.documentation : p.documentation.value ?? "")
        : undefined,
    })),
  }));

  return result;
}

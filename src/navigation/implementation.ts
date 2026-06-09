import { LspClient } from "../lsp/LspClient.js";
import { locationFromLsp } from "../lsp/normalize.js";
import { clampResults, LIMITS } from "../safety/limits.js";

export async function getImplementationAt(
  client: LspClient,
  uri: string,
  position: { line: number; character: number },
  workspacePath: string,
  maxResults: number = LIMITS.IMPLEMENTATION_MAX
) {
  const raw = await client.request("textDocument/implementation", {
    textDocument: { uri },
    position,
  }, LIMITS.TIMEOUTS.IMPLEMENTATION_MS) as any;

  const locs: Array<{ filePath: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }> = [];

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const loc = locationFromLsp(workspacePath, item);
      if (loc) locs.push(loc);
    }
  } else if (raw) {
    const loc = locationFromLsp(workspacePath, raw);
    if (loc) locs.push(loc);
  }

  const clamped = clampResults(locs, maxResults);
  return { locations: clamped.items, returned: clamped.returned, truncated: clamped.truncated };
}

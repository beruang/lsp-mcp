import { LspClient } from "../src/lsp/LspClient.js";
import { pathToFileURL } from "../src/utils/uri.js";

async function main() {
  const workspacePath = process.cwd();
  const rootUri = pathToFileURL(workspacePath).toString();

  try {
    const client = await LspClient.spawn({
      command: "typescript-language-server",
      args: ["--stdio"],
      workspacePath,
      rootUri,
      startupTimeoutMs: 30_000
    });

    console.log(JSON.stringify({ ok: true, capabilities: client.getCapabilities() }, null, 2));

    await client.shutdown();
    process.exit(0);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}

main();
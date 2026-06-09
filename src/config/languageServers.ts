export type LanguageServerEntry = {
  extensions: string[];
  command: string;
  args: string[];
  languageId: string;
};

export const languageServers: Record<string, LanguageServerEntry> = {
  typescript: {
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    command: "typescript-language-server",
    args: ["--stdio"],
    languageId: "typescript",
  },
  python: {
    extensions: [".py"],
    command: "pyright-langserver",
    args: ["--stdio"],
    languageId: "python",
  },
  go: {
    extensions: [".go"],
    command: "gopls",
    args: [],
    languageId: "go",
  },
  rust: {
    extensions: [".rs"],
    command: "rust-analyzer",
    args: [],
    languageId: "rust",
  },
};

export function routeLanguage(ext: string): string | null {
  if (!ext || !ext.startsWith(".")) return null;
  for (const [lang, entry] of Object.entries(languageServers)) {
    if (entry.extensions.includes(ext)) return lang;
  }
  return null;
}
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const byExtDefault: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescriptreact",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascriptreact",
  py: "python",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  go: "go",
  rs: "rust",
  rb: "ruby",
  php: "php",
  cs: "csharp",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  c: "c",
  h: "c",
  hpp: "cpp",
  swift: "swift",
  scala: "scala",
  md: "markdown",
  json: "json",
  jsonc: "jsonc",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  sql: "sql",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  xml: "xml",
  vue: "vue",
  svelte: "svelte",
  dart: "dart",
  lua: "lua",
};

const aliasesDefault: Record<string, string> = {
  "c++": "cpp",
  "c#": "csharp",
  "objective-c": "objectivec",
  shell: "shellscript",
  "shell script": "shellscript",
  "typescript jsx": "typescriptreact",
  "javascript jsx": "javascriptreact",
  "ecmascript 6": "javascript",
  tsx: "typescriptreact",
  jsx: "javascriptreact",
  golang: "go",
  yml: "yaml",
};

const plaintextIdsDefault = new Set([
  "text",
  "textmate",
  "plaintext",
  "plain text",
  "plain_text",
]);

let byExt = byExtDefault;
let aliases = aliasesDefault;
let plaintextIds = plaintextIdsDefault;

/** Optional load from packages/completion/contracts language-map.json when available. */
export function loadLanguageMapFromSpec(specPath?: string): void {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const path = specPath ?? join(here, "../../contracts/language-map.json");
    const raw = JSON.parse(readFileSync(path, "utf8")) as {
      byExt?: Record<string, string>;
      aliases?: Record<string, string>;
      plaintextIds?: string[];
    };
    if (raw.byExt) byExt = raw.byExt;
    if (raw.aliases) aliases = raw.aliases;
    if (Array.isArray(raw.plaintextIds) && raw.plaintextIds.length > 0) {
      plaintextIds = new Set(raw.plaintextIds.map((id) => id.trim().toLowerCase()));
    }
  } catch {
    // keep defaults
  }
}

export function normalizeLanguage(
  languageId: string | null | undefined,
  path: string | null | undefined,
): string {
  const raw = (languageId ?? "").trim().toLowerCase();
  if (raw && !plaintextIds.has(raw)) {
    return aliases[raw] ?? raw;
  }
  const base = path ? path.split(/[\\/]/).pop() ?? path : "";
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".") + 1).toLowerCase() : "";
  return byExt[ext] ?? (raw || "text");
}

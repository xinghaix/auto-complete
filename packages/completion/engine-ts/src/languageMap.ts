import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const byExtDefault: Record<string, string> = {
  ts: "typescript",
  tsx: "typescriptreact",
  js: "javascript",
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
  yml: "yaml",
  yaml: "yaml",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  sql: "sql",
  css: "css",
  scss: "scss",
  html: "html",
  xml: "xml",
  vue: "vue",
  svelte: "svelte",
  dart: "dart",
};

const aliasesDefault: Record<string, string> = {
  "c++": "cpp",
  "c#": "csharp",
  "objective-c": "objectivec",
  shell: "shellscript",
};

const plaintextIds = new Set(["text", "textmate", "plaintext", "plain text"]);

let byExt = byExtDefault;
let aliases = aliasesDefault;

/** Optional load from packages/completion/contracts language-map.json when available. */
export function loadLanguageMapFromSpec(specPath?: string): void {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const path =
      specPath ??
      join(here, "../../contracts/language-map.json");
    const raw = JSON.parse(readFileSync(path, "utf8")) as {
      byExt?: Record<string, string>;
      aliases?: Record<string, string>;
    };
    if (raw.byExt) byExt = raw.byExt;
    if (raw.aliases) aliases = raw.aliases;
  } catch {
    // keep defaults
  }
}

export function normalizeLanguage(languageId: string | null | undefined, path: string | null | undefined): string {
  const raw = (languageId ?? "").trim().toLowerCase();
  if (raw && !plaintextIds.has(raw)) {
    return aliases[raw] ?? raw;
  }
  const ext = path?.includes(".") ? path.slice(path.lastIndexOf(".") + 1).toLowerCase() : "";
  return byExt[ext] ?? (raw || "text");
}

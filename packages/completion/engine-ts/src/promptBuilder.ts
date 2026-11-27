import { createHash } from "node:crypto";

export interface BuiltPrompt {
  prefix: string;
  suffix: string;
  styleHint?: string;
}

export interface LruKeyOptions {
  promptTemplate?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  firstLineOnlyWhenMidLine?: boolean;
}

const SLASH_COMMENT_LANGS = new Set([
  "javascript",
  "javascriptreact",
  "typescript",
  "typescriptreact",
  "java",
  "kotlin",
  "scala",
  "go",
  "rust",
  "c",
  "cpp",
  "csharp",
  "php",
  "swift",
  "dart",
  "scss",
  "less",
  "jsonc",
]);

const HASH_COMMENT_LANGS = new Set([
  "python",
  "ruby",
  "shellscript",
  "bash",
  "zsh",
  "sh",
  "yaml",
  "toml",
  "perl",
  "r",
  "dockerfile",
  "makefile",
]);

const DASH_COMMENT_LANGS = new Set(["sql", "mysql", "postgresql", "lua", "haskell", "elm"]);

const HTML_COMMENT_LANGS = new Set(["html", "xml", "vue", "svelte", "markdown"]);

export function formatCommentLine(line: string, language?: string | null): string {
  const lang = (language ?? "").trim().toLowerCase();
  if (!lang) return line;
  if (SLASH_COMMENT_LANGS.has(lang)) return `// ${line}`;
  if (HASH_COMMENT_LANGS.has(lang)) return `# ${line}`;
  if (DASH_COMMENT_LANGS.has(lang)) return `-- ${line}`;
  if (HTML_COMMENT_LANGS.has(lang)) return `<!-- ${line} -->`;
  if (lang === "css") return `/* ${line} */`;
  return line;
}

export function buildPrompt(opts: {
  prefix: string;
  suffix: string;
  maxPrefixChars: number;
  maxSuffixChars: number;
  path?: string | null;
  language?: string | null;
  sendFilePath: boolean;
  recentSnippets?: string[];
}): BuiltPrompt {
  const prunedPrefix = takeEnd(opts.prefix, opts.maxPrefixChars);
  const prunedSuffix = takeStart(opts.suffix, opts.maxSuffixChars);
  const parts: string[] = [];
  if (opts.sendFilePath && opts.path?.trim()) {
    parts.push(formatCommentLine(`File: ${opts.path}`, opts.language));
  }
  if (opts.language?.trim()) {
    parts.push(formatCommentLine(`Language: ${opts.language}`, opts.language));
  }
  if (opts.recentSnippets && opts.recentSnippets.length > 0) {
    parts.push(formatCommentLine("Related snippets:", opts.language));
    opts.recentSnippets.forEach((snippet, index) => {
      parts.push(formatCommentLine(`--- snippet ${index + 1} ---`, opts.language));
      parts.push(snippet.replace(/\s+$/, ""));
    });
  }
  const header = parts.length ? parts.join("\n") + "\n" : "";
  const finalPrefix = header ? header + "\n" + prunedPrefix : prunedPrefix;
  return { prefix: finalPrefix, suffix: prunedSuffix, styleHint: "fim" };
}

export const STRICT_COMPLETION_INSTRUCTIONS =
  "You are a strict inline code completion engine. " +
  "Output ONLY the exact raw code to insert at <cursor> between <prefix> and <suffix>. " +
  "Never repeat text already in <prefix> or <suffix>. " +
  "Never wrap output in markdown code fences, backticks, or quotes. " +
  "Never add explanations, placeholder instructions, or conversational text. " +
  "If no completion makes sense, output nothing.";

export function chatUserContent(prefix: string, suffix: string): string {
  return (
    "Complete the code at <cursor>. Output only raw code to insert, nothing else.\n" +
    `<prefix>${prefix}</prefix><cursor><suffix>${suffix}</suffix>`
  );
}

export function lruKey(
  language: string,
  model: string,
  prefix: string,
  suffix: string,
  extra?: LruKeyOptions,
): string {
  const h = createHash("sha256");
  h.update(language);
  h.update("\0");
  h.update(model);
  h.update("\0");
  h.update(extra?.promptTemplate ?? "");
  h.update("\0");
  h.update(extra?.baseUrl ?? "");
  h.update("\0");
  h.update(extra?.temperature !== undefined ? String(extra.temperature) : "");
  h.update("\0");
  h.update(extra?.maxTokens !== undefined ? String(extra.maxTokens) : "");
  h.update("\0");
  h.update(
    extra?.firstLineOnlyWhenMidLine !== undefined
      ? String(extra.firstLineOnlyWhenMidLine)
      : "",
  );
  h.update("\0");
  h.update(String(prefix.length));
  h.update(":");
  h.update(prefix);
  h.update("\0");
  h.update(String(suffix.length));
  h.update(":");
  h.update(suffix);
  return h.digest("hex");
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

function takeEnd(text: string, max: number): string {
  if (max <= 0) return "";
  if (text.length <= max) return text;
  let start = text.length - max;
  if (
    start > 0 &&
    start < text.length &&
    isLowSurrogate(text.charCodeAt(start)) &&
    isHighSurrogate(text.charCodeAt(start - 1))
  ) {
    start += 1;
  }
  return text.slice(start);
}

function takeStart(text: string, max: number): string {
  if (max <= 0) return "";
  if (text.length <= max) return text;
  let end = max;
  if (
    end > 0 &&
    end < text.length &&
    isHighSurrogate(text.charCodeAt(end - 1)) &&
    isLowSurrogate(text.charCodeAt(end))
  ) {
    end -= 1;
  }
  return text.slice(0, end);
}

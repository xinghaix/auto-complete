import { createHash } from "node:crypto";

export const CURSOR_MARKER = "<|cursor|>";

export interface BuiltPrompt {
  prefix: string;
  suffix: string;
  styleHint?: string;
  header?: string;
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
  includeHeaderInPrefix?: boolean;
}): BuiltPrompt {
  const prunedPrefix = takeEnd(opts.prefix, opts.maxPrefixChars);
  const prunedSuffix = takeStart(opts.suffix, opts.maxSuffixChars);
  const includeHeader = opts.includeHeaderInPrefix !== false;
  const parts: string[] = [];
  if (opts.sendFilePath && opts.path?.trim()) {
    parts.push(
      includeHeader
        ? formatCommentLine(`File: ${opts.path}`, opts.language)
        : `File: ${opts.path}`,
    );
  }
  if (opts.language?.trim()) {
    parts.push(
      includeHeader
        ? formatCommentLine(`Language: ${opts.language}`, opts.language)
        : `Language: ${opts.language}`,
    );
  }
  if (opts.recentSnippets && opts.recentSnippets.length > 0) {
    parts.push(
      includeHeader
        ? formatCommentLine("Related snippets:", opts.language)
        : "Related snippets:",
    );
    opts.recentSnippets.forEach((snippet, index) => {
      const marker = `--- snippet ${index + 1} ---`;
      parts.push(includeHeader ? formatCommentLine(marker, opts.language) : marker);
      parts.push(snippet.replace(/\s+$/, ""));
    });
  }
  const header = parts.length ? parts.join("\n") + "\n" : "";
  const finalPrefix = includeHeader && header ? header + "\n" + prunedPrefix : prunedPrefix;
  return {
    prefix: finalPrefix,
    suffix: prunedSuffix,
    styleHint: includeHeader ? "fim" : "chat",
    header: includeHeader ? "" : header,
  };
}

export const COMPACT_SYSTEM_ROLE = "You are a strict inline code completion engine.";

export const STRICT_COMPLETION_INSTRUCTIONS =
  "Task: Inline code completion (Fill-In-the-Middle).\n" +
  "Rules:\n" +
  "1. Output ONLY the exact raw code to insert at <|cursor|> inside <code>.\n" +
  "2. Continue seamlessly from the exact characters immediately before <|cursor|>, staying syntactically valid in the immediate enclosing block (e.g. struct fields, function body, expression, SQL clause).\n" +
  "3. Never repeat characters already before or after <|cursor|>. Never copy unrelated lines from elsewhere in the file or <related_context>.\n" +
  "4. Never wrap output in markdown code fences, backticks, or quotes. Never add explanations, comments about placeholders, or conversational text.\n" +
  "5. Keep completions concise (usually the rest of the current line or small statement). If no completion makes sense, output nothing.\n\n" +
  "Example 1:\n" +
  "<code>def add(a, b):\n    <|cursor|>\n</code>\n" +
  "Completion:\n" +
  "return a + b\n\n" +
  "Example 2:\n" +
  '<code>type User struct {\n    Id   string `json:"id"`\n    Name <|cursor|>\n}</code>\n' +
  "Completion:\n" +
  'string `json:"name"`';

export function chatUserContent(
  prefix: string,
  suffix: string,
  opts?: {
    path?: string | null;
    language?: string | null;
    recentSnippets?: string[];
    embedRules?: boolean;
  },
): string {
  const parts: string[] = [];
  if (opts?.embedRules) {
    parts.push(`${STRICT_COMPLETION_INSTRUCTIONS}\n`);
  } else {
    parts.push(`Output ONLY the exact raw code to insert at ${CURSOR_MARKER}.`);
  }
  if (opts?.path?.trim()) {
    parts.push(`File: ${opts.path.trim()}`);
  }
  if (opts?.language?.trim()) {
    parts.push(`Language: ${opts.language.trim()}`);
  }
  if (opts?.recentSnippets && opts.recentSnippets.length > 0) {
    parts.push("<related_context>");
    opts.recentSnippets.forEach((snippet, index) => {
      parts.push(`--- snippet ${index + 1} ---`);
      parts.push(snippet.replace(/\s+$/, ""));
    });
    parts.push("</related_context>");
  }
  parts.push(`<code>\n${prefix}${CURSOR_MARKER}${suffix}\n</code>`);
  parts.push("Completion:\n");
  return parts.join("\n");
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

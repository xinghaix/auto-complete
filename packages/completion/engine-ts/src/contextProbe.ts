/**
 * Lightweight comment/string detection for skip gates.
 * Heuristic only — intentionally cheap for the hot path (TS dual of ContextProbe.kt).
 */
export type ContextProbeResult = {
  inComment: boolean;
  inString: boolean;
};

export function inspectContext(prefix: string, language: string): ContextProbeResult {
  const line = prefix.slice(prefix.lastIndexOf("\n") + 1);
  const lang = language.toLowerCase();
  if (isLineComment(line, lang)) return { inComment: true, inString: false };

  let inLineComment = false;
  let inBlockComment = false;
  let stringDelim: string | null = null;
  let escape = false;
  let i = 0;
  while (i < prefix.length) {
    const c = prefix[i]!;
    const n = prefix[i + 1];
    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && n === "/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (stringDelim != null) {
      if (escape) {
        escape = false;
        i++;
        continue;
      }
      if (c === "\\") {
        escape = true;
        i++;
        continue;
      }
      if (c === stringDelim) stringDelim = null;
      i++;
      continue;
    }
    if (c === "/" && n === "/" && supportsSlashComments(lang)) {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (c === "#" && supportsHashComments(lang)) {
      inLineComment = true;
      i++;
      continue;
    }
    if (c === "/" && n === "*" && supportsBlockComments(lang)) {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      stringDelim = c;
      i++;
      continue;
    }
    i++;
  }
  return {
    inComment: inLineComment || inBlockComment,
    inString: stringDelim != null,
  };
}

function isLineComment(line: string, lang: string): boolean {
  const t = line.trimStart();
  if (supportsSlashComments(lang) && t.startsWith("//")) return true;
  if (supportsHashComments(lang) && t.startsWith("#")) return true;
  if ((lang === "python" || lang === "ruby") && t.startsWith("#")) return true;
  return false;
}

function supportsSlashComments(lang: string): boolean {
  return (
    lang === "javascript" ||
    lang === "javascriptreact" ||
    lang === "typescript" ||
    lang === "typescriptreact" ||
    lang === "java" ||
    lang === "kotlin" ||
    lang === "scala" ||
    lang === "go" ||
    lang === "rust" ||
    lang === "c" ||
    lang === "cpp" ||
    lang === "csharp" ||
    lang === "php" ||
    lang === "swift" ||
    lang === "dart"
  );
}

function supportsHashComments(lang: string): boolean {
  return (
    lang === "python" ||
    lang === "ruby" ||
    lang === "shellscript" ||
    lang === "bash" ||
    lang === "zsh" ||
    lang === "sh" ||
    lang === "yaml" ||
    lang === "toml"
  );
}

function supportsBlockComments(lang: string): boolean {
  return (
    lang === "javascript" ||
    lang === "javascriptreact" ||
    lang === "typescript" ||
    lang === "typescriptreact" ||
    lang === "java" ||
    lang === "kotlin" ||
    lang === "scala" ||
    lang === "go" ||
    lang === "rust" ||
    lang === "c" ||
    lang === "cpp" ||
    lang === "csharp" ||
    lang === "php" ||
    lang === "css" ||
    lang === "scss" ||
    lang === "less"
  );
}

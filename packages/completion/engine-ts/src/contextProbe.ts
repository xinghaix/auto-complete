/**
 * Lightweight comment/string detection for skip gates.
 * Heuristic only — intentionally cheap for the hot path (TS dual of ContextProbe.kt).
 */
export type ContextProbeResult = {
  inComment: boolean;
  inString: boolean;
};

const MAX_SCAN_CHARS = 65_536;

export function inspectContext(prefix: string, language: string): ContextProbeResult {
  const lang = language.toLowerCase();
  const src = sliceScanWindow(prefix);

  let inLineComment = false;
  let blockCommentEnd: string | null = null;
  let stringDelim: string | null = null;
  let stringMultiline = false;
  let escape = false;
  let i = 0;

  while (i < src.length) {
    const c = src[i]!;
    const n = src[i + 1];
    const n2 = src[i + 2];

    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      i++;
      continue;
    }

    if (blockCommentEnd !== null) {
      if (src.startsWith(blockCommentEnd, i)) {
        i += blockCommentEnd.length;
        blockCommentEnd = null;
        continue;
      }
      i++;
      continue;
    }

    if (stringDelim !== null) {
      if (escape) {
        escape = false;
        i++;
        continue;
      }
      if (c === "\\" && lang !== "sql" && lang !== "mysql" && lang !== "postgresql") {
        escape = true;
        i++;
        continue;
      }
      if (!stringMultiline && c === "\n") {
        // Unclosed single-line string resets at newline so it cannot poison subsequent lines.
        stringDelim = null;
        i++;
        continue;
      }
      if (src.startsWith(stringDelim, i)) {
        i += stringDelim.length;
        stringDelim = null;
        stringMultiline = false;
        continue;
      }
      i++;
      continue;
    }

    // Comments
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
    if (c === "-" && n === "-" && supportsDashComments(lang)) {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (c === "/" && n === "*" && supportsBlockComments(lang)) {
      blockCommentEnd = "*/";
      i += 2;
      continue;
    }
    if (c === "<" && n === "!" && n2 === "-" && src[i + 3] === "-" && supportsHtmlComments(lang)) {
      blockCommentEnd = "-->";
      i += 4;
      continue;
    }

    // Triple-quoted multiline strings (Python """/''', Kotlin/Java/Scala/Swift """)
    if (c === '"' && n === '"' && n2 === '"' && supportsTripleDoubleQuotes(lang)) {
      stringDelim = '"""';
      stringMultiline = true;
      i += 3;
      continue;
    }
    if (c === "'" && n === "'" && n2 === "'" && lang === "python") {
      stringDelim = "'''";
      stringMultiline = true;
      i += 3;
      continue;
    }

    // Backtick template / raw multiline strings (JS/TS/Go/etc.)
    if (c === "`" && supportsBacktickStrings(lang)) {
      stringDelim = "`";
      stringMultiline = true;
      i++;
      continue;
    }

    // Rust lifetimes `'a`, `'static`, `'_` vs char literals `'x'` / `'\n'`
    if (c === "'" && lang === "rust") {
      if (n === "\\") {
        stringDelim = "'";
        stringMultiline = false;
        i++;
        continue;
      }
      if (n !== undefined && n2 === "'") {
        // Closed char literal e.g. 'a'
        i += 3;
        continue;
      }
      if (n !== undefined && /[A-Za-z_]/.test(n)) {
        // Lifetime identifier such as 'a, 'static, '_ — do not enter string state.
        i += 2;
        while (i < src.length && /[A-Za-z0-9_]/.test(src[i]!)) i++;
        continue;
      }
      stringDelim = "'";
      stringMultiline = false;
      i++;
      continue;
    }

    if ((c === '"' || c === "'") && supportsQuotes(lang)) {
      stringDelim = c;
      stringMultiline = false;
      i++;
      continue;
    }

    i++;
  }

  return {
    inComment: inLineComment || blockCommentEnd !== null,
    inString: stringDelim !== null,
  };
}

function sliceScanWindow(prefix: string): string {
  if (prefix.length <= MAX_SCAN_CHARS) return prefix;
  const start = prefix.length - MAX_SCAN_CHARS;
  const nl = prefix.indexOf("\n", start);
  return nl >= 0 ? prefix.slice(nl + 1) : prefix.slice(start);
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
    lang === "dart" ||
    lang === "jsonc"
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

function supportsDashComments(lang: string): boolean {
  return (
    lang === "sql" ||
    lang === "mysql" ||
    lang === "postgresql" ||
    lang === "lua" ||
    lang === "haskell"
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
    lang === "swift" ||
    lang === "dart" ||
    lang === "css" ||
    lang === "scss" ||
    lang === "less" ||
    lang === "sql" ||
    lang === "mysql" ||
    lang === "postgresql"
  );
}

function supportsHtmlComments(lang: string): boolean {
  return (
    lang === "html" ||
    lang === "xml" ||
    lang === "vue" ||
    lang === "svelte" ||
    lang === "markdown"
  );
}

function supportsTripleDoubleQuotes(lang: string): boolean {
  return (
    lang === "python" ||
    lang === "kotlin" ||
    lang === "java" ||
    lang === "scala" ||
    lang === "swift"
  );
}

function supportsBacktickStrings(lang: string): boolean {
  return (
    lang === "javascript" ||
    lang === "javascriptreact" ||
    lang === "typescript" ||
    lang === "typescriptreact" ||
    lang === "go" ||
    lang === "shellscript" ||
    lang === "bash" ||
    lang === "zsh" ||
    lang === "sh"
  );
}

function supportsQuotes(lang: string): boolean {
  return lang !== "markdown" && lang !== "text" && lang !== "plaintext";
}

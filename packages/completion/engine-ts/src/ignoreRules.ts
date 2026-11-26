export const DEFAULT_GLOBS = [
  "**/.git/**",
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/target/**",
  "**/.idea/**",
  "**/.gradle/**",
  "**/vendor/**",
];

interface CompiledRule {
  negated: boolean;
  rootAnchored: boolean;
  regex: RegExp;
}

export class IgnoreRules {
  private rules: CompiledRule[];

  constructor(
    globs: string[],
    private respectGitignore = true,
    gitignorePatterns: string[] = [],
  ) {
    const raw = [...globs, ...(this.respectGitignore ? gitignorePatterns : [])];
    this.rules = [];
    for (const entry of raw) {
      const compiled = compileRule(entry);
      if (compiled) this.rules.push(compiled);
    }
  }

  isIgnored(path: string, relativePath?: string | null): boolean {
    const rawPath = normalizePath(path);
    const rawRel = relativePath ? normalizePath(relativePath) : null;

    // Built-in hard protection for .git / node_modules segments unless explicitly negated
    const target = rawRel || rawPath;
    if (!target) return false;

    const rootTarget = stripLeadingSlash(rawRel ?? rawPath);
    const candidates = rawRel ? [rawRel] : [rawPath];

    let ignored = isHardIgnored(rawPath) || (rawRel ? isHardIgnored(rawRel) : false);

    for (const rule of this.rules) {
      let matched = false;
      if (rule.rootAnchored) {
        matched = rule.regex.test(rootTarget);
      } else {
        for (const candidate of candidates) {
          if (rule.regex.test(candidate) || rule.regex.test(stripLeadingSlash(candidate))) {
            matched = true;
            break;
          }
        }
      }
      if (matched) {
        ignored = !rule.negated;
      }
    }
    return ignored;
  }

  static parseGitignore(text: string): string[] {
    return text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  }
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

function stripLeadingSlash(p: string): string {
  return p.replace(/^\/+/, "");
}

function isHardIgnored(p: string): boolean {
  const segs = p.split("/");
  return segs.includes("node_modules") || segs.includes(".git");
}

function compileRule(raw: string): CompiledRule | null {
  let pattern = raw.trim();
  if (!pattern || pattern.startsWith("#")) return null;

  let negated = false;
  if (pattern.startsWith("!")) {
    negated = true;
    pattern = pattern.slice(1).trim();
    if (!pattern) return null;
  }

  if (pattern.startsWith("glob:")) {
    pattern = pattern.slice(5).trim();
    if (!pattern) return null;
  }

  let rootAnchored = false;
  if (pattern.startsWith("/")) {
    rootAnchored = true;
    pattern = pattern.replace(/^\/+/, "");
    if (!pattern) return null;
  }

  const trailingSlash = pattern.endsWith("/");
  if (trailingSlash) {
    pattern = pattern.replace(/\/+$/, "");
    if (!pattern) return null;
  }

  let regexSource: string;
  if (rootAnchored) {
    const body = globToRegex(pattern);
    regexSource = trailingSlash ? `^${body}(?:/.*)?$` : `^${body}(?:/.*)?$`;
  } else if (trailingSlash) {
    // Trailing-slash directory rule: normalize `dir/` to `**/dir/**`
    const normalized = pattern.startsWith("**/") ? `${pattern}/**` : `**/${pattern}/**`;
    regexSource = `^${globToRegex(normalized)}$`;
  } else if (!pattern.includes("/")) {
    // Basename / directory rule without slashes (e.g. `*.log`, `build`, `.env`)
    const body = globToRegex(pattern);
    regexSource = `^(?:^|.*/)${body}(?:/.*)?$`;
  } else {
    // Contains slash (e.g. `**/build/**`, `src/*.ts`, `a/b`)
    const body = globToRegex(pattern);
    if (pattern.endsWith("/**") || pattern.endsWith("/*") || pattern.endsWith("*")) {
      regexSource = `^${body}$`;
    } else {
      regexSource = `^${body}(?:/.*)?$`;
    }
  }

  try {
    return {
      negated,
      rootAnchored,
      regex: new RegExp(regexSource),
    };
  } catch {
    return null;
  }
}

/**
 * Compile a glob string into an unanchored regex fragment.
 * `**\/` compiles to `(?:^|.*\/)` (or `(?:.*\/)?`) so directory boundaries are strictly respected.
 */
function globToRegex(pattern: string): string {
  let re = "";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i]!;
    // Handle `/**` at end of pattern
    if (c === "/" && pattern[i + 1] === "*" && pattern[i + 2] === "*" && i + 3 === pattern.length) {
      re += "(?:/.*)?";
      i += 3;
      continue;
    }
    // Handle `**/`
    if (c === "*" && pattern[i + 1] === "*" && pattern[i + 2] === "/") {
      re += i === 0 ? "(?:^|.*/)" : "(?:.*/)?";
      i += 3;
      continue;
    }
    // Handle `**`
    if (c === "*" && pattern[i + 1] === "*") {
      re += ".*";
      i += 2;
      continue;
    }
    if (c === "*") {
      re += "[^/]*";
      i += 1;
      continue;
    }
    if (c === "?") {
      re += "[^/]";
      i += 1;
      continue;
    }
    if (/[.+^${}()|[\]\\]/.test(c)) {
      re += "\\" + c;
      i += 1;
      continue;
    }
    re += c;
    i += 1;
  }
  return re;
}

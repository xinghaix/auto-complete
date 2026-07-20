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

export class IgnoreRules {
  private patterns: string[];

  constructor(
    globs: string[],
    private respectGitignore = true,
    gitignorePatterns: string[] = [],
  ) {
    this.patterns = [...globs, ...(this.respectGitignore ? gitignorePatterns : [])]
      .map((g) => g.trim())
      .filter((g) => g && !g.startsWith("#"));
  }

  isIgnored(path: string, relativePath?: string | null): boolean {
    const candidates = [
      path,
      relativePath,
      path.replace(/\\/g, "/"),
      relativePath?.replace(/\\/g, "/"),
    ].filter(Boolean) as string[];

    for (const candidate of candidates) {
      const normalized = candidate.replace(/\\/g, "/");
      for (const pattern of this.patterns) {
        if (matchGlob(pattern, normalized)) return true;
      }
      const name = normalized.split("/").pop() ?? "";
      if (name === "node_modules" || name === ".git") return true;
    }
    const slash = path.replace(/\\/g, "/");
    if (slash.includes("/node_modules/") || slash.endsWith("/node_modules")) return true;
    if (slash.includes("/.git/") || slash.endsWith("/.git")) return true;
    return false;
  }

  static parseGitignore(text: string): string[] {
    return text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && !l.startsWith("!"))
      .map((line) => {
        if (line.startsWith("/")) return `**${line}`;
        if (line.includes("/")) return `**/${line}`;
        return `**/${line}`;
      });
  }
}

/** Minimal glob matcher for ** / * patterns used by ignore rules. */
function matchGlob(pattern: string, path: string): boolean {
  let p = pattern.startsWith("glob:") ? pattern.slice(5) : pattern;
  // Escape regex specials except * and ?
  let re = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i]!;
    if (c === "*" && p[i + 1] === "*") {
      re += ".*";
      i++;
      if (p[i + 1] === "/") i++; // ** /
    } else if (c === "*") {
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else if (/[.+^${}()|[\]\\]/.test(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  try {
    return new RegExp(`^${re}$`).test(path) || new RegExp(re).test(path);
  } catch {
    return false;
  }
}

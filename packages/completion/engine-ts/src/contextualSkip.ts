const languageTerminators: Record<string, string[]> = {
  javascript: [";", "}", ")"],
  javascriptreact: [";", "}", ")"],
  typescript: [";", "}", ")"],
  typescriptreact: [";", "}", ")"],
  java: [";", "}", ")"],
  kotlin: [";", "}", ")"],
  scala: [";", "}", ")"],
  c: [";", "}", ")"],
  cpp: [";", "}", ")"],
  csharp: [";", "}", ")"],
  go: [";", "}", ")"],
  rust: [";", "}", ")"],
  php: [";", "}", ")"],
  dart: [";", "}", ")"],
  css: [";", "}", ")"],
  scss: [";", "}", ")"],
  less: [";", "}", ")"],
  json: [";", "}", ")"],
  jsonc: [";", "}", ")"],
  python: [")", "]", "}"],
  ruby: [")", "]", "}", "end"],
  shellscript: [";", "fi", "done", "esac"],
  bash: [";", "fi", "done", "esac"],
  zsh: [";", "fi", "done", "esac"],
  sh: [";", "fi", "done", "esac"],
  sql: [";"],
  mysql: [";"],
  postgresql: [";"],
};

const defaultTerminators = [";", "}", ")"];

function isWordChar(c: string): boolean {
  return /[A-Za-z0-9_]/.test(c);
}

export function shouldSkip(prefix: string, suffix: string, languageId: string): boolean {
  if (isMidWord(prefix, suffix)) return true;
  if (endsWithTerminator(prefix, languageId)) return true;
  return false;
}

export function isMidWord(prefix: string, suffix: string): boolean {
  if (!prefix) return false;
  const before = prefix[prefix.length - 1]!;
  const after = suffix[0];
  if (!isWordChar(before)) return false;
  if (after && isWordChar(after)) return true;
  const line = prefix.slice(prefix.lastIndexOf("\n") + 1);
  if (!line) return false;
  let trailing = "";
  for (let i = line.length - 1; i >= 0; i--) {
    if (!isWordChar(line[i]!)) break;
    trailing = line[i]! + trailing;
  }
  return trailing.length >= 24;
}

export function endsWithTerminator(prefix: string, languageId: string): boolean {
  const trimmed = prefix.replace(/\s+$/, "");
  if (!trimmed) return false;
  const terms = languageTerminators[languageId.toLowerCase()] ?? defaultTerminators;
  return terms.some((term) => {
    if (term.length === 1) return trimmed.endsWith(term);
    const re = new RegExp(`(?:^|[\\s;{}()])${escapeRegExp(term)}\\s*$`);
    return re.test(trimmed);
  });
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

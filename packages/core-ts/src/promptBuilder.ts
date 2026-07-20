export interface BuiltPrompt {
  prefix: string;
  suffix: string;
  styleHint?: string;
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
  const prunedPrefix = takeEnd(opts.prefix, Math.max(0, opts.maxPrefixChars));
  const prunedSuffix = takeStart(opts.suffix, Math.max(0, opts.maxSuffixChars));
  const parts: string[] = [];
  if (opts.sendFilePath && opts.path?.trim()) {
    parts.push(`File: ${opts.path}`);
  }
  if (opts.language?.trim()) {
    parts.push(`Language: ${opts.language}`);
  }
  if (opts.recentSnippets && opts.recentSnippets.length > 0) {
    parts.push("Related snippets:");
    opts.recentSnippets.forEach((snippet, index) => {
      parts.push(`--- snippet ${index + 1} ---`);
      parts.push(snippet.replace(/\s+$/, ""));
    });
  }
  const header = parts.length ? parts.join("\n") + "\n" : "";
  const finalPrefix = header ? header + "\n" + prunedPrefix : prunedPrefix;
  return { prefix: finalPrefix, suffix: prunedSuffix, styleHint: "fim" };
}

export function chatUserContent(prefix: string, suffix: string): string {
  return (
    "Complete the code at the cursor. Output only the completion text.\n" +
    "<prefix>\n" +
    prefix +
    "\n</prefix>\n" +
    "<suffix>\n" +
    suffix +
    "\n</suffix>\n"
  );
}

export function lruKey(language: string, model: string, prefix: string, suffix: string): string {
  return `${language}|${model}|${hashCode(prefix)}|${hashCode(suffix)}|${prefix.length}|${suffix.length}`;
}

function takeEnd(text: string, max: number): string {
  if (max <= 0 || text.length <= max) return text;
  return text.slice(text.length - max);
}

function takeStart(text: string, max: number): string {
  if (max <= 0 || text.length <= max) return text;
  return text.slice(0, max);
}

/** Java-compatible String.hashCode for dual-engine LRU key parity. */
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

export function postprocess(
  raw: string,
  prefix: string,
  suffix: string,
  firstLineOnly: boolean,
): string | null {
  let text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = stripCodeFences(text);
  text = text.replace(/\s+$/, "");
  if (!text) return null;
  if (firstLineOnly) {
    text = text.split("\n")[0] ?? "";
  }
  text = removePrefixOverlap(text, prefix);
  if (!text) return null;
  if (isUseless({ suggestion: text, prefix, suffix })) return null;
  return text;
}

export function isUseless(params: {
  suggestion: string;
  prefix: string;
  suffix: string;
}): boolean {
  const trimmed = params.suggestion.trim();
  if (!trimmed) return true;
  if (params.prefix.replace(/\s+$/, "").endsWith(trimmed)) return true;
  if (params.suffix.replace(/^\s+/, "").startsWith(trimmed)) return true;
  if (duplicatesEdgeLines(params)) return true;
  if (containsRepetitivePhrase(params.suggestion)) return true;
  return false;
}

export function removePrefixOverlap(suggestion: string, prefix: string): string {
  if (!suggestion || !prefix) return suggestion;
  const max = Math.min(suggestion.length, prefix.length, 200);
  for (let n = max; n > 0; n--) {
    if (prefix.endsWith(suggestion.slice(0, n))) {
      return suggestion.slice(n);
    }
  }
  return suggestion;
}

export function shouldShowOnlyFirstLine(prefix: string, suggestion: string): boolean {
  if (!suggestion.includes("\n")) return false;
  const line = prefix.slice(prefix.lastIndexOf("\n") + 1);
  return line.length > 0 && /\S/.test(line);
}

function duplicatesEdgeLines(params: {
  suggestion: string;
  prefix: string;
  suffix: string;
}): boolean {
  const trimmed = params.suggestion.trim();
  if (!trimmed.includes("\n")) return false;
  const lines = trimmed.split("\n");
  const first = lines[0]!.trim();
  const last = lines[lines.length - 1]!.trim();
  const prefixLast = params.prefix
    .replace(/\s+$/, "")
    .slice(params.prefix.replace(/\s+$/, "").lastIndexOf("\n") + 1)
    .trim();
  const suffixFirst = params.suffix
    .replace(/^\s+/, "")
    .split("\n")[0]!
    .trim();
  if (first && prefixLast && first === prefixLast) return true;
  if (last && suffixFirst && last === suffixFirst) return true;
  return false;
}

function containsRepetitivePhrase(suggestion: string): boolean {
  const phraseLength = 20;
  const minRep = 3;
  if (suggestion.length < phraseLength * minRep) return false;
  const candidates = [suggestion, suggestion.slice(-phraseLength * minRep)];
  for (const region of candidates) {
    const phrase = region.slice(-phraseLength);
    if (!phrase.trim()) continue;
    let count = 0;
    let idx = 0;
    while (true) {
      const found = region.indexOf(phrase, idx);
      if (found < 0) break;
      count++;
      idx = found + Math.max(1, Math.floor(phrase.length / 2));
      if (count >= minRep) return true;
    }
  }
  return false;
}

function stripCodeFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.slice(3);
    const nl = t.indexOf("\n");
    if (nl >= 0) t = t.slice(nl + 1);
    if (t.endsWith("```")) t = t.slice(0, -3);
  }
  return t;
}

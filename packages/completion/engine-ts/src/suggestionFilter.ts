export function postprocess(
  raw: string,
  prefix: string,
  suffix: string,
  firstLineOnly: boolean,
): string | null {
  let text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = stripPromptArtifacts(text);
  text = stripCodeFences(text);
  text = text.replace(/\s+$/, "");
  if (!text) return null;
  if (firstLineOnly) {
    const firstNonWs = text.search(/\S/);
    if (firstNonWs < 0) return null;
    const nlAfter = text.indexOf("\n", firstNonWs);
    if (nlAfter >= 0) {
      text = text.slice(0, nlAfter);
    }
  }
  text = removePrefixOverlap(text, prefix);
  text = removeSuffixOverlap(text, suffix);
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
  if (isSubstantiveDuplicate(trimmed)) {
    if (params.prefix.replace(/\s+$/, "").endsWith(trimmed)) return true;
    if (params.suffix.replace(/^\s+/, "").startsWith(trimmed)) return true;
  }
  if (duplicatesEdgeLines(params)) return true;
  if (containsRepetitivePhrase(params.suggestion)) return true;
  return false;
}

function isSubstantiveDuplicate(trimmed: string): boolean {
  return trimmed.length >= 3;
}

export function removePrefixOverlap(suggestion: string, prefix: string): string {
  if (!suggestion || !prefix) return suggestion;
  const max = Math.min(suggestion.length, prefix.length, 200);
  for (let n = max; n > 0; n--) {
    const overlap = suggestion.slice(0, n);
    if (!prefix.endsWith(overlap)) continue;
    if (n < 3 && !isSafeShortPrefixOverlap(overlap, prefix, n)) continue;
    return suggestion.slice(n);
  }
  return suggestion;
}

export function removeSuffixOverlap(suggestion: string, suffix: string): string {
  if (!suggestion || !suffix) return suggestion;
  const nlIdx = suffix.indexOf("\n");
  const suffixFirstLine = nlIdx >= 0 ? suffix.slice(0, nlIdx) : suffix;
  if (!suffixFirstLine) return suggestion;
  const max = Math.min(suggestion.length, suffixFirstLine.length, 200);
  for (let n = max; n > 0; n--) {
    const candidate = suffixFirstLine.slice(0, n);
    if (!suggestion.endsWith(candidate)) continue;
    if (!candidate.trim()) continue;
    if (n === 1) {
      if (/[A-Za-z0-9_]/.test(candidate)) continue;
      if (isBalancedClosingDelimiter(suggestion, candidate)) continue;
    }
    return suggestion.slice(0, suggestion.length - n);
  }
  return suggestion;
}

export function isMidLine(prefix: string): boolean {
  const line = prefix.slice(prefix.lastIndexOf("\n") + 1);
  return line.length > 0 && /\S/.test(line);
}

export function shouldShowOnlyFirstLine(prefix: string, suggestion: string): boolean {
  if (!suggestion.includes("\n")) return false;
  return isMidLine(prefix);
}

export function stripPromptArtifacts(text: string): string {
  let t = text.replace(/<\|cursor\|>/g, "");
  const trimmedStart = t.trimStart();
  if (trimmedStart.startsWith("Completion:\n")) {
    t = trimmedStart.slice("Completion:\n".length);
  } else if (trimmedStart.startsWith("Completion: ")) {
    t = trimmedStart.slice("Completion: ".length);
  }
  return t;
}

export function stripCodeFences(text: string): string {
  if (!text.trimStart().startsWith("```")) {
    return text;
  }
  let t = text.trimStart().slice(3);
  const nl = t.indexOf("\n");
  if (nl >= 0) t = t.slice(nl + 1);
  const trimmedEnd = t.trimEnd();
  if (trimmedEnd.endsWith("```")) {
    t = trimmedEnd.slice(0, -3);
    if (t.endsWith("\n")) t = t.slice(0, -1);
  }
  return t;
}

function isSafeShortPrefixOverlap(overlap: string, prefix: string, n: number): boolean {
  // Never strip < 3 char operators, punctuation, digits, or whitespace (e.g. ==, &&, ||, ++, ::, 100, (()).
  if (!/^[A-Za-z_]+$/.test(overlap)) return false;
  // Require word boundary immediately before the overlap in prefix.
  const prevIdx = prefix.length - n - 1;
  if (prevIdx >= 0 && /[A-Za-z0-9_]/.test(prefix[prevIdx]!)) return false;
  return true;
}

function isBalancedClosingDelimiter(suggestion: string, delim: string): boolean {
  const pairs: Record<string, string> = {
    ")": "(",
    "]": "[",
    "}": "{",
  };
  const open = pairs[delim];
  if (!open) return false;
  let opens = 0;
  let closes = 0;
  for (let i = 0; i < suggestion.length; i++) {
    const ch = suggestion[i];
    if (ch === open) opens++;
    else if (ch === delim) closes++;
  }
  return closes <= opens;
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
  const prefixNoTrail = params.prefix.replace(/\s+$/, "");
  const prefixLast = prefixNoTrail.slice(prefixNoTrail.lastIndexOf("\n") + 1).trim();
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

import { OPENAI_O_SERIES_RE } from "./promptTemplate.js";

/**
 * Heuristic context / prompt budgets derived from model ids (TypeScript dual of ModelLimits.kt).
 *
 * OpenAI-compatible `/models` often omits context length; when it is present
 * we prefer that value. Otherwise fall back to name-based estimates.
 */
export interface ModelBudget {
  /** Approx model context window in tokens (estimate or reported). */
  contextTokens: number;
  maxPrefixChars: number;
  maxSuffixChars: number;
  /** `reported` from API metadata, or `heuristic` from model name. */
  source: "reported" | "heuristic";
}

const SIZE_TAG_PATTERNS: Array<{ re: RegExp; map?: Record<string, number> }> = [
  { re: /(?:^|[^0-9])(128)\s*k/, map: { "128": 128_000 } },
  { re: /(?:^|[^0-9])(64)\s*k/, map: { "64": 65_536 } },
  { re: /(?:^|[^0-9])(32)\s*k/, map: { "32": 32_768 } },
  { re: /(?:^|[^0-9])(16)\s*k/, map: { "16": 16_384 } },
  { re: /(?:^|[^0-9])(8)\s*k/, map: { "8": 8_192 } },
  { re: /(?:^|[^0-9])(4)\s*k/, map: { "4": 4_096 } },
  { re: /\b(128000|131072)\b/ },
  { re: /\b(65536|64000)\b/ },
  { re: /\b(32768|32000)\b/ },
  { re: /\b(16384|16000)\b/ },
  { re: /\b(8192|8000)\b/ },
  { re: /\b(4096|4000)\b/ },
];

export function forModel(
  model: string,
  reportedContextTokens?: number | null,
): ModelBudget {
  const hasReported =
    reportedContextTokens != null &&
    Number.isFinite(reportedContextTokens) &&
    reportedContextTokens > 0;
  const tokens = hasReported
    ? Math.trunc(reportedContextTokens!)
    : estimateContextTokens(model);
  const source: "reported" | "heuristic" = hasReported ? "reported" : "heuristic";
  // Inline completion only needs a slice of the window; leave headroom for
  // response + special tokens. ~3 chars/token is a rough code average.
  const usableChars = clamp(Math.trunc(tokens * 3 * 0.4), 2_000, 48_000);
  const maxPrefixChars = clamp(usableChars, 2_000, 32_000);
  const maxSuffixChars = clamp(Math.trunc(maxPrefixChars / 4), 500, 8_000);
  return {
    contextTokens: tokens,
    maxPrefixChars,
    maxSuffixChars,
    source,
  };
}

export function estimateContextTokens(model: string): number {
  const m = model.trim().toLowerCase();
  if (!m) return 8_192;
  const tag = extractSizeTag(m);
  if (tag != null) return tag;
  if (m.includes("codestral") || m.includes("devstral")) return 32_768;
  if (m.includes("qwen2.5") || m.includes("qwen3") || m.includes("qwen2")) return 32_768;
  if (m.includes("qwen")) return 16_384;
  if (m.includes("deepseek-coder") || m.includes("deepseek-r1")) return 16_384;
  if (m.includes("deepseek")) return 16_384;
  if (m.includes("starcoder2")) return 16_384;
  if (m.includes("starcoder") || m.includes("santacoder")) return 8_192;
  if (m.includes("codellama") || m.includes("code-llama")) return 16_384;
  if (m.includes("codegemma")) return 8_192;
  if (m.includes("codegeex")) return 32_768;
  if (m.includes("gpt-4o") || m.includes("gpt-4.1") || OPENAI_O_SERIES_RE.test(m)) {
    return 128_000;
  }
  if (m.includes("gpt-4-turbo") || m.includes("gpt-4-1106") || m.includes("gpt-4-0125")) {
    return 128_000;
  }
  if (m.includes("gpt-4")) return 8_192;
  if (m.includes("gpt-3.5")) return 16_384;
  if (m.includes("claude")) return 200_000;
  if (
    m.includes("mistral-small") ||
    m.includes("mistral-medium") ||
    m.includes("mistral-large")
  ) {
    return 32_768;
  }
  if (m.includes("7b") || m.includes("8b") || m.includes("9b")) return 8_192;
  if (m.includes("13b") || m.includes("14b") || m.includes("15b")) return 16_384;
  if (m.includes("32b") || m.includes("34b") || m.includes("70b") || m.includes("72b")) {
    return 32_768;
  }
  return 8_192;
}

/**
 * Pull optional context length fields from a `/models` JSON object item.
 * Requires value >= 512 to avoid mistaking small output-token limits for context windows.
 */
export function contextTokensFromModelObject(item: Record<string, unknown>): number | null {
  const directKeys = [
    "context_length",
    "contextLength",
    "context_window",
    "max_model_len",
    "max_tokens",
    "max_seq_len",
    "n_ctx",
  ];
  for (const key of directKeys) {
    const n = intFrom(item[key]);
    if (n != null && n >= 512) return n;
  }
  const meta = item.meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const m = meta as Record<string, unknown>;
    for (const key of ["n_ctx_train", "context_length", "contextLength", "max_position_embeddings"]) {
      const n = intFrom(m[key]);
      if (n != null && n >= 512) return n;
    }
  }
  const data = item.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    for (const key of ["context_length", "contextLength"]) {
      const n = intFrom(d[key]);
      if (n != null && n >= 512) return n;
    }
  }
  return null;
}

export const ModelLimits = {
  forModel,
  estimateContextTokens,
  contextTokensFromModelObject,
} as const;

function extractSizeTag(m: string): number | null {
  for (const { re, map } of SIZE_TAG_PATTERNS) {
    const match = re.exec(m);
    if (!match) continue;
    const raw = match[1];
    if (!raw) continue;
    if (map && raw in map) return map[raw]!;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function intFrom(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

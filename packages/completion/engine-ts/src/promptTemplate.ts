import type { PromptTemplateId, ProviderKind, WireFormat } from "./types.js";

export interface TemplateMeta {
  id: PromptTemplateId;
  shortLabel: string;
  wireFormat: WireFormat;
  stopTokens: string[];
}

/** Word-boundary matcher for OpenAI o1/o3/o4 models so `demo1-coder`/`proto3-coder` are not misclassified. */
export const OPENAI_O_SERIES_RE = /(?:^|[-_/:])o[134](?:$|[-_.:])/;

const META: Record<Exclude<PromptTemplateId, "AUTO">, TemplateMeta> = {
  CODESTRAL_API: {
    id: "CODESTRAL_API",
    shortLabel: "(fim) OpenAI FIM",
    wireFormat: "FIM_FIELDS",
    stopTokens: [],
  },
  QWEN: {
    id: "QWEN",
    shortLabel: "(fim) Qwen",
    wireFormat: "COMPLETION_PROMPT",
    stopTokens: [
      "<|endoftext|>",
      "<|fim_prefix|>",
      "<|fim_middle|>",
      "<|fim_suffix|>",
      "<|fim_pad|>",
      "<|repo_name|>",
      "<|file_sep|>",
      "<|im_end|>",
    ],
  },
  DEEPSEEK: {
    id: "DEEPSEEK",
    shortLabel: "(fim) DeepSeek",
    wireFormat: "COMPLETION_PROMPT",
    stopTokens: [
      "<｜fim▁begin｜>",
      "<｜fim▁hole｜>",
      "<｜fim▁end｜>",
      "<|EOT|>",
      "<｜end▁of▁sentence｜>",
    ],
  },
  STARCODER: {
    id: "STARCODER",
    shortLabel: "(fim) StarCoder",
    wireFormat: "COMPLETION_PROMPT",
    stopTokens: [
      "<|endoftext|>",
      "<fim_prefix>",
      "<fim_middle>",
      "<fim_suffix>",
      "<fim_pad>",
      "<file_sep>",
      "<|eos|>",
    ],
  },
  CODELLAMA: {
    id: "CODELLAMA",
    shortLabel: "(fim) CodeLlama",
    wireFormat: "COMPLETION_PROMPT",
    stopTokens: ["<EOT>", "<PRE>", "<SUF>", "<MID>", "</s>", "<|endoftext|>"],
  },
  CHAT: {
    id: "CHAT",
    shortLabel: "(chat) Pseudo-FIM",
    wireFormat: "CHAT_MESSAGES",
    stopTokens: [],
  },
  RESPONSES: {
    id: "RESPONSES",
    shortLabel: "(responses) OpenAI Responses",
    wireFormat: "RESPONSES_API",
    stopTokens: [],
  },
};

export function fromStored(value: string | null | undefined): PromptTemplateId {
  if (!value?.trim()) return "AUTO";
  const u = value.trim().toUpperCase();
  if (u === "AUTO" || u in META) return u as PromptTemplateId;
  return "AUTO";
}

export function isAuto(t: PromptTemplateId): boolean {
  return t === "AUTO";
}

export function wireFormat(t: PromptTemplateId): WireFormat {
  if (t === "AUTO") return "CHAT_MESSAGES";
  return META[t].wireFormat;
}

export function shortLabel(t: PromptTemplateId): string {
  if (t === "AUTO") return "Auto";
  return META[t].shortLabel;
}

export function stopTokens(t: PromptTemplateId): string[] {
  if (t === "AUTO") return [];
  return [...META[t].stopTokens];
}

export function formatTokenPrompt(t: PromptTemplateId, prefix: string, suffix: string): string {
  switch (t) {
    case "QWEN":
      return `<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`;
    case "DEEPSEEK":
      return `<｜fim▁begin｜>${prefix}<｜fim▁hole｜>${suffix}<｜fim▁end｜>`;
    case "STARCODER":
      return `<fim_prefix>${prefix}<fim_suffix>${suffix}<fim_middle>`;
    case "CODELLAMA":
      return `<PRE>${prefix}<SUF>${suffix}<MID>`;
    default:
      return prefix;
  }
}

export function probeCandidates(): PromptTemplateId[] {
  return ["CODESTRAL_API", "QWEN", "DEEPSEEK", "STARCODER", "CODELLAMA", "CHAT", "RESPONSES"];
}

export function fromLegacyRequestStyle(requestStyle: string | null | undefined): PromptTemplateId {
  switch (requestStyle?.toUpperCase()) {
    case "FIM":
      return "CODESTRAL_API";
    case "CHAT":
      return "CHAT";
    default:
      return "AUTO";
  }
}

export function isDeepSeekBetaUrl(baseUrl: string): boolean {
  const raw = baseUrl.trim();
  if (!raw) return false;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase().replace(/\/+$/, "");
    return (
      (host === "deepseek.com" || host.endsWith(".deepseek.com")) &&
      (path === "/beta" || path.startsWith("/beta/"))
    );
  } catch {
    return /deepseek\.com\/beta(?:\/|$|\?)/i.test(raw);
  }
}

export function isMistralUrl(baseUrl: string): boolean {
  const raw = baseUrl.trim();
  if (!raw) return false;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    return host === "mistral.ai" || host.endsWith(".mistral.ai");
  } catch {
    return /mistral\.ai(?:\/|$|\?)/i.test(raw);
  }
}

export function detectTemplate(
  model: string,
  providerKind: ProviderKind = "OPENAI_COMPATIBLE",
  baseUrl = "",
): PromptTemplateId {
  if (providerKind === "MISTRAL_FIM") return "CODESTRAL_API";
  const m = model.trim().toLowerCase();
  if (!m) return "CHAT";
  if (baseUrl && (isDeepSeekBetaUrl(baseUrl) || isMistralUrl(baseUrl))) {
    return "CODESTRAL_API";
  }
  if (m.includes("codestral") || m.includes("mistral-code") || m.includes("devstral")) {
    return "CODESTRAL_API";
  }
  if (m.includes("deepseek") && (m.includes("coder") || m.includes("code"))) return "DEEPSEEK";
  if (m.includes("qwen") || m.includes("codegemma") || m.includes("codegeex")) return "QWEN";
  if (m.includes("codellama") || m.includes("code-llama")) return "CODELLAMA";
  if (m.includes("starcoder") || m.includes("santacoder") || m.includes("crystalcoder")) {
    return "STARCODER";
  }
  if (
    m.includes("gpt-") ||
    m.includes("claude") ||
    m.includes("chatgpt") ||
    OPENAI_O_SERIES_RE.test(m)
  ) {
    return "CHAT";
  }
  if (m.includes("coder") || m.includes("code-") || m.endsWith("-code")) return "QWEN";
  return "CHAT";
}

export const detectPromptTemplate = detectTemplate;

export function resolveTemplate(
  stored: PromptTemplateId,
  model: string,
  providerKind: ProviderKind = "OPENAI_COMPATIBLE",
  baseUrl = "",
): PromptTemplateId {
  return isAuto(stored) ? detectTemplate(model, providerKind, baseUrl) : stored;
}

export function isRecognized(
  model: string,
  providerKind: ProviderKind = "OPENAI_COMPATIBLE",
  baseUrl = "",
): boolean {
  if (!model.trim()) return false;
  const detected = detectTemplate(model, providerKind, baseUrl);
  if (detected !== "CHAT") return true;
  const m = model.toLowerCase();
  return (
    ["gpt-", "claude", "chatgpt", "instruct", "chat"].some((k) => m.includes(k)) ||
    OPENAI_O_SERIES_RE.test(m)
  );
}

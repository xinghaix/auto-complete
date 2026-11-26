import { t, type Locale, type MessageKey } from "../i18n";
import type {
  HostTheme,
  LogEntry,
  ProbeResult,
  Profile,
  ServicePreset,
  ServicePresetId,
  UiTheme,
} from "../types";

export const LEVEL_ORDER = ["debug", "info", "warn", "error"] as const;
export const AUTOSAVE_DELAY = 800;
export const DEFAULT_AUTH_HEADER = "Authorization: Bearer ${apiKey}";

export type MainTab = "general" | "config" | "behavior" | "performance" | "logs";
export type SaveState = "idle" | "saving" | "saved" | "error";

export type ValidationIssue = {
  field: string;
  key: MessageKey;
};

export type GlobalValidationInput = {
  debounceMinMs: number;
  debounceInitialMs: number;
  debounceMaxMs: number;
  maxPrefixChars: number;
  maxSuffixChars: number;
  maxInFlight: number;
  cacheSize: number;
  lruSize: number;
  maxFileSizeKb: number;
  recentFileLimit: number;
  recentFileMaxChars: number;
  logRetention: number;
};

export const DEFAULT_IGNORE_GLOBS = [
  "**/.git/**",
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/target/**",
  "**/.idea/**",
  "**/.gradle/**",
  "**/vendor/**",
].join("\n");

export const SERVICE_PRESETS: readonly ServicePreset[] = [
  {
    id: "ollama",
    baseUrl: "http://127.0.0.1:11434/v1",
    promptTemplate: "AUTO",
    fimPath: "",
    chatPath: "/chat/completions",
    completionsPath: "",
  },
  {
    id: "deepseek",
    baseUrl: "https://api.deepseek.com/beta",
    promptTemplate: "CODESTRAL_API",
    fimPath: "/completions",
    chatPath: "/chat/completions",
    completionsPath: "",
  },
  {
    id: "mistral",
    baseUrl: "https://codestral.mistral.ai/v1",
    promptTemplate: "CODESTRAL_API",
    fimPath: "/fim/completions",
    chatPath: "/chat/completions",
    completionsPath: "",
  },
  {
    id: "vllm",
    baseUrl: "http://127.0.0.1:8000/v1",
    promptTemplate: "AUTO",
    fimPath: "",
    chatPath: "/chat/completions",
    completionsPath: "",
  },
] as const;

export function getServicePreset(id: ServicePresetId): ServicePreset | undefined {
  return SERVICE_PRESETS.find((p) => p.id === id);
}

export function normalizeUiTheme(raw: unknown): UiTheme {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "light" || v === "dark") return v;
  return "auto";
}

/** Settings panel locale preference: auto | en | zh | ja | ko. */
export function normalizeUiLocale(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "en" || v === "zh" || v === "ja" || v === "ko") return v;
  return "auto";
}

/**
 * Map host theme push / getPlatform theme to a concrete CSS data-theme value.
 * Supports light, dark, high-contrast-light, high-contrast-dark, and legacy high-contrast.
 */
export function normalizeHostTheme(raw?: string | null): HostTheme {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "light") return "light";
  if (v === "high-contrast-light" || v === "highcontrastlight" || v === "hc-light") {
    return "high-contrast-light";
  }
  if (v === "high-contrast-dark" || v === "highcontrastdark" || v === "hc-dark") {
    return "high-contrast-dark";
  }
  if (v === "high-contrast" || v === "highcontrast") return "high-contrast";
  return "dark";
}

export function applyResolvedTheme(preference: UiTheme, hostTheme: string): void {
  const root = document.documentElement;
  const resolved = preference === "auto" ? normalizeHostTheme(hostTheme) : preference;
  root.dataset.themePref = preference;
  root.dataset.theme = resolved;
}

export function normalizeTab(raw: string | undefined | null): MainTab {
  const v = (raw ?? "").toLowerCase();
  if (v === "logs" || v === "log") return "logs";
  if (v === "behavior" || v === "behaviour") return "behavior";
  if (v === "performance" || v === "perf") return "performance";
  if (v === "general") return "general";
  return "config";
}

export function numOr(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/**
 * Parse a numeric text input without coercing empty or intermediate strings
 * (like "" or "-" or "0.") to 0.
 */
export function parseOptionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "-" || trimmed === "+" || trimmed === "." || trimmed === "-.") {
    return undefined;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

export function ignoreGlobsFromSnapshot(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw.map((x) => String(x)).join("\n");
  return DEFAULT_IGNORE_GLOBS;
}

export function disabledLanguagesFromSnapshot(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw.map((x) => String(x)).join(", ");
  return "";
}

const RESERVED_OR_SENSITIVE_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
  "api_key",
  "x-auth-token",
  "x-access-token",
  "x-goog-api-key",
  "anthropic-api-key",
  "openai-api-key",
  "ocp-apim-subscription-key",
  "private-token",
  "content-type",
  "accept",
  "host",
]);

const SENSITIVE_HEADER_PATTERN = /(auth|token|secret|key|cookie|credential|session|signature)/i;

export function isSensitiveHeaderName(name: string): boolean {
  const clean = name.trim().toLowerCase();
  if (!clean) return false;
  return RESERVED_OR_SENSITIVE_HEADERS.has(clean) || SENSITIVE_HEADER_PATTERN.test(clean);
}

export function isBlankProfileDraft(profile: Profile): boolean {
  return !(profile.baseUrl ?? "").trim() && !(profile.model ?? "").trim();
}

/**
 * Client-side profile validation aligned with engine-jvm & engine-ts.
 * Returns structured i18n keys so callers can render localized field/banner messages.
 */
export function validateProfile(form: Profile, hasProfiles: boolean): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const base = (form.baseUrl ?? "").trim();
  if (hasProfiles && !base) {
    issues.push({ field: "baseUrl", key: "valBaseUrlRequired" });
  } else if (base) {
    try {
      const u = new URL(base);
      const proto = u.protocol.toLowerCase();
      if (proto !== "http:" && proto !== "https:") {
        issues.push({ field: "baseUrl", key: "valBaseUrlScheme" });
      } else if (!u.hostname) {
        issues.push({ field: "baseUrl", key: "valBaseUrlInvalid" });
      } else if (u.username || u.password) {
        issues.push({ field: "baseUrl", key: "valBaseUrlUserInfo" });
      }
    } catch {
      issues.push({ field: "baseUrl", key: "valBaseUrlInvalid" });
    }
  }

  if (hasProfiles && !(form.model ?? "").trim()) {
    issues.push({ field: "model", key: "valModelRequired" });
  }

  const timeout = form.timeoutMs ?? 3000;
  if (!Number.isFinite(timeout) || timeout < 500 || timeout > 30000) {
    issues.push({ field: "timeoutMs", key: "valTimeoutRange" });
  }

  const st = form.settingsTimeoutMs ?? 15000;
  if (!Number.isFinite(st) || st < 1000 || st > 120000) {
    issues.push({ field: "settingsTimeoutMs", key: "valSettingsTimeoutRange" });
  }

  const mt = form.maxTokens ?? 128;
  if (!Number.isFinite(mt) || mt < 16 || mt > 1024) {
    issues.push({ field: "maxTokens", key: "valMaxTokensRange" });
  }

  const temp = form.temperature ?? 0;
  if (!Number.isFinite(temp) || temp < 0 || temp > 2) {
    issues.push({ field: "temperature", key: "valTemperatureRange" });
  }

  const authHeader = (form.authHeaderTemplate ?? "").trim();
  if (authHeader && !authHeader.includes("${apiKey}")) {
    issues.push({ field: "authHeaderTemplate", key: "valAuthHeaderPlaceholder" });
  }

  const maxPre = form.maxPrefixChars ?? 8000;
  if (!Number.isFinite(maxPre) || maxPre <= 0) {
    issues.push({ field: "profileMaxPrefixChars", key: "valMaxPrefixPositive" });
  }

  const maxSuf = form.maxSuffixChars ?? 2000;
  if (!Number.isFinite(maxSuf) || maxSuf <= 0) {
    issues.push({ field: "profileMaxSuffixChars", key: "valMaxSuffixPositive" });
  }

  const eh = (form.extraHeadersJson ?? "").trim();
  if (eh) {
    try {
      const parsed: unknown = JSON.parse(eh);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        issues.push({ field: "extraHeadersJson", key: "valExtraHeadersJson" });
      } else {
        const entries = Object.entries(parsed as Record<string, unknown>);
        if (entries.some(([k, v]) => /[\r\n]/.test(k) || /[\r\n]/.test(String(v ?? "")))) {
          issues.push({ field: "extraHeadersJson", key: "valExtraHeadersJson" });
        } else if (entries.some(([k]) => isSensitiveHeaderName(k))) {
          issues.push({ field: "extraHeadersJson", key: "valExtraHeadersSensitive" });
        }
      }
    } catch {
      issues.push({ field: "extraHeadersJson", key: "valExtraHeadersJson" });
    }
  }

  const eb = (form.extraBodyJson ?? "").trim();
  if (eb) {
    try {
      const parsed: unknown = JSON.parse(eb);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        issues.push({ field: "extraBodyJson", key: "valExtraBodyJson" });
      }
    } catch {
      issues.push({ field: "extraBodyJson", key: "valExtraBodyJson" });
    }
  }

  return issues;
}

/** Client-side global settings validation (independent of incomplete profile drafts). */
export function validateGlobalSettings(g: GlobalValidationInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (
    !Number.isFinite(g.debounceMinMs) ||
    !Number.isFinite(g.debounceInitialMs) ||
    !Number.isFinite(g.debounceMaxMs) ||
    g.debounceMinMs < 0 ||
    g.debounceInitialMs < 0 ||
    g.debounceMaxMs < 0
  ) {
    issues.push({ field: "debounceInitialMs", key: "valDebounceNonNegative" });
  } else if (g.debounceMinMs > g.debounceInitialMs || g.debounceInitialMs > g.debounceMaxMs) {
    issues.push({ field: "debounceInitialMs", key: "valDebounceOrder" });
  }

  if (!Number.isFinite(g.maxPrefixChars) || g.maxPrefixChars <= 0) {
    issues.push({ field: "maxPrefixChars", key: "valMaxPrefixPositive" });
  }
  if (!Number.isFinite(g.maxSuffixChars) || g.maxSuffixChars <= 0) {
    issues.push({ field: "maxSuffixChars", key: "valMaxSuffixPositive" });
  }
  if (!Number.isFinite(g.maxInFlight) || g.maxInFlight < 1) {
    issues.push({ field: "maxInFlight", key: "valMaxInFlightPositive" });
  }
  if (!Number.isFinite(g.cacheSize) || g.cacheSize < 1) {
    issues.push({ field: "cacheSize", key: "valCacheSizePositive" });
  }
  if (!Number.isFinite(g.lruSize) || g.lruSize < 1) {
    issues.push({ field: "lruSize", key: "valLruSizePositive" });
  }
  if (!Number.isFinite(g.maxFileSizeKb) || g.maxFileSizeKb < 1) {
    issues.push({ field: "maxFileSizeKb", key: "valMaxFileSizePositive" });
  }
  if (!Number.isFinite(g.recentFileLimit) || g.recentFileLimit < 0) {
    issues.push({ field: "recentFileLimit", key: "valRecentLimitNonNegative" });
  }
  if (!Number.isFinite(g.recentFileMaxChars) || g.recentFileMaxChars < 1) {
    issues.push({ field: "recentFileMaxChars", key: "valRecentMaxCharsPositive" });
  }
  if (!Number.isFinite(g.logRetention) || g.logRetention < 50 || g.logRetention > 10000) {
    issues.push({ field: "logRetention", key: "valLogRetentionRange" });
  }

  return issues;
}

/** Localized profile validation messages (compatibility wrapper over validateProfile). */
export function validateForm(
  form: Profile,
  hasProfiles: boolean,
  locale: Locale = "en",
): string[] {
  return validateProfile(form, hasProfiles).map((issue) => t(locale, issue.key));
}

/** Format context token count compactly (e.g. 32768 -> "32k", 131072 -> "128k"). */
export function formatContextLength(tokens?: number | null): string {
  if (typeof tokens !== "number" || !Number.isFinite(tokens) || tokens <= 0) return "";
  if (tokens >= 1_000_000) {
    const m = tokens / 1_048_576;
    return `${Number.isInteger(m) ? m : Math.round(m * 10) / 10}M`;
  }
  if (tokens >= 1024) {
    const k = Math.round(tokens / 1024);
    return `${k}k`;
  }
  return String(Math.round(tokens));
}

/** Format a single probe result with status, HTTP status, latency, path/URL, and preview/error. */
export function formatProbeLine(p: ProbeResult, fallbackTemplate?: string): string {
  const parts: string[] = [];
  const tpl = p.template?.trim() || fallbackTemplate?.trim();
  if (tpl) parts.push(`${tpl}:`);
  parts.push(p.status ?? "FAILED");
  if (typeof p.httpStatus === "number" && Number.isFinite(p.httpStatus)) {
    parts.push(`HTTP ${p.httpStatus}`);
  }
  if (typeof p.latencyMs === "number" && Number.isFinite(p.latencyMs)) {
    parts.push(`${Math.round(p.latencyMs)}ms`);
  }
  const target = p.resolvedUrl?.trim() || p.resolvedPath?.trim();
  if (target) parts.push(target);
  const msg = p.preview?.trim() || p.error?.trim();
  if (msg) parts.push(`— ${msg}`);
  return parts.join(" ");
}

/** Pick the fastest successful concrete template from probeAllTemplates results. */
export function pickRecommendedTemplate(results: ProbeResult[]): ProbeResult | null {
  const ok = results.filter((r) => r.status === "SUCCESS" && Boolean(r.template?.trim()));
  if (ok.length === 0) return null;
  return ok.reduce((best, cur) => {
    const bestMs = typeof best.latencyMs === "number" ? best.latencyMs : Number.POSITIVE_INFINITY;
    const curMs = typeof cur.latencyMs === "number" ? cur.latencyMs : Number.POSITIVE_INFINITY;
    return curMs < bestMs ? cur : best;
  });
}

/**
 * Format a log entry into a single diagnostic line preserving all structured fields
 * and both non-empty `message` and `error` (fixes `"" ?? e.error` bug).
 */
export function formatLogLine(e: LogEntry): string {
  const parts: string[] = [];
  if (e.time?.trim()) parts.push(e.time.trim());
  if (e.level?.trim()) parts.push(`[${e.level.trim().toUpperCase()}]`);
  if (e.operation?.trim()) parts.push(`op=${e.operation.trim()}`);
  if (e.method?.trim()) parts.push(e.method.trim());
  if (e.url?.trim()) parts.push(e.url.trim());
  if (typeof e.status === "number" && Number.isFinite(e.status)) parts.push(`status=${e.status}`);
  if (typeof e.latencyMs === "number" && Number.isFinite(e.latencyMs)) {
    parts.push(`${Math.round(e.latencyMs)}ms`);
  }
  if (e.model?.trim()) parts.push(`model=${e.model.trim()}`);
  if (e.requestStyle?.trim()) parts.push(`style=${e.requestStyle.trim()}`);
  if (e.trigger?.trim()) parts.push(`trigger=${e.trigger.trim()}`);
  if (e.cacheHit === true) parts.push("cache=hit");
  if (typeof e.responseChars === "number" && Number.isFinite(e.responseChars)) {
    parts.push(`chars=${e.responseChars}`);
  }
  if (e.file?.trim()) parts.push(`file=${e.file.trim()}`);
  const msg = e.message?.trim() ?? "";
  const err = e.error?.trim() ?? "";
  if (msg) parts.push(msg);
  if (err && err !== msg) parts.push(`error=${err}`);
  return parts.join(" ");
}

export function logEntryFingerprint(e: LogEntry): string {
  return [
    e.time ?? "",
    e.level ?? "",
    e.requestId ?? "",
    e.operation ?? "",
    e.method ?? "",
    e.url ?? "",
    e.status ?? "",
    e.latencyMs ?? "",
    e.model ?? "",
    e.file ?? "",
    e.message ?? "",
    e.error ?? "",
  ].join("\u001f");
}

/** Merge incoming log entries with deduplication and bounded retention. */
export function mergeLogEntries(
  existing: LogEntry[],
  incoming: LogEntry[],
  maxEntries: number,
): LogEntry[] {
  const limit = Math.max(1, Math.min(maxEntries || 1000, 2000));
  const out = existing.slice(-limit);
  const seen = new Set<string>(out.map(logEntryFingerprint));
  for (const entry of incoming) {
    const fp = logEntryFingerprint(entry);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(entry);
  }
  return out.length > limit ? out.slice(-limit) : out;
}

/** True when a log entry matches a case-insensitive substring query across fields. */
export function matchesLogQuery(e: LogEntry, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  return formatLogLine(e).toLowerCase().includes(q);
}

/** Measure longest property-row label and set --label-w on the card element. */
export function measureSharedLabelWidth(card: HTMLElement): void {
  if (window.matchMedia("(max-width: 560px)").matches) {
    card.style.removeProperty("--label-w");
    return;
  }
  const labels = card.querySelectorAll<HTMLElement>(".row:not(.full) > .row-label");
  let max = 0;
  labels.forEach((el) => {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.style.cssText =
      "position:absolute;visibility:hidden;height:auto;width:auto;max-width:none;" +
      "white-space:nowrap;overflow:visible;pointer-events:none;left:-9999px;top:0";
    document.body.appendChild(clone);
    max = Math.max(max, clone.getBoundingClientRect().width);
    document.body.removeChild(clone);
  });
  if (max > 0) {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const cap = Math.min(window.innerWidth * 0.42, 16 * rem);
    const next = `${Math.min(Math.ceil(max), Math.floor(cap))}px`;
    if (card.style.getPropertyValue("--label-w") !== next) {
      card.style.setProperty("--label-w", next);
    }
  }
}

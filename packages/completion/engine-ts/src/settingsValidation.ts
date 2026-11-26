import { TIMEOUT } from "./types.js";

const RESERVED_HEADERS = new Set([
  "authorization",
  "content-type",
  "accept",
  "host",
  "content-length",
  "transfer-encoding",
  "connection",
]);

const EXPLICIT_SENSITIVE_HEADERS = new Set([
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
  "x-csrf-token",
  "x-xsrf-token",
]);

const SENSITIVE_HEADER_RE = /(?:auth|token|secret|key|cookie|credential|session|signature)/i;

export function hasCrlf(value: string): boolean {
  return /[\r\n\0]/.test(value);
}

export function isReservedHeaderName(name: string): boolean {
  return RESERVED_HEADERS.has(name.trim().toLowerCase());
}

export function isSensitiveHeaderName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return false;
  return EXPLICIT_SENSITIVE_HEADERS.has(normalized) || SENSITIVE_HEADER_RE.test(normalized);
}

export function isBlockedExtraHeaderName(name: string): boolean {
  return isReservedHeaderName(name) || isSensitiveHeaderName(name);
}

export function isLocalHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0";
}

export function validateSettings(opts: {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  settingsTimeoutMs?: number;
  maxTokens: number;
  maxPrefixChars: number;
  maxSuffixChars: number;
  allowRemote: boolean;
  extraHeadersJson: string;
  extraBodyJson?: string;
  authHeaderTemplate?: string;
  temperature?: number;
  debounceMinMs?: number;
  debounceInitialMs?: number;
  debounceMaxMs?: number;
  requireConnection?: boolean;
}): string[] {
  const errors: string[] = [];
  const requireConnection = opts.requireConnection !== false;
  const base = opts.baseUrl.trim();
  if (requireConnection && !base) errors.push("baseUrl is required");
  if (base) {
    let uri: URL | null = null;
    try {
      uri = new URL(base);
    } catch {
      uri = null;
    }
    if (!uri || !uri.protocol) {
      errors.push("baseUrl must be a valid URL");
    } else if (uri.protocol !== "http:" && uri.protocol !== "https:") {
      errors.push("baseUrl must use http or https");
    } else if (!uri.hostname) {
      errors.push("baseUrl must be a valid URL");
    } else if (uri.username || uri.password) {
      errors.push("baseUrl must not contain user-info credentials");
    } else if (!opts.allowRemote && !isLocalHostname(uri.hostname)) {
      errors.push("allowRemote=false but baseUrl is not localhost");
    }
  }
  if (requireConnection && !opts.model.trim()) errors.push("model is required");
  if (opts.timeoutMs < TIMEOUT.MIN_MS || opts.timeoutMs > TIMEOUT.MAX_MS) {
    errors.push(`timeoutMs must be ${TIMEOUT.MIN_MS}..${TIMEOUT.MAX_MS}`);
  }
  const settingsTimeout = opts.settingsTimeoutMs ?? TIMEOUT.DEFAULT_SETTINGS_MS;
  if (settingsTimeout < TIMEOUT.MIN_SETTINGS_MS || settingsTimeout > TIMEOUT.MAX_SETTINGS_MS) {
    errors.push(
      `settingsTimeoutMs must be ${TIMEOUT.MIN_SETTINGS_MS}..${TIMEOUT.MAX_SETTINGS_MS}`,
    );
  }
  if (opts.maxTokens < 16 || opts.maxTokens > 1024) errors.push("maxTokens must be 16..1024");
  if (opts.maxPrefixChars <= 0) errors.push("maxPrefixChars must be > 0");
  if (opts.maxSuffixChars <= 0) errors.push("maxSuffixChars must be > 0");
  if (opts.temperature !== undefined) {
    if (!Number.isFinite(opts.temperature) || opts.temperature < 0 || opts.temperature > 2) {
      errors.push("temperature must be 0..2");
    }
  }
  if (opts.authHeaderTemplate !== undefined && opts.authHeaderTemplate.trim()) {
    const tmpl = opts.authHeaderTemplate.trim();
    if (hasCrlf(tmpl)) {
      errors.push("authHeaderTemplate must not contain CR/LF");
    } else if (!tmpl.includes("${apiKey}")) {
      errors.push("authHeaderTemplate must contain ${apiKey}");
    }
  }
  if (opts.extraHeadersJson.trim()) {
    try {
      const parsed: unknown = JSON.parse(opts.extraHeadersJson);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        errors.push("extraHeadersJson must be a JSON object");
      } else {
        const entries = Object.entries(parsed as Record<string, unknown>);
        if (entries.some(([k, v]) => hasCrlf(k) || hasCrlf(v == null ? "" : String(v)))) {
          errors.push("extraHeadersJson must not contain CR/LF");
        }
        if (entries.some(([k]) => isBlockedExtraHeaderName(k))) {
          errors.push("extraHeadersJson must not contain credential or reserved headers");
        }
      }
    } catch {
      errors.push("extraHeadersJson must be a JSON object");
    }
  }
  if (opts.extraBodyJson !== undefined && opts.extraBodyJson.trim()) {
    try {
      const parsed: unknown = JSON.parse(opts.extraBodyJson);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        errors.push("extraBodyJson must be a JSON object");
      }
    } catch {
      errors.push("extraBodyJson must be a JSON object");
    }
  }
  const dMin = opts.debounceMinMs;
  const dInit = opts.debounceInitialMs;
  const dMax = opts.debounceMaxMs;
  if (
    (dMin !== undefined && dMin < 0) ||
    (dInit !== undefined && dInit < 0) ||
    (dMax !== undefined && dMax < 0)
  ) {
    errors.push("debounce values must be >= 0");
  } else if (
    (dMin !== undefined && dInit !== undefined && dMin > dInit) ||
    (dInit !== undefined && dMax !== undefined && dInit > dMax) ||
    (dMin !== undefined && dMax !== undefined && dMin > dMax)
  ) {
    errors.push("debounceMinMs <= debounceInitialMs <= debounceMaxMs required");
  }
  return errors;
}

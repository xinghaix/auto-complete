import { TIMEOUT } from "./types.js";

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
    if (!uri || !uri.protocol || !uri.hostname) {
      errors.push("baseUrl must be a valid URL");
    } else if (uri.username || uri.password) {
      errors.push("baseUrl must not contain user-info credentials");
    } else if (!opts.allowRemote) {
      const host = uri.hostname.toLowerCase();
      const local =
        host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0";
      if (!local) errors.push("allowRemote=false but baseUrl is not localhost");
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
  if (opts.extraHeadersJson.trim()) {
    try {
      const parsed = JSON.parse(opts.extraHeadersJson);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        errors.push("extraHeadersJson must be a JSON object");
      } else if (Object.keys(parsed).some(isSensitiveHeaderName)) {
        errors.push("extraHeadersJson must not contain credential headers");
      }
    } catch {
      errors.push("extraHeadersJson must be a JSON object");
    }
  }
  return errors;
}

function isSensitiveHeaderName(name: string): boolean {
  return new Set([
    "authorization",
    "proxy-authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "api-key",
    "x-auth-token",
    "x-access-token",
  ]).has(name.trim().toLowerCase());
}

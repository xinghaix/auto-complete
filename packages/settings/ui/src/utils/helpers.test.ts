import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_IGNORE_GLOBS,
  SERVICE_PRESETS,
  disabledLanguagesFromSnapshot,
  formatContextLength,
  formatLogLine,
  formatProbeLine,
  getServicePreset,
  ignoreGlobsFromSnapshot,
  isBlankProfileDraft,
  isSensitiveHeaderName,
  matchesLogQuery,
  mergeLogEntries,
  normalizeHostTheme,
  normalizeTab,
  normalizeUiLocale,
  normalizeUiTheme,
  numOr,
  parseOptionalNumber,
  pickRecommendedTemplate,
  validateForm,
  validateGlobalSettings,
  validateProfile,
} from "./helpers.ts";

describe("helpers (settings-ui)", () => {
  it("normalizeTab maps aliases", () => {
    assert.equal(normalizeTab("logs"), "logs");
    assert.equal(normalizeTab("log"), "logs");
    assert.equal(normalizeTab("behaviour"), "behavior");
    assert.equal(normalizeTab("perf"), "performance");
    assert.equal(normalizeTab("general"), "general");
    assert.equal(normalizeTab("settings"), "config");
    assert.equal(normalizeTab(""), "config");
  });

  it("normalizeUiTheme and host theme (including high-contrast variants)", () => {
    assert.equal(normalizeUiTheme("light"), "light");
    assert.equal(normalizeUiTheme("DARK"), "dark");
    assert.equal(normalizeUiTheme("auto"), "auto");
    assert.equal(normalizeUiTheme(null), "auto");
    assert.equal(normalizeHostTheme("light"), "light");
    assert.equal(normalizeHostTheme("high-contrast"), "high-contrast");
    assert.equal(normalizeHostTheme("high-contrast-dark"), "high-contrast-dark");
    assert.equal(normalizeHostTheme("high-contrast-light"), "high-contrast-light");
    assert.equal(normalizeHostTheme("HighContrastLight"), "high-contrast-light");
    assert.equal(normalizeHostTheme("dark"), "dark");
    assert.equal(normalizeHostTheme(undefined), "dark");
  });

  it("normalizeUiLocale", () => {
    assert.equal(normalizeUiLocale("zh"), "zh");
    assert.equal(normalizeUiLocale("EN"), "en");
    assert.equal(normalizeUiLocale("auto"), "auto");
    assert.equal(normalizeUiLocale("fr"), "auto");
  });

  it("numOr, parseOptionalNumber, and snapshot string helpers", () => {
    assert.equal(numOr(42, 1), 42);
    assert.equal(numOr("99", 1), 99);
    assert.equal(numOr("x", 7), 7);
    assert.equal(parseOptionalNumber(""), undefined);
    assert.equal(parseOptionalNumber("   "), undefined);
    assert.equal(parseOptionalNumber("-"), undefined);
    assert.equal(parseOptionalNumber("0."), 0);
    assert.equal(parseOptionalNumber("0.5"), 0.5);
    assert.equal(parseOptionalNumber("0"), 0);
    assert.equal(parseOptionalNumber("abc"), undefined);
    assert.equal(ignoreGlobsFromSnapshot(["a", "b"]), "a\nb");
    assert.equal(ignoreGlobsFromSnapshot(undefined), DEFAULT_IGNORE_GLOBS);
    assert.equal(disabledLanguagesFromSnapshot(["md", "json"]), "md, json");
    assert.equal(disabledLanguagesFromSnapshot(""), "");
  });

  it("validateProfile and localized validateForm cover URL, headers, body, and numeric bounds", () => {
    const emptyIssues = validateProfile({ id: "1", name: "n" }, true);
    assert.ok(emptyIssues.some((i) => i.key === "valBaseUrlRequired"));
    assert.ok(emptyIssues.some((i) => i.key === "valModelRequired"));
    assert.equal(isBlankProfileDraft({ id: "1", name: "n" }), true);

    const zhMsgs = validateForm({ id: "1", name: "n" }, true, "zh");
    assert.ok(zhMsgs.some((m) => m.includes("服务地址")));
    assert.ok(zhMsgs.some((m) => m.includes("模型")));

    // Reject non-http(s) scheme
    const ftpIssues = validateProfile(
      { id: "1", name: "n", baseUrl: "ftp://example.com/v1", model: "m" },
      true,
    );
    assert.ok(ftpIssues.some((i) => i.key === "valBaseUrlScheme"));

    // Reject userInfo credentials in URL
    const userInfoIssues = validateProfile(
      { id: "1", name: "n", baseUrl: "https://user:pass@example.com/v1", model: "m" },
      true,
    );
    assert.ok(userInfoIssues.some((i) => i.key === "valBaseUrlUserInfo"));

    // Accept IPv6 localhost URL
    const ipv6Issues = validateProfile(
      { id: "1", name: "n", baseUrl: "http://[::1]:11434/v1", model: "m" },
      true,
    );
    assert.deepEqual(ipv6Issues, []);

    // Reject authHeaderTemplate without ${apiKey}
    const badAuth = validateProfile(
      {
        id: "1",
        name: "n",
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "m",
        authHeaderTemplate: "Authorization: Bearer ***",
      },
      true,
    );
    assert.ok(badAuth.some((i) => i.key === "valAuthHeaderPlaceholder"));

    // Temperature out of range
    const badTemp = validateProfile(
      {
        id: "1",
        name: "n",
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "m",
        temperature: 2.5,
      },
      true,
    );
    assert.ok(badTemp.some((i) => i.key === "valTemperatureRange"));

    // Sensitive headers & invalid extraBodyJson
    assert.equal(isSensitiveHeaderName("anthropic-api-key"), true);
    assert.equal(isSensitiveHeaderName("X-Goog-Api-Key"), true);
    assert.equal(isSensitiveHeaderName("Authorization"), true);
    assert.equal(isSensitiveHeaderName("X-Custom-Tenant"), false);

    const badExtra = validateProfile(
      {
        id: "1",
        name: "n",
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "m",
        extraHeadersJson: '{"anthropic-api-key":"abc"}',
        extraBodyJson: "[1,2,3]",
      },
      true,
    );
    assert.ok(badExtra.some((i) => i.key === "valExtraHeadersSensitive"));
    assert.ok(badExtra.some((i) => i.key === "valExtraBodyJson"));

    const ok = validateForm(
      {
        id: "1",
        name: "n",
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "m",
        timeoutMs: 3000,
        settingsTimeoutMs: 15000,
        maxTokens: 128,
        temperature: 0.2,
        authHeaderTemplate: "Authorization: Bearer ${apiKey}",
        extraHeadersJson: '{"X-App":"ac"}',
        extraBodyJson: '{"top_p":0.9}',
      },
      true,
      "en",
    );
    assert.deepEqual(ok, []);
  });

  it("validateGlobalSettings checks debounce order and positive limits", () => {
    const valid = validateGlobalSettings({
      debounceMinMs: 150,
      debounceInitialMs: 300,
      debounceMaxMs: 1000,
      maxPrefixChars: 8000,
      maxSuffixChars: 2000,
      maxInFlight: 1,
      cacheSize: 20,
      lruSize: 64,
      maxFileSizeKb: 512,
      recentFileLimit: 3,
      recentFileMaxChars: 1200,
      logRetention: 1000,
    });
    assert.deepEqual(valid, []);

    const badOrder = validateGlobalSettings({
      debounceMinMs: 500,
      debounceInitialMs: 300,
      debounceMaxMs: 1000,
      maxPrefixChars: 8000,
      maxSuffixChars: 2000,
      maxInFlight: 0,
      cacheSize: 0,
      lruSize: 0,
      maxFileSizeKb: 0,
      recentFileLimit: -1,
      recentFileMaxChars: 0,
      logRetention: 10,
    });
    assert.ok(badOrder.some((i) => i.key === "valDebounceOrder"));
    assert.ok(badOrder.some((i) => i.key === "valMaxInFlightPositive"));
    assert.ok(badOrder.some((i) => i.key === "valLogRetentionRange"));
  });

  it("service presets provide public URLs with no secrets", () => {
    assert.equal(SERVICE_PRESETS.length, 4);
    assert.equal(getServicePreset("ollama")?.baseUrl, "http://127.0.0.1:11434/v1");
    assert.equal(getServicePreset("deepseek")?.baseUrl, "https://api.deepseek.com/beta");
    assert.equal(getServicePreset("deepseek")?.fimPath, "/completions");
    assert.equal(getServicePreset("mistral")?.baseUrl, "https://codestral.mistral.ai/v1");
    assert.equal(getServicePreset("vllm")?.baseUrl, "http://127.0.0.1:8000/v1");
  });

  it("formatContextLength, formatProbeLine, and pickRecommendedTemplate", () => {
    assert.equal(formatContextLength(32768), "32k");
    assert.equal(formatContextLength(131072), "128k");
    assert.equal(formatContextLength(1048576), "1M");
    assert.equal(formatContextLength(null), "");

    const line = formatProbeLine({
      template: "CODESTRAL_API",
      status: "EMPTY",
      httpStatus: 200,
      latencyMs: 142,
      resolvedPath: "/fim/completions",
      error: "empty response",
    });
    assert.ok(line.includes("CODESTRAL_API:"));
    assert.ok(line.includes("EMPTY"));
    assert.ok(line.includes("HTTP 200"));
    assert.ok(line.includes("142ms"));
    assert.ok(line.includes("/fim/completions"));
    assert.ok(line.includes("empty response"));

    const dedup = formatProbeLine({
      template: "CODESTRAL_API",
      status: "FAILED",
      httpStatus: 400,
      latencyMs: 668,
      resolvedUrl: "http://127.0.0.1:8317/v1/chat/completions",
      error:
        'POST http://127.0.0.1:8317/v1/chat/completions -> HTTP 400: {"error":{"message":"Missing required parameter: \'input\'.","type":"invalid_request_error"}} (hint: FIM path override points to /chat/completions; clear FIM path or use CHAT template)',
    });
    assert.equal(dedup.split("http://127.0.0.1:8317/v1/chat/completions").length - 1, 1);
    assert.ok(dedup.includes("Missing required parameter: 'input'."));
    assert.ok(dedup.includes("(hint: FIM path override points to /chat/completions"));

    const rec = pickRecommendedTemplate([
      { template: "CHAT", status: "SUCCESS", latencyMs: 320, preview: "return a + b" },
      { template: "QWEN", status: "EMPTY", latencyMs: 50 },
      { template: "CODESTRAL_API", status: "SUCCESS", latencyMs: 120, preview: "return a + b" },
    ]);
    assert.equal(rec?.template, "CODESTRAL_API");

    const cleanOverFenced = pickRecommendedTemplate([
      { template: "DEEPSEEK", status: "SUCCESS", latencyMs: 1400, preview: "```python return a + b ```" },
      { template: "QWEN", status: "SUCCESS", latencyMs: 1200, preview: "def add(a, b): return a + b" },
      { template: "RESPONSES", status: "SUCCESS", latencyMs: 1800, preview: "return a + b" },
      { template: "CHAT", status: "SUCCESS", latencyMs: 2200, preview: "return a + b" },
    ]);
    assert.equal(cleanOverFenced?.template, "RESPONSES");
  });

  it("formatLogLine renders both message and error even when message is empty string", () => {
    const jbErrorLog = formatLogLine({
      time: "2026-01-01T10:00:00Z",
      level: "error",
      operation: "completion",
      method: "POST",
      url: "http://127.0.0.1:11434/v1/chat/completions",
      status: 401,
      latencyMs: 88,
      model: "qwen2.5-coder:7b",
      requestStyle: "CHAT",
      trigger: "MANUAL",
      cacheHit: false,
      responseChars: 0,
      file: "src/app.ts",
      message: "",
      error: "HTTP 401 Unauthorized",
    });
    assert.ok(jbErrorLog.includes("HTTP 401 Unauthorized"));
    assert.ok(jbErrorLog.includes("POST"));
    assert.ok(jbErrorLog.includes("status=401"));
    assert.ok(jbErrorLog.includes("88ms"));
    assert.ok(jbErrorLog.includes("model=qwen2.5-coder:7b"));
    assert.ok(jbErrorLog.includes("file=src/app.ts"));

    const both = formatLogLine({
      level: "warn",
      message: "retrying",
      error: "timeout",
    });
    assert.ok(both.includes("retrying"));
    assert.ok(both.includes("error=timeout"));
  });

  it("mergeLogEntries deduplicates cleanly and matchesLogQuery filters across fields", () => {
    const a = { time: "2026-01-01T00:00:01Z", level: "info", message: "hello", model: "qwen" };
    const b = { time: "2026-01-01T00:00:02Z", level: "error", message: "", error: "HTTP 500" };
    const merged = mergeLogEntries([a], [a, b], 100);
    assert.equal(merged.length, 2);
    assert.equal(matchesLogQuery(a, "QWEN"), true);
    assert.equal(matchesLogQuery(b, "500"), true);
    assert.equal(matchesLogQuery(a, "500"), false);
  });
});

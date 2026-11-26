import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isBlockedExtraHeaderName,
  isLocalHostname,
  isSensitiveHeaderName,
  validateSettings,
} from "../src/settingsValidation.js";

const validBase = {
  baseUrl: "http://127.0.0.1:11434/v1",
  model: "qwen2.5-coder:7b",
  timeoutMs: 3000,
  settingsTimeoutMs: 15000,
  maxTokens: 128,
  maxPrefixChars: 8000,
  maxSuffixChars: 2000,
  allowRemote: false,
  extraHeadersJson: "{}",
  extraBodyJson: "",
  authHeaderTemplate: "Authorization: Bearer ${apiKey}",
  temperature: 0,
  debounceMinMs: 150,
  debounceInitialMs: 300,
  debounceMaxMs: 1000,
};

describe("validateSettings", () => {
  it("accepts valid defaults and IPv6 localhost [::1] / ::1", () => {
    assert.deepEqual(validateSettings(validBase), []);
    assert.deepEqual(
      validateSettings({ ...validBase, baseUrl: "http://[::1]:11434/v1", allowRemote: false }),
      [],
    );
    assert.equal(isLocalHostname("[::1]"), true);
    assert.equal(isLocalHostname("::1"), true);
    assert.equal(isLocalHostname("localhost"), true);
    assert.equal(isLocalHostname("api.example.com"), false);
  });

  it("rejects non-http(s) baseUrl schemes and userInfo credentials", () => {
    const fileErrs = validateSettings({ ...validBase, baseUrl: "file:///etc/passwd", allowRemote: true });
    assert.ok(fileErrs.some((e) => e.includes("http or https")));

    const ftpErrs = validateSettings({ ...validBase, baseUrl: "ftp://127.0.0.1/v1", allowRemote: true });
    assert.ok(ftpErrs.some((e) => e.includes("http or https")));

    const userInfoErrs = validateSettings({
      ...validBase,
      baseUrl: "https://user:pass@api.example.com/v1",
      allowRemote: true,
    });
    assert.ok(userInfoErrs.some((e) => e.includes("user-info")));
  });

  it("rejects non-blank authHeaderTemplate missing ${apiKey} or containing CRLF", () => {
    const hardcoded = validateSettings({
      ...validBase,
      authHeaderTemplate: "Authorization: Bearer sk-hardcoded-token",
    });
    assert.ok(hardcoded.some((e) => e.includes("${apiKey}")));

    const crlf = validateSettings({
      ...validBase,
      authHeaderTemplate: "Authorization: Bearer ${apiKey}\r\nX-Inject: 1",
    });
    assert.ok(crlf.some((e) => e.includes("CR/LF")));

    // Blank authHeaderTemplate is allowed (falls back to default)
    assert.deepEqual(validateSettings({ ...validBase, authHeaderTemplate: "" }), []);
  });

  it("blocks broad sensitive headers, explicit API key headers, reserved headers, and CRLF in extraHeadersJson", () => {
    for (const h of [
      "Authorization",
      "Content-Type",
      "Accept",
      "Host",
      "x-goog-api-key",
      "anthropic-api-key",
      "openai-api-key",
      "api_key",
      "ocp-apim-subscription-key",
      "private-token",
      "X-My-Secret",
      "X-Session-Id",
      "X-Request-Signature",
      "X-Credential-Info",
    ]) {
      assert.equal(isBlockedExtraHeaderName(h), true, `${h} should be blocked`);
      const errs = validateSettings({
        ...validBase,
        extraHeadersJson: JSON.stringify({ [h]: "value" }),
      });
      assert.ok(errs.length > 0, `validateSettings should reject header ${h}`);
    }
    assert.equal(isSensitiveHeaderName("X-Title"), false);
    assert.equal(isBlockedExtraHeaderName("HTTP-Referer"), false);
    assert.deepEqual(
      validateSettings({
        ...validBase,
        extraHeadersJson: JSON.stringify({ "X-Title": "AutoComplete", "HTTP-Referer": "https://example.com" }),
      }),
      [],
    );

    const crlfErrs = validateSettings({
      ...validBase,
      extraHeadersJson: JSON.stringify({ "X-Title": "bad\r\nvalue" }),
    });
    assert.ok(crlfErrs.some((e) => e.includes("CR/LF")));
  });

  it("validates extraBodyJson, temperature, and debounce order", () => {
    assert.deepEqual(validateSettings({ ...validBase, extraBodyJson: '{"top_p":0.9}' }), []);
    assert.ok(
      validateSettings({ ...validBase, extraBodyJson: "[1,2]" }).some((e) =>
        e.includes("extraBodyJson"),
      ),
    );
    assert.ok(
      validateSettings({ ...validBase, extraBodyJson: "{invalid" }).some((e) =>
        e.includes("extraBodyJson"),
      ),
    );
    assert.ok(
      validateSettings({ ...validBase, temperature: 2.5 }).some((e) => e.includes("temperature")),
    );
    assert.ok(
      validateSettings({
        ...validBase,
        debounceMinMs: 500,
        debounceInitialMs: 300,
        debounceMaxMs: 1000,
      }).some((e) => e.includes("debounce")),
    );
    assert.deepEqual(
      validateSettings({
        ...validBase,
        debounceMinMs: 0,
        debounceInitialMs: 0,
        debounceMaxMs: 500,
      }),
      [],
    );
  });
});

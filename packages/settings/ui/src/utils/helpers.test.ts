import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_IGNORE_GLOBS,
  disabledLanguagesFromSnapshot,
  ignoreGlobsFromSnapshot,
  normalizeHostTheme,
  normalizeTab,
  normalizeUiLocale,
  normalizeUiTheme,
  numOr,
  validateForm,
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

  it("normalizeUiTheme and host theme", () => {
    assert.equal(normalizeUiTheme("light"), "light");
    assert.equal(normalizeUiTheme("DARK"), "dark");
    assert.equal(normalizeUiTheme("auto"), "auto");
    assert.equal(normalizeUiTheme(null), "auto");
    assert.equal(normalizeHostTheme("light"), "light");
    assert.equal(normalizeHostTheme("high-contrast"), "high-contrast");
    assert.equal(normalizeHostTheme("dark"), "dark");
    assert.equal(normalizeHostTheme(undefined), "dark");
  });

  it("normalizeUiLocale", () => {
    assert.equal(normalizeUiLocale("zh"), "zh");
    assert.equal(normalizeUiLocale("EN"), "en");
    assert.equal(normalizeUiLocale("auto"), "auto");
    assert.equal(normalizeUiLocale("fr"), "auto");
  });

  it("numOr and snapshot string helpers", () => {
    assert.equal(numOr(42, 1), 42);
    assert.equal(numOr("99", 1), 99);
    assert.equal(numOr("x", 7), 7);
    assert.equal(ignoreGlobsFromSnapshot(["a", "b"]), "a\nb");
    assert.equal(ignoreGlobsFromSnapshot(undefined), DEFAULT_IGNORE_GLOBS);
    assert.equal(disabledLanguagesFromSnapshot(["md", "json"]), "md, json");
    assert.equal(disabledLanguagesFromSnapshot(""), "");
  });

  it("validateForm requires baseUrl/model when profiles exist", () => {
    const empty = validateForm({ id: "1", name: "n" }, true);
    assert.ok(empty.some((e) => e.includes("baseUrl")));
    assert.ok(empty.some((e) => e.includes("model")));

    const ok = validateForm(
      {
        id: "1",
        name: "n",
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "m",
        timeoutMs: 3000,
        settingsTimeoutMs: 15000,
        maxTokens: 128,
      },
      true,
    );
    assert.deepEqual(ok, []);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectLocale, t } from "./index.ts";
import { en, ja, ko, zh, type MessageKey } from "./messages.ts";

function extractPlaceholders(s: string): string[] {
  return Array.from(new Set(s.match(/\{\d+\}/g) ?? [])).sort();
}

describe("detectLocale & i18n catalogs", () => {
  it("maps VS Code and JetBrains tags", () => {
    assert.equal(detectLocale("zh-cn"), "zh");
    assert.equal(detectLocale("zh-CN"), "zh");
    assert.equal(detectLocale("zh-tw"), "zh");
    assert.equal(detectLocale("zh-Hans-CN"), "zh");
    assert.equal(detectLocale("ja"), "ja");
    assert.equal(detectLocale("ja-JP"), "ja");
    assert.equal(detectLocale("ko"), "ko");
    assert.equal(detectLocale("ko-KR"), "ko");
    assert.equal(detectLocale("en"), "en");
    assert.equal(detectLocale("en-US"), "en");
    assert.equal(detectLocale("pt-BR"), "en");
    assert.equal(detectLocale(""), "en");
    assert.equal(detectLocale(undefined), "en");
  });

  it("has complete, non-empty, placeholder-aligned keys across all 4 locales", () => {
    const catalogs = { en, zh, ja, ko } as const;
    const enKeys = Object.keys(en).sort() as MessageKey[];
    assert.ok(enKeys.length > 100);

    for (const [loc, cat] of Object.entries(catalogs)) {
      const keys = Object.keys(cat).sort();
      assert.deepEqual(keys, enKeys, `locale ${loc} key set must match en`);
      for (const key of enKeys) {
        const val = cat[key];
        assert.equal(typeof val, "string", `${loc}.${key} must be a string`);
        assert.ok(val.trim().length > 0, `${loc}.${key} must not be empty`);
        assert.deepEqual(
          extractPlaceholders(val),
          extractPlaceholders(en[key]),
          `${loc}.${key} placeholders must match en.${key}`,
        );
      }
    }

    assert.notEqual(t("zh", "tabConfig"), t("en", "tabConfig"));
    assert.notEqual(t("ja", "tabConfig"), t("en", "tabConfig"));
    assert.notEqual(t("ko", "tabConfig"), t("en", "tabConfig"));
  });

  it("applies targeted translation fixes and removes stale keys", () => {
    assert.equal(zh.themeLight, "浅色");
    assert.equal(ja.sectionAbout, "このプラグインについて");
    assert.equal("jcefFallback" in en, false);
  });
});

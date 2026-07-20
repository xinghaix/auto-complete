import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectLocale, t } from "./index.ts";

describe("detectLocale", () => {
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

  it("has four catalogs", () => {
    for (const loc of ["en", "zh", "ja", "ko"] as const) {
      assert.ok(t(loc, "tabSettings").length > 0);
      assert.ok(t(loc, "languageAuto").length > 0);
    }
    assert.notEqual(t("zh", "tabSettings"), t("en", "tabSettings"));
    assert.notEqual(t("ja", "tabSettings"), t("en", "tabSettings"));
    assert.notEqual(t("ko", "tabSettings"), t("en", "tabSettings"));
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PromptLruCache, SuggestionCache } from "../src/cache.js";

describe("SuggestionCache", () => {
  it("caps BACKWARD_DELETION to <= 32 chars and rejects deletion across newlines", () => {
    const cache = new SuggestionCache(20);
    cache.put({
      scope: "a.ts",
      prefix: "line1\n" + "a".repeat(40),
      suffix: "",
      text: "END",
    });

    // Deleting 10 chars on same line -> allowed
    const ok = cache.find("a.ts", "line1\n" + "a".repeat(30), "");
    assert.ok(ok);
    assert.equal(ok!.match, "BACKWARD_DELETION");
    assert.equal(ok!.text, "a".repeat(10) + "END");

    // Deleting 33 chars -> rejected
    const tooLong = cache.find("a.ts", "line1\n" + "a".repeat(7), "");
    assert.equal(tooLong, null);

    // Deleting across newline -> rejected
    cache.clear();
    cache.put({ scope: "a.ts", prefix: "foo\nbar", suffix: "", text: "baz" });
    assert.equal(cache.find("a.ts", "fo", ""), null);
  });

  it("expires entries after 5-minute TTL", () => {
    let now = 1_000_000;
    const cache = new SuggestionCache(20, 300_000, () => now);
    cache.put({ scope: "a.ts", prefix: "foo(", suffix: ")", text: "bar" });
    assert.ok(cache.find("a.ts", "foo(", ")"));

    now += 300_001;
    assert.equal(cache.find("a.ts", "foo(", ")"), null);
    assert.equal(cache.size(), 0);
  });

  it("caps stored prefix/suffix size while still matching exact and partial typing on large files", () => {
    const cache = new SuggestionCache(20);
    const bigPrefix = "x".repeat(10_000) + "const foo = ";
    const bigSuffix = "\n" + "y".repeat(5_000);
    cache.put({ scope: "big.ts", prefix: bigPrefix, suffix: bigSuffix, text: "barBaz" });

    const exact = cache.find("big.ts", bigPrefix, bigSuffix);
    assert.ok(exact);
    assert.equal(exact!.match, "EXACT");
    assert.ok(exact!.source.prefix.length <= 4096);
    assert.ok(exact!.source.suffix.length <= 1024);

    const partial = cache.find("big.ts", bigPrefix + "bar", bigSuffix);
    assert.ok(partial);
    assert.equal(partial!.match, "PARTIAL_TYPING");
    assert.equal(partial!.text, "Baz");

    const back = cache.find("big.ts", bigPrefix.slice(0, -3), bigSuffix);
    assert.ok(back);
    assert.equal(back!.match, "BACKWARD_DELETION");
    assert.equal(back!.text, " = barBaz");
  });
});

describe("PromptLruCache", () => {
  it("evicts least recently used entry and honors TTL", () => {
    let now = 10_000;
    const lru = new PromptLruCache(2, 300_000, () => now);
    lru.put("k1", "v1");
    lru.put("k2", "v2");
    assert.equal(lru.get("k1"), "v1"); // refresh k1
    lru.put("k3", "v3"); // evicts k2
    assert.equal(lru.get("k2"), undefined);
    assert.equal(lru.get("k1"), "v1");
    assert.equal(lru.get("k3"), "v3");

    now += 300_001;
    assert.equal(lru.get("k1"), undefined);
    assert.equal(lru.size(), 0);
  });
});

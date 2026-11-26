import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  contextTokensFromModelObject,
  estimateContextTokens,
  forModel,
  ModelLimits,
} from "../src/modelLimits.js";

describe("ModelLimits", () => {
  it("estimates common model families and avoids o1/o3/o4 false matches", () => {
    assert.equal(estimateContextTokens("qwen2.5-coder:7b"), 32_768);
    assert.equal(estimateContextTokens("qwen3-coder:30b"), 32_768);
    assert.equal(estimateContextTokens("codestral-latest"), 32_768);
    assert.equal(estimateContextTokens("deepseek-coder-v2"), 16_384);
    assert.equal(estimateContextTokens("gpt-4o-mini"), 128_000);
    assert.equal(estimateContextTokens("o3-mini"), 128_000);
    assert.equal(estimateContextTokens("openai/o1-preview"), 128_000);
    assert.equal(estimateContextTokens("my-model-32k"), 32_768);
    // Word boundary check: demo1-coder and proto3-coder must NOT match o1/o3 -> 128k
    assert.equal(estimateContextTokens("demo1-coder"), 8_192);
    assert.equal(estimateContextTokens("proto3-coder"), 8_192);
  });

  it("computes conservative prefix/suffix budgets and prefers reported contextLength", () => {
    const heuristic = ModelLimits.forModel("qwen2.5-coder");
    assert.equal(heuristic.contextTokens, 32_768);
    assert.equal(heuristic.source, "heuristic");
    assert.ok(heuristic.maxPrefixChars >= 2_000 && heuristic.maxPrefixChars <= 32_000);
    assert.ok(heuristic.maxSuffixChars >= 500 && heuristic.maxSuffixChars <= 8_000);
    assert.ok(heuristic.maxSuffixChars < heuristic.maxPrefixChars);

    const reported = forModel("unknown-model", 16_384);
    assert.equal(reported.contextTokens, 16_384);
    assert.equal(reported.source, "reported");
  });

  it("extracts context tokens >= 512 from diverse /models JSON shapes", () => {
    assert.equal(contextTokensFromModelObject({ context_length: 8192 }), 8192);
    assert.equal(contextTokensFromModelObject({ contextLength: 32768 }), 32768);
    assert.equal(contextTokensFromModelObject({ context_window: 128000 }), 128000);
    assert.equal(contextTokensFromModelObject({ max_seq_len: 16384 }), 16384);
    assert.equal(contextTokensFromModelObject({ n_ctx: 4096 }), 4096);
    assert.equal(contextTokensFromModelObject({ meta: { n_ctx_train: 65536 } }), 65536);
    assert.equal(contextTokensFromModelObject({ data: { context_length: 24576 } }), 24576);
    assert.equal(contextTokensFromModelObject({ max_tokens: 128 }), null);
    assert.equal(contextTokensFromModelObject({ context_length: 256 }), null);
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { SuggestionCache } from "../src/cache.js";
import { bodyFor, parseText } from "../src/httpClient.js";
import { buildPrompt } from "../src/promptBuilder.js";
import { detectTemplate, formatTokenPrompt, resolveTemplate } from "../src/promptTemplate.js";
import { postprocess, removePrefixOverlap, shouldShowOnlyFirstLine } from "../src/suggestionFilter.js";
import { shouldSkip } from "../src/contextualSkip.js";
import { validateSettings } from "../src/settingsValidation.js";
import { ErrorBackoff } from "../src/errorBackoff.js";
import { normalizeLanguage } from "../src/languageMap.js";
import { CompletionEngine } from "../src/engine.js";
import { defaultEngineSettings } from "../src/types.js";
import { CancellationToken } from "../src/errorBackoff.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../shared-spec/testdata");

function loadJson<T>(rel: string): T {
  return JSON.parse(readFileSync(join(root, rel), "utf8")) as T;
}

describe("shared-spec HTTP fixtures", () => {
  it("parses chat completion", () => {
    const fix = loadJson<{
      response: unknown;
      expectedText: string;
      wireFormat: "CHAT_MESSAGES";
    }>("http/chat_completion.json");
    assert.equal(parseText(fix.wireFormat, JSON.stringify(fix.response)), fix.expectedText);
  });

  it("parses fim completion", () => {
    const fix = loadJson<{
      response: unknown;
      expectedText: string;
      wireFormat: "FIM_FIELDS";
    }>("http/fim_completion.json");
    assert.equal(parseText(fix.wireFormat, JSON.stringify(fix.response)), fix.expectedText);
  });

  it("builds qwen token FIM body", () => {
    const fix = loadJson<{
      template: "QWEN";
      input: {
        model: string;
        prefix: string;
        suffix: string;
        maxTokens: number;
        temperature: number;
        stream: boolean;
      };
      expectedBody: Record<string, unknown>;
    }>("http/token_fim_qwen_body.json");
    const body = JSON.parse(
      bodyFor(
        fix.template,
        {
          model: fix.input.model,
          prefix: fix.input.prefix,
          suffix: fix.input.suffix,
          maxTokens: fix.input.maxTokens,
          temperature: fix.input.temperature,
          stream: fix.input.stream,
        },
        {
          kind: "OPENAI_COMPATIBLE",
          baseUrl: "http://127.0.0.1:11434/v1",
          apiKey: "",
          model: fix.input.model,
        },
        false,
      ),
    );
    assert.deepEqual(body, fix.expectedBody);
  });
});

describe("shared-spec prompt budget", () => {
  it("matches golden cases", () => {
    const fix = loadJson<{
      cases: Array<{
        id: string;
        prefix: string;
        suffix: string;
        maxPrefixChars: number;
        maxSuffixChars: number;
        path: string | null;
        language: string | null;
        sendFilePath: boolean;
        expectedPrefix?: string;
        expectedSuffix: string;
        expectedPrefixContains?: string[];
      }>;
    }>("prompt/budget_truncate.json");
    for (const c of fix.cases) {
      const built = buildPrompt({
        prefix: c.prefix,
        suffix: c.suffix,
        maxPrefixChars: c.maxPrefixChars,
        maxSuffixChars: c.maxSuffixChars,
        path: c.path,
        language: c.language,
        sendFilePath: c.sendFilePath,
      });
      if (c.expectedPrefix != null) assert.equal(built.prefix, c.expectedPrefix, c.id);
      if (c.expectedPrefixContains) {
        for (const part of c.expectedPrefixContains) {
          assert.ok(built.prefix.includes(part), `${c.id} missing ${part}`);
        }
      }
      assert.equal(built.suffix, c.expectedSuffix, c.id);
    }
  });
});

describe("shared-spec cache", () => {
  it("matches golden cases", () => {
    const fix = loadJson<{
      cases: Array<{
        id: string;
        put: { scope: string; prefix: string; suffix: string; text: string };
        find: { scope: string; prefix: string; suffix: string };
        expected: { text: string; match: string };
      }>;
    }>("cache/suggestion_match.json");
    for (const c of fix.cases) {
      const cache = new SuggestionCache(20);
      cache.put(c.put);
      const hit = cache.find(c.find.scope, c.find.prefix, c.find.suffix);
      assert.ok(hit, c.id);
      assert.equal(hit!.text, c.expected.text, c.id);
      assert.equal(hit!.match, c.expected.match, c.id);
    }
  });
});

describe("prompt templates", () => {
  it("detects model families", () => {
    assert.equal(detectTemplate("qwen2.5-coder:7b"), "QWEN");
    assert.equal(detectTemplate("codestral-latest"), "CODESTRAL_API");
    assert.equal(detectTemplate("deepseek-coder-v2"), "DEEPSEEK");
    assert.equal(detectTemplate("starcoder2-15b"), "STARCODER");
    assert.equal(detectTemplate("gpt-4o"), "CHAT");
    assert.equal(resolveTemplate("AUTO", "qwen2.5-coder", "OPENAI_COMPATIBLE"), "QWEN");
  });

  it("formats token prompts", () => {
    assert.equal(
      formatTokenPrompt("QWEN", "a", "b"),
      "<|fim_prefix|>a<|fim_suffix|>b<|fim_middle|>",
    );
  });
});

describe("filter / skip / validation", () => {
  it("removes prefix overlap", () => {
    assert.equal(removePrefixOverlap("foobar", "foo"), "bar");
  });

  it("postprocesses fences", () => {
    assert.equal(postprocess("```ts\nx\n```", "", "", false), "x");
  });

  it("first line mid-line", () => {
    assert.equal(shouldShowOnlyFirstLine("  const x = ", "a\nb"), true);
  });

  it("contextual skip mid-word", () => {
    assert.equal(shouldSkip("const fo", "obar", "typescript"), true);
  });

  it("validates settings", () => {
    const errs = validateSettings({
      baseUrl: "not-a-url",
      model: "",
      timeoutMs: 10,
      maxTokens: 1,
      maxPrefixChars: 0,
      maxSuffixChars: 0,
      allowRemote: true,
      extraHeadersJson: "[]",
    });
    assert.ok(errs.length >= 4);
  });

  it("normalizes language", () => {
    assert.equal(normalizeLanguage("text", "Main.kt"), "kotlin");
    assert.equal(normalizeLanguage("TypeScript", "x.ts"), "typescript");
  });
});

describe("error backoff", () => {
  it("blocks on fatal", () => {
    const b = new ErrorBackoff();
    assert.equal(b.failure(new Error("auth"), 401), "FATAL");
    assert.equal(b.blocked(), true);
    b.success();
    assert.equal(b.blocked(), false);
  });
});

describe("engine integration", () => {
  it("returns cache hit without client", async () => {
    const settings = defaultEngineSettings({
      model: "m",
      providerConfig: {
        kind: "OPENAI_COMPATIBLE",
        baseUrl: "http://127.0.0.1:9/v1",
        apiKey: "",
        model: "m",
      },
    });
    const engine = new CompletionEngine(() => settings, undefined, undefined, () => ({
      complete: async () => ({ text: "should-not-run" }),
    }));
    // seed via first fake success path: put through history by completing with client once
    const client = {
      complete: async () => ({ text: "bar" }),
    };
    const engine2 = new CompletionEngine(() => settings, undefined, undefined, () => client);
    const r1 = await engine2.complete({
      id: "1",
      path: "a.ts",
      language: "typescript",
      prefix: "foo(",
      suffix: ")",
      offset: 4,
      trigger: "MANUAL",
      generation: engine2.nextGeneration(),
    }, { debounce: false });
    assert.equal(r1.kind, "success");
    if (r1.kind === "success") assert.equal(r1.response.text, "bar");

    const r2 = await engine2.complete({
      id: "2",
      path: "a.ts",
      language: "typescript",
      prefix: "foo(",
      suffix: ")",
      offset: 4,
      trigger: "MANUAL",
      generation: engine2.nextGeneration(),
    }, { debounce: false });
    assert.equal(r2.kind, "success");
    if (r2.kind === "success") {
      assert.equal(r2.response.cached, true);
      assert.equal(r2.response.text, "bar");
    }
    void engine;
  });

  it("cancels via token", async () => {
    const settings = defaultEngineSettings();
    const engine = new CompletionEngine(
      () => settings,
      undefined,
      undefined,
      () => ({
        complete: async (_r, token) => {
          await new Promise((r) => setTimeout(r, 50));
          token.throwIfCancelled();
          return { text: "late" };
        },
      }),
      async (ms, token) => {
        token.throwIfCancelled();
        await new Promise((r) => setTimeout(r, Math.min(ms, 5)));
      },
    );
    const token = new CancellationToken();
    const p = engine.complete(
      {
        id: "c",
        path: "a.ts",
        language: "typescript",
        prefix: "x",
        suffix: "",
        offset: 1,
        trigger: "MANUAL",
        generation: engine.nextGeneration(),
      },
      { debounce: false, token },
    );
    token.cancel();
    const out = await p;
    assert.equal(out.kind, "cancelled");
  });
});

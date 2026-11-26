import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { SuggestionCache } from "../src/cache.js";
import {
  bodyFor,
  defaultOpenAiRelativePath,
  joinUrl,
  parseText,
} from "../src/httpClient.js";
import { buildPrompt, lruKey } from "../src/promptBuilder.js";
import {
  detectTemplate,
  formatTokenPrompt,
  isRecognized,
  resolveTemplate,
} from "../src/promptTemplate.js";
import {
  postprocess,
  removePrefixOverlap,
  removeSuffixOverlap,
  shouldShowOnlyFirstLine,
} from "../src/suggestionFilter.js";
import { shouldSkip } from "../src/contextualSkip.js";
import { validateSettings } from "../src/settingsValidation.js";
import { CancellationToken, ErrorBackoff } from "../src/errorBackoff.js";
import { IgnoreRules } from "../src/ignoreRules.js";
import { loadLanguageMapFromSpec, normalizeLanguage } from "../src/languageMap.js";
import { CompletionEngine } from "../src/engine.js";
import { defaultEngineSettings } from "../src/types.js";

const contractsRoot = join(dirname(fileURLToPath(import.meta.url)), "../../contracts");
const root = join(contractsRoot, "testdata");

function loadJson<T>(rel: string): T {
  return JSON.parse(readFileSync(join(root, rel), "utf8")) as T;
}

describe("contracts HTTP fixtures", () => {
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

  it("matches url_resolution shared regression fixture", () => {
    const fix = loadJson<{
      relativePathCases: Array<{
        id: string;
        baseUrl: string;
        suffix: string;
        expectedRelativePath: string;
        expectedJoinedUrl: string;
      }>;
      templateResolutionCases: Array<{
        id: string;
        model: string;
        baseUrl: string;
        expectedTemplate: string;
      }>;
    }>("http/url_resolution.json");

    for (const c of fix.relativePathCases) {
      const rel = defaultOpenAiRelativePath(c.baseUrl, c.suffix);
      assert.equal(rel, c.expectedRelativePath, c.id);
      assert.equal(joinUrl(c.baseUrl, rel), c.expectedJoinedUrl, c.id);
    }
    for (const c of fix.templateResolutionCases) {
      assert.equal(
        detectTemplate(c.model, "OPENAI_COMPATIBLE", c.baseUrl),
        c.expectedTemplate,
        c.id,
      );
    }
  });
});

describe("contracts filter / skip / ignore fixtures", () => {
  it("matches postprocess_regression fixture", () => {
    const fix = loadJson<{
      prefixOverlapCases: Array<{ id: string; prefix: string; suggestion: string; expected: string }>;
      suffixOverlapCases: Array<{ id: string; suggestion: string; suffix: string; expected: string }>;
      postprocessCases: Array<{
        id: string;
        raw: string;
        prefix: string;
        suffix: string;
        firstLineOnly: boolean;
        expected: string | null;
      }>;
    }>("filter/postprocess_regression.json");

    for (const c of fix.prefixOverlapCases) {
      assert.equal(removePrefixOverlap(c.suggestion, c.prefix), c.expected, c.id);
    }
    for (const c of fix.suffixOverlapCases) {
      assert.equal(removeSuffixOverlap(c.suggestion, c.suffix), c.expected, c.id);
    }
    for (const c of fix.postprocessCases) {
      assert.equal(postprocess(c.raw, c.prefix, c.suffix, c.firstLineOnly), c.expected, c.id);
    }
  });

  it("matches contextual_skip fixture", () => {
    const fix = loadJson<{
      cases: Array<{
        id: string;
        prefix: string;
        suffix: string;
        language: string;
        expectedSkip: boolean;
      }>;
    }>("skip/contextual_skip.json");

    for (const c of fix.cases) {
      assert.equal(shouldSkip(c.prefix, c.suffix, c.language), c.expectedSkip, c.id);
    }
  });

  it("matches ignore_rules fixture", () => {
    const fix = loadJson<{
      cases: Array<{
        id: string;
        globs: string[];
        respectGitignore: boolean;
        gitignore: string[];
        path: string;
        relativePath: string;
        expectedIgnored: boolean;
      }>;
    }>("ignore/ignore_rules.json");

    for (const c of fix.cases) {
      const rules = new IgnoreRules(c.globs, c.respectGitignore, c.gitignore);
      assert.equal(rules.isIgnored(c.path, c.relativePath), c.expectedIgnored, c.id);
    }
  });
});

describe("contracts prompt budget & PromptBuilder hardening", () => {
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

  it("returns empty string on max <= 0, keeps UTF-16 surrogate pairs valid, wraps FIM comments, and uses SHA-256 lruKey", () => {
    const empty = buildPrompt({
      prefix: "hello world",
      suffix: "goodbye",
      maxPrefixChars: 0,
      maxSuffixChars: -5,
      sendFilePath: false,
    });
    assert.equal(empty.prefix, "");
    assert.equal(empty.suffix, "");

    // Surrogate pair safety: "😀" is 2 UTF-16 code units
    const surr = buildPrompt({
      prefix: "abc😀",
      suffix: "😀xyz",
      maxPrefixChars: 1,
      maxSuffixChars: 1,
      sendFilePath: false,
    });
    assert.equal(surr.prefix, "");
    assert.equal(surr.suffix, "");

    const surr2 = buildPrompt({
      prefix: "abc😀",
      suffix: "😀xyz",
      maxPrefixChars: 2,
      maxSuffixChars: 2,
      sendFilePath: false,
    });
    assert.equal(surr2.prefix, "😀");
    assert.equal(surr2.suffix, "😀");

    // Language-aware comment-wrapped header
    const py = buildPrompt({
      prefix: "x = 1",
      suffix: "",
      maxPrefixChars: 100,
      maxSuffixChars: 100,
      path: "app.py",
      language: "python",
      sendFilePath: true,
    });
    assert.ok(py.prefix.startsWith("# File: app.py\n# Language: python\n"));

    const kt = buildPrompt({
      prefix: "val x = 1",
      suffix: "",
      maxPrefixChars: 100,
      maxSuffixChars: 100,
      path: "Main.kt",
      language: "kotlin",
      sendFilePath: true,
    });
    assert.ok(kt.prefix.startsWith("// File: Main.kt\n// Language: kotlin\n"));

    // SHA-256 lruKey varies with template/baseUrl/temperature/maxTokens/firstLineOnlyWhenMidLine
    const k1 = lruKey("ts", "m", "a", "b", {
      promptTemplate: "QWEN",
      baseUrl: "http://127.0.0.1:11434/v1",
      temperature: 0,
      maxTokens: 128,
      firstLineOnlyWhenMidLine: true,
    });
    const k2 = lruKey("ts", "m", "a", "b", {
      promptTemplate: "CHAT",
      baseUrl: "http://127.0.0.1:11434/v1",
      temperature: 0,
      maxTokens: 128,
      firstLineOnlyWhenMidLine: true,
    });
    assert.equal(k1.length, 64);
    assert.notEqual(k1, k2);
  });
});

describe("contracts schema & specs validity", () => {
  it("parses settings.schema.json with oneOf arrays/strings and new profile fields", () => {
    const schema = JSON.parse(
      readFileSync(join(contractsRoot, "settings.schema.json"), "utf8"),
    ) as {
      properties: Record<string, { oneOf?: unknown[] }>;
      $defs: { ProviderProfile: { properties: Record<string, unknown> } };
    };
    assert.ok(Array.isArray(schema.properties.disabledLanguages?.oneOf));
    assert.ok(Array.isArray(schema.properties.ignoreGlobs?.oneOf));
    assert.ok("extraBodyJson" in schema.$defs.ProviderProfile.properties);
    assert.ok("stopSequences" in schema.$defs.ProviderProfile.properties);
  });

  it("loads language-map.json and normalizes plain_text, shell script, typescript jsx", () => {
    loadLanguageMapFromSpec(join(contractsRoot, "language-map.json"));
    assert.equal(normalizeLanguage("PLAIN_TEXT", "Main.kt"), "kotlin");
    assert.equal(normalizeLanguage("plain_text", "app.ts"), "typescript");
    assert.equal(normalizeLanguage("Shell Script", "deploy.sh"), "shellscript");
    assert.equal(normalizeLanguage("TypeScript JSX", "App.tsx"), "typescriptreact");
    assert.equal(normalizeLanguage("text", "Main.kt"), "kotlin");
    assert.equal(normalizeLanguage("TypeScript", "x.ts"), "typescript");
  });
});

describe("contracts cache", () => {
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
  it("detects model families including qwen3-coder, codegeex, codellama, and o1/o3/o4 boundaries", () => {
    assert.equal(detectTemplate("qwen2.5-coder:7b"), "QWEN");
    assert.equal(detectTemplate("qwen3-coder:30b"), "QWEN");
    assert.equal(detectTemplate("codegeex4"), "QWEN");
    assert.equal(detectTemplate("codellama:7b"), "CODELLAMA");
    assert.equal(detectTemplate("codestral-latest"), "CODESTRAL_API");
    assert.equal(detectTemplate("deepseek-coder-v2"), "DEEPSEEK");
    assert.equal(
      detectTemplate("deepseek-chat", "OPENAI_COMPATIBLE", "https://api.deepseek.com/beta"),
      "CODESTRAL_API",
    );
    assert.equal(detectTemplate("starcoder2-15b"), "STARCODER");
    assert.equal(detectTemplate("gpt-4o"), "CHAT");
    assert.equal(detectTemplate("o3-mini"), "CHAT");
    assert.equal(detectTemplate("demo1-coder"), "QWEN");
    assert.equal(detectTemplate("proto3-coder"), "QWEN");
    assert.equal(isRecognized("o1-mini"), true);
    assert.equal(isRecognized("demo1"), false);
    assert.equal(resolveTemplate("AUTO", "qwen2.5-coder", "OPENAI_COMPATIBLE"), "QWEN");
  });

  it("formats token prompts including CODELLAMA native <PRE>/<SUF>/<MID>", () => {
    assert.equal(
      formatTokenPrompt("QWEN", "a", "b"),
      "<|fim_prefix|>a<|fim_suffix|>b<|fim_middle|>",
    );
    assert.equal(formatTokenPrompt("CODELLAMA", "a", "b"), "<PRE>a<SUF>b<MID>");
  });
});

describe("filter / skip / validation basics", () => {
  it("removes prefix overlap, preserves short operator/digit completions and leading-newline firstLineOnly", () => {
    assert.equal(removePrefixOverlap("foobar", "foo"), "bar");
    assert.equal(postprocess("```ts\nx\n```", "", "", false), "x");
    assert.equal(postprocess("0", "const n = 10", "", false), "0");
    assert.equal(postprocess("+", "i +", "", false), "+");
    assert.equal(postprocess("==", "if (a ==", "", false), "==");
    assert.equal(postprocess("\n    return 1\n    return 2", "if (ok) {", "", true), "\n    return 1");
    assert.equal(postprocess("foo", "println(foo", ")", false), null);
    assert.equal(postprocess("bar", "const x = bar  ", "", false), null);
    assert.equal(shouldShowOnlyFirstLine("  const x = ", "a\nb"), true);
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
});

describe("error backoff", () => {
  it("blocks on fatal and clears on success", () => {
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
    const client = {
      complete: async () => ({ text: "bar" }),
    };
    const engine2 = new CompletionEngine(() => settings, undefined, undefined, () => client);
    const r1 = await engine2.complete(
      {
        id: "1",
        path: "a.ts",
        language: "typescript",
        prefix: "foo(",
        suffix: ")",
        offset: 4,
        trigger: "MANUAL",
        generation: engine2.nextGeneration(),
      },
      { debounce: false },
    );
    assert.equal(r1.kind, "success");
    if (r1.kind === "success") assert.equal(r1.response.text, "bar");

    const r2 = await engine2.complete(
      {
        id: "2",
        path: "a.ts",
        language: "typescript",
        prefix: "foo(",
        suffix: ")",
        offset: 4,
        trigger: "MANUAL",
        generation: engine2.nextGeneration(),
      },
      { debounce: false },
    );
    assert.equal(r2.kind, "success");
    if (r2.kind === "success") {
      assert.equal(r2.response.cached, true);
      assert.equal(r2.response.text, "bar");
    }
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

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyExtraHeaders,
  bodyFor,
  defaultOpenAiRelativePath,
  HttpCompletionClient,
  joinUrl,
  pathFor,
  redactSecrets,
  redactUrl,
  validateBaseUrl,
  type HttpLogEvent,
} from "../src/httpClient.js";
import { CancellationToken, CancelledError, HttpStatusError } from "../src/errorBackoff.js";
import type { ProviderConfig } from "../src/types.js";

function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function makeConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    kind: "OPENAI_COMPATIBLE",
    baseUrl: "http://127.0.0.1:11434/v1",
    apiKey: "",
    model: "qwen2.5-coder:7b",
    promptTemplate: "CHAT",
    timeoutMs: 1000,
    settingsTimeoutMs: 2000,
    stream: false,
    allowRemote: true,
    ...overrides,
  };
}

describe("HttpCompletionClient timeout vs cancellation", () => {
  it("reports timeout as Error (NOT CancelledError) and emits failure log", async () => {
    const logs: HttpLogEvent[] = [];
    const fetchMock: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("This operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });

    const client = new HttpCompletionClient(
      makeConfig({ timeoutMs: 500 }),
      "completion",
      (e) => logs.push(e),
      fetchMock,
    );

    await assert.rejects(
      () =>
        client.complete(
          { model: "m", prefix: "a", suffix: "", maxTokens: 16, temperature: 0 },
          new CancellationToken(),
          500,
        ),
      (err: unknown) => {
        assert.ok(!(err instanceof CancelledError), "timeout must NOT be CancelledError");
        assert.ok(err instanceof Error);
        assert.match(err.message, /timed out after 500ms/);
        return true;
      },
    );
    const failLog = logs.find((l) => l.level === "WARN" || l.level === "ERROR");
    assert.ok(failLog, "timeout must emit failure log");
    assert.match(failLog!.error ?? "", /timed out after 500ms/);
  });

  it("throws CancelledError when user token is cancelled", async () => {
    const token = new CancellationToken();
    const fetchMock: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
        });
        setTimeout(() => token.cancel(), 10);
      });

    const client = new HttpCompletionClient(makeConfig({ timeoutMs: 5000 }), "completion", () => {}, fetchMock);

    await assert.rejects(
      () =>
        client.complete(
          { model: "m", prefix: "a", suffix: "", maxTokens: 16, temperature: 0 },
          token,
          5000,
        ),
      CancelledError,
    );
  });
});

describe("HttpCompletionClient streaming SSE", () => {
  it("preserves whitespace/indent/newline tokens, flushes trailing buffer without newline, and captures usage", async () => {
    const fetchMock: typeof fetch = async () =>
      sseResponse([
        'data: {"choices":[{"delta":{"content":"    "}}]}\n',
        'data: {"choices":[{"delta":{"content":"return"}}]}\n',
        'data: {"choices":[{"delta":{"content":" "}}]}\n',
        'data: {"choices":[{"delta":{"content":"a + b\\n"}}]}\n',
        // Final frame without trailing \n
        'data: {"choices":[{"delta":{"content":"    pass"}}],"usage":{"prompt_tokens":10,"completion_tokens":5}}',
      ]);

    const client = new HttpCompletionClient(makeConfig({ stream: true }), "completion", () => {}, fetchMock);
    const resp = await client.complete(
      { model: "m", prefix: "def f():\n", suffix: "", maxTokens: 32, temperature: 0, stream: true },
      new CancellationToken(),
    );
    assert.equal(resp.text, "    return a + b\n    pass");
    assert.deepEqual(resp.usage, { inputTokens: 10, outputTokens: 5 });
  });

  it("returns immediately on data: [DONE] without reading further chunks", async () => {
    let cancelled = false;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":"ok"}}]}\ndata: [DONE]\n'),
        );
        // Intentionally never close the stream: if readStream waited for EOF or another read, this would hang.
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchMock: typeof fetch = async () => new Response(stream, { status: 200 });
    const client = new HttpCompletionClient(makeConfig({ stream: true }), "completion", () => {}, fetchMock);
    const resp = await client.complete(
      { model: "m", prefix: "x", suffix: "", maxTokens: 32, temperature: 0, stream: true },
      new CancellationToken(),
    );
    assert.equal(resp.text, "ok");
    assert.equal(cancelled, true);
  });

  it("early-stops on newline after non-empty content when stopAtNewline=true and aborts request", async () => {
    let aborted = false;
    let cancelled = false;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"42"}}]}\n'));
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"\\nconst y = 2"}}]}\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchMock: typeof fetch = async (_url, init) => {
      init?.signal?.addEventListener("abort", () => {
        aborted = true;
      });
      return new Response(stream, { status: 200 });
    };

    const client = new HttpCompletionClient(makeConfig({ stream: true }), "completion", () => {}, fetchMock);
    const resp = await client.complete(
      {
        model: "m",
        prefix: "const x = ",
        suffix: "",
        maxTokens: 64,
        temperature: 0,
        stream: true,
        stopAtNewline: true,
      },
      new CancellationToken(),
    );
    assert.equal(resp.text, "42");
    assert.equal(aborted, true);
    assert.equal(cancelled, true);
  });

  it("early-stops on single chunk containing leading newline followed by multiple lines", async () => {
    let aborted = false;
    let cancelled = false;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":"\\nfoo\\nbar"}}]}\n'),
        );
        // Never close stream to prove early-stop returns immediately.
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchMock: typeof fetch = async (_url, init) => {
      init?.signal?.addEventListener("abort", () => {
        aborted = true;
      });
      return new Response(stream, { status: 200 });
    };

    const client = new HttpCompletionClient(makeConfig({ stream: true }), "completion", () => {}, fetchMock);
    const resp = await client.complete(
      {
        model: "m",
        prefix: "if (ok) {",
        suffix: "",
        maxTokens: 64,
        temperature: 0,
        stream: true,
        stopAtNewline: true,
      },
      new CancellationToken(),
    );
    assert.equal(resp.text, "\nfoo");
    assert.equal(aborted, true);
    assert.equal(cancelled, true);
  });
});

describe("URL resolution, DeepSeek Beta FIM, extraBodyJson & stopSequences", () => {
  it("prepends /v1 only when baseUrl path is empty or /", () => {
    assert.equal(defaultOpenAiRelativePath("http://127.0.0.1:11434", "/chat/completions"), "/v1/chat/completions");
    assert.equal(defaultOpenAiRelativePath("http://127.0.0.1:11434/", "/chat/completions"), "/v1/chat/completions");
    assert.equal(defaultOpenAiRelativePath("http://127.0.0.1:11434/v1", "/chat/completions"), "/chat/completions");
    assert.equal(defaultOpenAiRelativePath("https://api.deepseek.com/beta", "/completions"), "/completions");
    assert.equal(defaultOpenAiRelativePath("https://api.example.com/v2", "/chat/completions"), "/chat/completions");
  });

  it("resolves DeepSeek Beta FIM path to /completions and trims custom overrides", () => {
    assert.equal(
      pathFor("CODESTRAL_API", makeConfig({ baseUrl: "https://api.deepseek.com/beta", fimPath: "" })),
      "/completions",
    );
    assert.equal(
      joinUrl(
        "https://api.deepseek.com/beta",
        pathFor("CODESTRAL_API", makeConfig({ baseUrl: "https://api.deepseek.com/beta", fimPath: "" })),
      ),
      "https://api.deepseek.com/beta/completions",
    );
    assert.equal(
      pathFor("CHAT", makeConfig({ chatPath: "  /custom/chat  " })),
      "/custom/chat",
    );
  });

  it("preserves query parameters in joinUrl", () => {
    assert.equal(
      joinUrl(
        "https://my.openai.azure.com/openai/deployments/d1?api-version=2024-02-01",
        "/chat/completions",
      ),
      "https://my.openai.azure.com/openai/deployments/d1/chat/completions?api-version=2024-02-01",
    );
  });

  it("merges extraBodyJson without overriding protected keys and appends stopSequences", () => {
    const raw = bodyFor(
      "QWEN",
      { model: "qwen2.5-coder:7b", prefix: "a", suffix: "b", maxTokens: 32, temperature: 0 },
      makeConfig({
        promptTemplate: "QWEN",
        extraBodyJson: JSON.stringify({
          model: "evil-override",
          prompt: "evil",
          suffix: "evil",
          messages: [],
          stream: true,
          top_p: 0.9,
          seed: 42,
        }),
        stopSequences: "###\n\\n\\n",
      }),
      false,
    );
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    assert.equal(parsed.model, "qwen2.5-coder:7b");
    assert.equal(parsed.stream, false);
    assert.equal(parsed.messages, undefined);
    assert.ok(String(parsed.prompt).startsWith("<|fim_prefix|>"));
    assert.equal(parsed.top_p, 0.9);
    assert.equal(parsed.seed, 42);
    const stop = parsed.stop as string[];
    assert.ok(stop.includes("<|endoftext|>"));
    assert.ok(stop.includes("###"));
    assert.ok(stop.includes("\n\n"));
  });

  it("accepts IPv6 localhost [::1] and rejects non-http schemes and userInfo", () => {
    assert.doesNotThrow(() => validateBaseUrl("http://[::1]:11434/v1", false));
    assert.throws(() => validateBaseUrl("file:///etc/passwd", true), /scheme/i);
    assert.throws(() => validateBaseUrl("https://user:pass@api.example.com/v1", true), /user-info/i);
  });
});

describe("Extra headers security & secret redaction", () => {
  it("blocks reserved, sensitive, CRLF, and non-object extraHeadersJson and keeps auth intact", async () => {
    let capturedHeaders: Record<string, string> = {};
    const fetchMock: typeof fetch = async (_url, init) => {
      capturedHeaders = (init?.headers as Record<string, string>) ?? {};
      return new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }), {
        status: 200,
      });
    };

    const client = new HttpCompletionClient(
      makeConfig({
        apiKey: "sk-real-secret-token-9999",
        extraHeadersJson: JSON.stringify({
          Authorization: "Bearer evil",
          "Content-Type": "text/plain",
          Accept: "text/plain",
          Host: "evil.example",
          "x-goog-api-key": "stolen",
          "anthropic-api-key": "stolen",
          "openai-api-key": "stolen",
          api_key: "stolen",
          "ocp-apim-subscription-key": "stolen",
          "private-token": "stolen",
          "X-Custom-Session": "stolen",
          "X-Bad\r\nInjected": "val",
          "X-Title": "AutoComplete",
          "HTTP-Referer": "https://example.com",
        }),
      }),
      "completion",
      () => {},
      fetchMock,
    );

    await client.complete(
      { model: "m", prefix: "a", suffix: "", maxTokens: 16, temperature: 0 },
      new CancellationToken(),
    );

    assert.equal(capturedHeaders.Authorization, "Bearer sk-real-secret-token-9999");
    assert.equal(capturedHeaders["Content-Type"], "application/json");
    assert.equal(capturedHeaders.Accept, "application/json");
    assert.equal(capturedHeaders.Host, undefined);
    assert.equal(capturedHeaders["x-goog-api-key"], undefined);
    assert.equal(capturedHeaders["anthropic-api-key"], undefined);
    assert.equal(capturedHeaders["openai-api-key"], undefined);
    assert.equal(capturedHeaders.api_key, undefined);
    assert.equal(capturedHeaders["ocp-apim-subscription-key"], undefined);
    assert.equal(capturedHeaders["private-token"], undefined);
    assert.equal(capturedHeaders["X-Custom-Session"], undefined);
    assert.equal(capturedHeaders["X-Title"], "AutoComplete");
    assert.equal(capturedHeaders["HTTP-Referer"], "https://example.com");
  });

  it("ignores arrays and non-objects in applyExtraHeaders", () => {
    const headers: Record<string, string> = {};
    applyExtraHeaders(headers, '["a","b"]');
    applyExtraHeaders(headers, "123");
    applyExtraHeaders(headers, '"str"');
    assert.deepEqual(headers, {});
  });

  it("redacts userInfo, sensitive query params, Bearer tokens, and known apiKey in logs and errors", async () => {
    assert.equal(
      redactUrl("https://user:secret@api.example.com/v1?api_key=abc123&api-version=2024"),
      "https://api.example.com/v1?api_key=***&api-version=2024",
    );
    assert.equal(
      redactSecrets("Authorization Bearer sk-test-123456 failed for key=mySecretKey", "mySecretKey"),
      "Authorization Bearer [REDACTED] failed for key=[REDACTED]",
    );

    const logs: HttpLogEvent[] = [];
    const secret = "sk-super-secret-value-42";
    const fetchMock: typeof fetch = async () =>
      new Response(`invalid token Bearer ${secret} echoed ${secret}`, { status: 401 });

    const client = new HttpCompletionClient(
      makeConfig({
        baseUrl: "https://api.example.com/v1?api_key=querySecret99&api-version=1",
        apiKey: secret,
      }),
      "completion",
      (e) => logs.push(e),
      fetchMock,
    );

    await assert.rejects(
      () =>
        client.complete(
          { model: "m", prefix: "a", suffix: "", maxTokens: 16, temperature: 0 },
          new CancellationToken(),
        ),
      (err: unknown) => {
        assert.ok(err instanceof HttpStatusError);
        assert.equal(err.status, 401);
        assert.ok(!err.message.includes(secret));
        assert.ok(!err.message.includes("querySecret99"));
        return true;
      },
    );
    for (const l of logs) {
      assert.ok(!(l.url ?? "").includes("querySecret99"));
      assert.ok(!(l.error ?? "").includes(secret));
    }
  });
});

describe("listModels & probeTemplate", () => {
  it("parses models with rich contextLength extraction and falls back on 404", async () => {
    const requestedUrls: string[] = [];
    const fetchMock: typeof fetch = async (url) => {
      const s = String(url);
      requestedUrls.push(s);
      if (s.endsWith("/v1/models")) {
        return new Response("not found", { status: 404 });
      }
      return new Response(
        JSON.stringify({
          data: [
            { id: "model-b", meta: { n_ctx_train: 32768 } },
            { id: "model-a", context_window: 131072 },
            { id: "model-c", max_tokens: 128 }, // < 512 ignored
          ],
        }),
        { status: 200 },
      );
    };

    const client = new HttpCompletionClient(
      makeConfig({ baseUrl: "http://127.0.0.1:11434" }),
      "list_models",
      () => {},
      fetchMock,
    );
    const models = await client.listModels();
    assert.deepEqual(requestedUrls, [
      "http://127.0.0.1:11434/v1/models",
      "http://127.0.0.1:11434/models",
    ]);
    assert.deepEqual(models, [
      { id: "model-a", contextLength: 131072 },
      { id: "model-b", contextLength: 32768 },
      { id: "model-c", contextLength: null },
    ]);
  });

  it("returns resolvedUrl, resolvedPath, and httpStatus on probeTemplate", async () => {
    const fetchMock: typeof fetch = async () =>
      new Response(JSON.stringify({ choices: [{ text: "return a + b" }] }), { status: 200 });
    const client = new HttpCompletionClient(
      makeConfig({ baseUrl: "https://api.deepseek.com/beta", model: "deepseek-chat", promptTemplate: "AUTO" }),
      "template_probe",
      () => {},
      fetchMock,
    );
    const res = await client.probeTemplate("AUTO");
    assert.equal(res.status, "SUCCESS");
    assert.equal(res.template, "CODESTRAL_API");
    assert.equal(res.httpStatus, 200);
    assert.equal(res.resolvedPath, "/completions");
    assert.equal(res.resolvedUrl, "https://api.deepseek.com/beta/completions");
  });

  it("honors config.maxTokens in probes, parses content arrays/Responses API, and diagnoses reasoning empty responses", async () => {
    let seenMaxTokens = 0;
    const partsFetch: typeof fetch = async (_url, init) => {
      const parsed = JSON.parse(String(init?.body ?? "{}")) as { max_tokens?: number };
      seenMaxTokens = parsed.max_tokens ?? 0;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: [
                  { type: "text", text: "return " },
                  { type: "output_text", text: "a + b" },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      );
    };
    const partsClient = new HttpCompletionClient(
      makeConfig({ promptTemplate: "CHAT", maxTokens: 256 }),
      "template_probe",
      () => {},
      partsFetch,
    );
    const ok = await partsClient.probeTemplate("CHAT");
    assert.equal(ok.status, "SUCCESS");
    assert.equal(ok.preview, "return a + b");
    assert.equal(seenMaxTokens, 256);

    const reasoningEmptyFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "length",
              message: { content: "", reasoning_content: "thinking..." },
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 128,
            completion_tokens_details: { reasoning_tokens: 128 },
          },
        }),
        { status: 200 },
      );
    const emptyClient = new HttpCompletionClient(
      makeConfig({ promptTemplate: "CHAT", maxTokens: 128 }),
      "template_probe",
      () => {},
      reasoningEmptyFetch,
    );
    const empty = await emptyClient.probeTemplate("CHAT");
    assert.equal(empty.status, "EMPTY");
    assert.match(empty.error ?? "", /reasoning_tokens=128/);
    assert.match(empty.error ?? "", /maxTokens/);

    // COMPLETION_PROMPT must not inherit a chat endpoint accidentally entered in fimPath.
    assert.equal(
      pathFor("QWEN", makeConfig({ baseUrl: "http://127.0.0.1:11434/v1", fimPath: "/chat/completions" })),
      "/completions",
    );
  });

  it("supports native OpenAI RESPONSES template (blocking + SSE streaming + nested reasoning.effort + clean 404)", async () => {
    let seenUrl = "";
    let seenBody: Record<string, unknown> = {};
    const fetchMock: typeof fetch = async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      if (seenBody.stream) {
        const sse = [
          `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "return " })}`,
          `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "a + b" })}`,
          `data: ${JSON.stringify({ type: "response.completed", response: { status: "completed", usage: { input_tokens: 10, output_tokens: 4 } } })}`,
          "",
        ].join("\n\n");
        return new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode(sse));
              c.close();
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        );
      }
      return new Response(
        JSON.stringify({
          status: "completed",
          output: [{ type: "message", content: [{ type: "output_text", text: "return a + b" }] }],
          usage: { input_tokens: 10, output_tokens: 4 },
        }),
        { status: 200 },
      );
    };

    const cfg = makeConfig({
      baseUrl: "http://127.0.0.1:8317/v1",
      model: "gpt-6-luna",
      promptTemplate: "RESPONSES",
      maxTokens: 256,
      temperature: 0,
      extraBodyJson: JSON.stringify({ reasoning: { effort: "none" }, input: "hijack", stop: ["\n\n"] }),
      stopSequences: "###",
    });

    const blocking = await new HttpCompletionClient(cfg, "template_probe", () => {}, fetchMock).probeTemplate(
      "RESPONSES",
    );
    assert.equal(blocking.status, "SUCCESS");
    assert.equal(blocking.preview, "return a + b");
    assert.equal(seenUrl, "http://127.0.0.1:8317/v1/responses");
    assert.equal(seenBody.max_output_tokens, 256);
    assert.equal(seenBody.store, false);
    assert.deepEqual(seenBody.reasoning, { effort: "none" });
    assert.ok(typeof seenBody.instructions === "string" && seenBody.instructions.includes("<|cursor|>"));
    assert.ok(
      typeof seenBody.input === "string" &&
        seenBody.input.includes("<|cursor|>") &&
        seenBody.input.includes("Example 1:") &&
        !seenBody.input.includes("hijack"),
    );
    assert.equal(seenBody.stop, undefined);
    assert.equal(seenBody.temperature, undefined);

    const streaming = await new HttpCompletionClient(
      { ...cfg, stream: true },
      "template_probe",
      () => {},
      fetchMock,
    ).probeTemplate("RESPONSES");
    assert.equal(streaming.status, "SUCCESS");
    assert.equal(streaming.preview, "return a + b");

    const empty404Fetch: typeof fetch = async () => new Response("", { status: 404 });
    const notFound = await new HttpCompletionClient(
      { ...cfg, promptTemplate: "CODESTRAL_API", stream: true },
      "template_probe",
      () => {},
      empty404Fetch,
    ).probeTemplate("CODESTRAL_API");
    assert.equal(notFound.status, "FAILED");
    assert.equal(notFound.httpStatus, 404);
    assert.match(notFound.error ?? "", /Not Found/);
  });
});

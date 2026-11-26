import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CompletionEngine } from "../src/engine.js";
import { CancellationToken, ErrorBackoff, HttpStatusError } from "../src/errorBackoff.js";
import { defaultEngineSettings, type CompletionOutcome, type ProviderRequest } from "../src/types.js";

describe("CompletionEngine backoff, reloadCaches, manual probe & forceRefresh", () => {
  it("resets fatal backoff on reloadCaches, resetBackoff, and clearCaches", async () => {
    const settings = defaultEngineSettings();
    let fail = true;
    const engine = new CompletionEngine(
      () => settings,
      undefined,
      undefined,
      () => ({
        complete: async () => {
          if (fail) throw new HttpStatusError(401, "Unauthorized");
          return { text: "ok" };
        },
      }),
    );

    const r1 = await engine.complete(
      {
        id: "1",
        path: "a.ts",
        language: "typescript",
        prefix: "const x = ",
        suffix: "",
        offset: 10,
        trigger: "AUTO",
        generation: engine.nextGeneration("a.ts"),
      },
      { debounce: false },
    );
    assert.equal(r1.kind, "failed");
    assert.equal(engine.backoff.blocked(), true);
    assert.equal(engine.sessionStats().backoffFatal, true);

    // AUTO trigger is blocked while fatal backoff is active
    const r2 = await engine.complete(
      {
        id: "2",
        path: "a.ts",
        language: "typescript",
        prefix: "const x = ",
        suffix: "",
        offset: 10,
        trigger: "AUTO",
        generation: engine.nextGeneration("a.ts"),
      },
      { debounce: false },
    );
    assert.equal(r2.kind, "skipped");

    // reloadCaches clears backoff so AUTO works again
    fail = false;
    engine.reloadCaches();
    assert.equal(engine.backoff.blocked(), false);

    const r3 = await engine.complete(
      {
        id: "3",
        path: "a.ts",
        language: "typescript",
        prefix: "const x = ",
        suffix: "",
        offset: 10,
        trigger: "AUTO",
        generation: engine.nextGeneration("a.ts"),
      },
      { debounce: false },
    );
    assert.equal(r3.kind, "success");

    // clearCaches clears caches and resets backoff
    engine.backoff.failure(new HttpStatusError(403, "Forbidden"), 403);
    assert.equal(engine.backoff.blocked(), true);
    engine.clearCaches();
    assert.equal(engine.backoff.blocked(), false);

    // resetBackoff resets backoff directly
    engine.backoff.failure(new HttpStatusError(401, "Unauthorized"), 401);
    engine.resetBackoff();
    assert.equal(engine.backoff.blocked(), false);
  });

  it("allows Trigger.MANUAL to probe through fatal backoff and clears backoff on success", async () => {
    const settings = defaultEngineSettings();
    let calls = 0;
    const engine = new CompletionEngine(
      () => settings,
      undefined,
      undefined,
      () => ({
        complete: async () => {
          calls++;
          if (calls === 1) throw new HttpStatusError(401, "bad key");
          return { text: "42" };
        },
      }),
    );

    const failOut = await engine.complete(
      {
        id: "1",
        path: "a.ts",
        language: "typescript",
        prefix: "const x = ",
        suffix: "",
        offset: 10,
        trigger: "AUTO",
        generation: engine.nextGeneration("a.ts"),
      },
      { debounce: false },
    );
    assert.equal(failOut.kind, "failed");
    assert.equal(engine.backoff.blocked(), true);

    const manualOut = await engine.complete(
      {
        id: "2",
        path: "a.ts",
        language: "typescript",
        prefix: "const x = ",
        suffix: "",
        offset: 10,
        trigger: "MANUAL",
        generation: engine.nextGeneration("a.ts"),
      },
      { debounce: false },
    );
    assert.equal(manualOut.kind, "success");
    assert.equal(engine.backoff.blocked(), false);
  });

  it("allows AUTO periodic probe via backoff.shouldProbe() after probe interval elapses", async () => {
    let now = 1_000_000;
    const backoff = new ErrorBackoff(2_000, 120_000, 5, 300_000, 300_000, () => now);
    const settings = defaultEngineSettings();
    let fail = true;
    const engine = new CompletionEngine(
      () => settings,
      undefined,
      undefined,
      () => ({
        complete: async () => {
          if (fail) throw new HttpStatusError(401, "expired");
          return { text: "recovered" };
        },
      }),
      undefined,
      undefined,
      backoff,
    );

    const r1 = await engine.complete(
      {
        id: "1",
        path: "a.ts",
        language: "typescript",
        prefix: "const x = ",
        suffix: "",
        offset: 10,
        trigger: "AUTO",
        generation: engine.nextGeneration("a.ts"),
      },
      { debounce: false },
    );
    assert.equal(r1.kind, "failed");
    assert.equal(engine.backoff.blocked(), true);

    // Still within probe interval -> AUTO skipped
    now += 60_000;
    fail = false;
    const r2 = await engine.complete(
      {
        id: "2",
        path: "a.ts",
        language: "typescript",
        prefix: "const x = ",
        suffix: "",
        offset: 10,
        trigger: "AUTO",
        generation: engine.nextGeneration("a.ts"),
      },
      { debounce: false },
    );
    assert.equal(r2.kind, "skipped");

    // After 5-minute probe interval -> AUTO allowed through and clears fatal backoff
    now += 300_000;
    const r3 = await engine.complete(
      {
        id: "3",
        path: "a.ts",
        language: "typescript",
        prefix: "const x = ",
        suffix: "",
        offset: 10,
        trigger: "AUTO",
        generation: engine.nextGeneration("a.ts"),
      },
      { debounce: false },
    );
    assert.equal(r3.kind, "success");
    assert.equal(engine.backoff.blocked(), false);
  });

  it("bypasses history and LRU caches when forceRefresh=true", async () => {
    const settings = defaultEngineSettings();
    let counter = 0;
    const engine = new CompletionEngine(
      () => settings,
      undefined,
      undefined,
      () => ({
        complete: async () => ({ text: `v${++counter}` }),
      }),
    );

    const req = () => ({
      id: engine.newRequestId(),
      path: "a.ts",
      language: "typescript",
      prefix: "const x = ",
      suffix: "",
      offset: 10,
      trigger: "MANUAL" as const,
      generation: engine.nextGeneration("a.ts"),
    });

    const first = await engine.complete(req(), { debounce: false });
    assert.equal(first.kind, "success");
    if (first.kind === "success") assert.equal(first.response.text, "v1");

    const cached = await engine.complete(req(), { debounce: false });
    assert.equal(cached.kind, "success");
    if (cached.kind === "success") {
      assert.equal(cached.response.cached, true);
      assert.equal(cached.response.text, "v1");
    }

    const refreshed = await engine.complete({ ...req(), forceRefresh: true }, { debounce: false });
    assert.equal(refreshed.kind, "success");
    if (refreshed.kind === "success") {
      assert.equal(refreshed.response.cached, false);
      assert.equal(refreshed.response.text, "v2");
    }
    assert.equal(counter, 2);
  });
});

describe("CompletionEngine concurrency, per-scope generation, debounce & LRU order", () => {
  it("does not kill unrelated scope when re-triggering same scope at maxInFlight=2", async () => {
    const settings = defaultEngineSettings({ maxInFlight: 2 });
    const resolvers = new Map<string, (v: string) => void>();
    const engine = new CompletionEngine(
      () => settings,
      undefined,
      undefined,
      () => ({
        complete: (req, token) =>
          new Promise((resolve, reject) => {
            token.onCancel(() => reject(new Error("cancel")));
            resolvers.set(req.path ?? "", (text) => resolve({ text }));
          }),
      }),
    );

    const outcomes: Record<string, CompletionOutcome> = {};
    const wait = (key: string) =>
      new Promise<void>((res) => {
        const check = (o: CompletionOutcome) => {
          outcomes[key] = o;
          res();
        };
        if (key === "a1") {
          engine.completeAsync(
            {
              id: "a1",
              path: "a.ts",
              language: "typescript",
              prefix: "const a = ",
              suffix: "",
              offset: 10,
              trigger: "MANUAL",
              generation: engine.nextGeneration("a.ts"),
            },
            check,
            false,
          );
        } else if (key === "b1") {
          engine.completeAsync(
            {
              id: "b1",
              path: "b.ts",
              language: "typescript",
              prefix: "const b = ",
              suffix: "",
              offset: 10,
              trigger: "MANUAL",
              generation: engine.nextGeneration("b.ts"),
            },
            check,
            false,
          );
        } else if (key === "a2") {
          engine.completeAsync(
            {
              id: "a2",
              path: "a.ts",
              language: "typescript",
              prefix: "const a2 = ",
              suffix: "",
              offset: 11,
              trigger: "MANUAL",
              generation: engine.nextGeneration("a.ts"),
            },
            check,
            false,
          );
        }
      });

    const pA1 = wait("a1");
    const pB1 = wait("b1");
    // Wait a tick for a1 and b1 to reach client.complete
    await new Promise((r) => setTimeout(r, 10));
    // Re-trigger scope a.ts -> must cancel a1, MUST NOT kill b1!
    const pA2 = wait("a2");
    await new Promise((r) => setTimeout(r, 10));

    resolvers.get("b.ts")?.("B_OK");
    resolvers.get("a.ts")?.("A2_OK");
    await Promise.all([pA1, pB1, pA2]);

    assert.equal(outcomes.a1?.kind, "cancelled");
    assert.equal(outcomes.b1?.kind, "success");
    if (outcomes.b1?.kind === "success") assert.equal(outcomes.b1.response.text, "B_OK");
    assert.equal(outcomes.a2?.kind, "success");
    if (outcomes.a2?.kind === "success") assert.equal(outcomes.a2.response.text, "A2_OK");
  });

  it("checks LRU cache before debounce sleep", async () => {
    const settings = defaultEngineSettings({ debounceMinMs: 200, debounceInitialMs: 300, debounceMaxMs: 500 });
    let sleepCalls = 0;
    const engine = new CompletionEngine(
      () => settings,
      undefined,
      undefined,
      () => ({
        complete: async () => ({ text: "42" }),
      }),
      async (_ms, _token) => {
        sleepCalls++;
      },
    );

    // Seed LRU from file a.ts
    await engine.complete(
      {
        id: "1",
        path: "a.ts",
        language: "typescript",
        prefix: "const x = ",
        suffix: "",
        offset: 10,
        trigger: "AUTO",
        generation: engine.nextGeneration("a.ts"),
      },
      { debounce: true },
    );
    assert.equal(sleepCalls, 1);

    // Same prompt in different scope (misses history, hits LRU!) with sendFilePath=false
    const noPathSettings = { ...settings, sendFilePath: false };
    const engine2 = new CompletionEngine(
      () => noPathSettings,
      undefined,
      undefined,
      () => ({
        complete: async () => ({ text: "42" }),
      }),
      async (_ms, _token) => {
        sleepCalls++;
      },
    );
    sleepCalls = 0;
    await engine2.complete(
      {
        id: "1",
        path: "a.ts",
        language: "typescript",
        prefix: "const x = ",
        suffix: "",
        offset: 10,
        trigger: "AUTO",
        generation: engine2.nextGeneration("a.ts"),
      },
      { debounce: true },
    );
    assert.equal(sleepCalls, 1);

    const hit = await engine2.complete(
      {
        id: "2",
        path: "b.ts",
        language: "typescript",
        prefix: "const x = ",
        suffix: "",
        offset: 10,
        trigger: "AUTO",
        generation: engine2.nextGeneration("b.ts"),
      },
      { debounce: true },
    );
    assert.equal(hit.kind, "success");
    if (hit.kind === "success") assert.equal(hit.response.cached, true);
    assert.equal(sleepCalls, 1, "LRU hit must not run debounce sleeper");
  });

  it("supports debounceMinMs=0, inverted debounce bounds, empty ignoreGlobs, stopAtNewline, and SessionStats", async () => {
    const settings = defaultEngineSettings({
      debounceMinMs: 0,
      debounceInitialMs: 0,
      debounceMaxMs: 0,
      ignoreGlobs: [],
      respectGitignore: false,
      stream: true,
      firstLineOnlyWhenMidLine: true,
    });
    let capturedReq: ProviderRequest | null = null;
    let sleepCalls = 0;
    const engine = new CompletionEngine(
      () => settings,
      undefined,
      undefined,
      () => ({
        complete: async (req) => {
          capturedReq = req;
          return { text: "123" };
        },
      }),
      async () => {
        sleepCalls++;
      },
    );

    // Path inside build/ MUST NOT be ignored when caller explicitly passed ignoreGlobs: []
    const out = await engine.complete(
      {
        id: "1",
        path: "/proj/build/file.ts",
        language: "typescript",
        prefix: "const n = ",
        suffix: "",
        offset: 10,
        trigger: "AUTO",
        generation: engine.nextGeneration("/proj/build/file.ts"),
      },
      { debounce: true },
    );
    assert.equal(out.kind, "success");
    assert.equal(sleepCalls, 0, "delay=0 should not sleep");
    assert.equal(capturedReq?.stopAtNewline, true);

    engine.recordAccepted();
    const stats = engine.sessionStats();
    assert.equal(stats.totalRequests, 1);
    assert.equal(stats.cacheHits, 0);
    assert.equal(stats.accepted, 1);
    assert.equal(stats.failed, 0);
    assert.equal(stats.cancelled, 0);
    assert.equal(stats.currentDebounceMs, 0);
    assert.equal(stats.backoffBlocked, false);
    assert.equal(stats.backoffFatal, false);
    assert.ok(stats.p50LatencyMs !== null);
    assert.ok(stats.p95LatencyMs !== null);

    // Inverted bounds (min > max) do not crash
    const inverted = defaultEngineSettings({
      debounceMinMs: 800,
      debounceInitialMs: 500,
      debounceMaxMs: 200,
    });
    const engineInv = new CompletionEngine(() => inverted);
    assert.ok(engineInv.sessionStats().currentDebounceMs >= 200);
    assert.ok(engineInv.sessionStats().currentDebounceMs <= 800);
  });

  it("cancelAll invalidates all per-scope and global generations", async () => {
    const settings = defaultEngineSettings();
    const engine = new CompletionEngine(
      () => settings,
      undefined,
      undefined,
      () => ({
        complete: async (_req, token: CancellationToken) => {
          await new Promise((r) => setTimeout(r, 20));
          token.throwIfCancelled();
          return { text: "late" };
        },
      }),
    );
    const g = engine.nextGeneration("a.ts");
    const p = engine.complete(
      {
        id: "1",
        path: "a.ts",
        language: "typescript",
        prefix: "const x = ",
        suffix: "",
        offset: 10,
        trigger: "MANUAL",
        generation: g,
      },
      { debounce: false },
    );
    engine.cancelAll();
    const out = await p;
    assert.equal(out.kind, "cancelled");
  });
});

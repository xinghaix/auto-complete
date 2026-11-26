import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  CompletionEngine,
  defaultEngineSettings,
  LogBuffer,
  type EngineSettings,
  type ProviderRequest,
} from "@auto-complete/core-ts";
import { AutoCompleteInlineProvider, INTERNAL_ACCEPTED_COMMAND } from "./provider.js";
import { VsCodeProjectContext } from "../project/context.js";
import {
  createMockVscodeEnv,
  makeMockDocument,
  type MockVscodeEnv,
} from "../testHelpers/mockVscode.js";

function makeToken(cancelled = false) {
  let isCancelled = cancelled;
  const listeners = new Set<() => void>();
  return {
    get isCancellationRequested() {
      return isCancelled;
    },
    onCancellationRequested(cb: () => void) {
      listeners.add(cb);
      return {
        dispose: () => listeners.delete(cb),
      };
    },
    cancel() {
      isCancelled = true;
      for (const l of listeners) l();
    },
  } as unknown as import("vscode").CancellationToken & { cancel(): void };
}

describe("AutoCompleteInlineProvider", () => {
  let env: MockVscodeEnv;

  beforeEach(() => {
    env = createMockVscodeEnv();
    env.install();
  });

  afterEach(() => {
    env.restore();
  });

  it("pre-gates disabled, autoTrigger=false, disabled language, ignored path, and oversized files before engine", async () => {
    let clientCalls = 0;
    let settings: EngineSettings = defaultEngineSettings({
      debounceMinMs: 0,
      debounceInitialMs: 0,
      debounceMaxMs: 0,
      maxFileSizeKb: 1,
      disabledLanguages: new Set(["markdown"]),
      ignoreGlobs: ["**/.env"],
    });
    const engine = new CompletionEngine(
      () => settings,
      new LogBuffer(),
      undefined,
      () => ({
        complete: async () => {
          clientCalls += 1;
          return { text: "ok", rawStatus: 200 };
        },
      }),
    );
    const provider = new AutoCompleteInlineProvider(engine, () => settings);
    const autoCtx = { triggerKind: env.vscode.InlineCompletionTriggerKind.Automatic } as import("vscode").InlineCompletionContext;
    const pos = new env.vscode.Position(0, 5);

    // 1. Pre-cancelled token never invokes engine.
    const doc = makeMockDocument({ path: "/ws/a.ts", text: "const x = " });
    assert.equal(await provider.provideInlineCompletionItems(doc, pos, autoCtx, makeToken(true)), undefined);

    // 2. Disabled plugin.
    settings = { ...settings, enabled: false };
    assert.equal(await provider.provideInlineCompletionItems(doc, pos, autoCtx, makeToken()), undefined);

    // 3. autoTrigger=false on AUTO.
    settings = { ...settings, enabled: true, autoTrigger: false };
    assert.equal(await provider.provideInlineCompletionItems(doc, pos, autoCtx, makeToken()), undefined);

    // 4. Disabled language.
    settings = { ...settings, autoTrigger: true };
    const mdDoc = makeMockDocument({ path: "/ws/README.md", text: "# hello", languageId: "markdown" });
    assert.equal(await provider.provideInlineCompletionItems(mdDoc, pos, autoCtx, makeToken()), undefined);

    // 5. Ignored path.
    const envDoc = makeMockDocument({ path: "/ws/.env", text: "KEY=val" });
    assert.equal(await provider.provideInlineCompletionItems(envDoc, pos, autoCtx, makeToken()), undefined);

    // 6. Oversized file.
    const bigDoc = makeMockDocument({ path: "/ws/big.ts", text: "a".repeat(2048) });
    assert.equal(await provider.provideInlineCompletionItems(bigDoc, pos, autoCtx, makeToken()), undefined);

    assert.equal(clientCalls, 0);
    assert.equal(engine.currentGeneration("/ws/a.ts"), 0);
  });

  it("uses per-scope generation, attaches accept tracking command, and honors forceRefresh", async () => {
    const requests: ProviderRequest[] = [];
    const settings = defaultEngineSettings({
      debounceMinMs: 0,
      debounceInitialMs: 0,
      debounceMaxMs: 0,
      enableInComments: true,
      enableInStrings: true,
    });
    const engine = new CompletionEngine(
      () => settings,
      new LogBuffer(),
      new VsCodeProjectContext(),
      () => ({
        complete: async (req) => {
          requests.push(req);
          return { text: `42 + ${requests.length}`, rawStatus: 200 };
        },
      }),
    );
    const provider = new AutoCompleteInlineProvider(engine, () => settings);
    const docA = makeMockDocument({ path: "/ws/a.ts", text: "const a = " });
    const pos = new env.vscode.Position(0, 10);
    const autoCtx = { triggerKind: env.vscode.InlineCompletionTriggerKind.Automatic } as import("vscode").InlineCompletionContext;

    const first = await provider.provideInlineCompletionItems(docA, pos, autoCtx, makeToken());
    assert.ok(first);
    assert.equal(first.items.length, 1);
    assert.equal(first.items[0]!.insertText, "42 + 1");
    assert.equal(first.items[0]!.command?.command, INTERNAL_ACCEPTED_COMMAND);
    assert.equal(requests.length, 1);

    // Per-scope generation was incremented for /ws/a.ts without touching /ws/b.ts.
    assert.ok(engine.currentGeneration("/ws/a.ts") > 0);
    assert.equal(engine.currentGeneration("/ws/b.ts"), 0);

    // Second identical call hits cache (still 1 HTTP request).
    const cached = await provider.provideInlineCompletionItems(docA, pos, autoCtx, makeToken());
    assert.equal(cached?.items[0]?.insertText, "42 + 1");
    assert.equal(requests.length, 1);

    // forceRefresh bypasses cache and triggers fresh HTTP request!
    provider.requestForceRefresh();
    const refreshed = await provider.provideInlineCompletionItems(docA, pos, autoCtx, makeToken());
    assert.equal(refreshed?.items[0]?.insertText, "42 + 2");
    assert.equal(requests.length, 2);
  });

  it("gates comments when enableInComments=false", async () => {
    let called = false;
    const settings = defaultEngineSettings({
      debounceMinMs: 0,
      debounceInitialMs: 0,
      debounceMaxMs: 0,
      enableInComments: false,
      enableInStrings: true,
    });
    const engine = new CompletionEngine(
      () => settings,
      new LogBuffer(),
      undefined,
      () => ({
        complete: async () => {
          called = true;
          return { text: "nope", rawStatus: 200 };
        },
      }),
    );
    const provider = new AutoCompleteInlineProvider(engine, () => settings);
    const doc = makeMockDocument({ path: "/ws/c.ts", text: "// typing a comment " });
    const pos = new env.vscode.Position(0, 20);
    const autoCtx = { triggerKind: env.vscode.InlineCompletionTriggerKind.Automatic } as import("vscode").InlineCompletionContext;

    const res = await provider.provideInlineCompletionItems(doc, pos, autoCtx, makeToken());
    assert.equal(res, undefined);
    assert.equal(called, false);
  });
});

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { LogBuffer, type LogEntry, type SessionStats } from "@auto-complete/core-ts";
import { VsCodeUiBridge } from "./VsCodeUiBridge.js";
import {
  createProfile,
  ensureProfiles,
  getActiveProfileId,
  hasApiKey,
  saveProfiles,
  setApiKey,
  toSnapshot,
} from "../config/settings.js";
import { createMockVscodeEnv, type MockVscodeEnv } from "../testHelpers/mockVscode.js";

describe("VsCodeUiBridge", () => {
  let env: MockVscodeEnv;

  beforeEach(() => {
    env = createMockVscodeEnv();
    env.install();
  });

  afterEach(() => {
    env.restore();
  });

  it("importSettings validates top-level JSON, rejects malformed inputs, and preserves local state", async () => {
    await ensureProfiles(env.context);
    const bridge = new VsCodeUiBridge(env.context, () => [], () => {});

    for (const bad of ["{not-json", "null", "[]", '"hello"', '{"profiles": "not-array"}']) {
      const res = await bridge.handle({
        v: 1,
        id: "1",
        type: "importSettings",
        payload: { json: bad },
      });
      assert.equal(res.ok, false, `expected failure for ${bad}`);
    }
    assert.equal((await ensureProfiles(env.context)).length, 1);
  });

  it("importSettings regenerates UUIDs, strips headers/secrets without inheriting local ones, and deletes orphan secrets", async () => {
    const existing = await ensureProfiles(env.context);
    const oldId = existing[0]!.id;
    existing[0]!.authHeaderTemplate = "X-Local-Secret: ${apiKey}";
    existing[0]!.extraHeadersJson = '{"X-Local-Route":"corp"}';
    await saveProfiles(env.context, existing, oldId);
    await setApiKey(env.context.secrets, oldId, "sk-local-super-secret");
    assert.equal(await hasApiKey(env.context.secrets, oldId), true);

    const bridge = new VsCodeUiBridge(env.context, () => [], () => {});
    const incomingJson = JSON.stringify({
      schemaVersion: 1,
      enabled: true,
      activeProfileId: oldId,
      disabledLanguages: ["markdown", "plaintext"],
      ignoreGlobs: ["**/*.secret", "**/private/**"],
      profiles: [
        {
          id: oldId,
          name: "Imported Gateway",
          baseUrl: "https://imported.example.test/v1",
          model: "qwen2.5-coder:7b",
          apiKey: "must-be-ignored",
          hasApiKey: true,
          authHeaderTemplate: "X-Evil: injected",
          extraHeadersJson: '{"X-Evil":"injected"}',
          extraBodyJson: '{"seed":42}',
          stopSequences: "END",
        },
      ],
    });

    const res = await bridge.handle({
      v: 1,
      id: "2",
      type: "importSettings",
      payload: { json: incomingJson },
    });
    assert.equal(res.ok, true);

    const snap = await toSnapshot(env.context);
    assert.equal(snap.profiles.length, 1);
    const imported = snap.profiles[0]!;
    assert.notEqual(imported.id, oldId, "profile UUID must be regenerated");
    assert.equal(snap.activeProfileId, imported.id, "activeProfileId must be remapped");
    assert.equal(imported.hasApiKey, false);
    assert.equal(imported.authHeaderTemplate, "Authorization: Bearer ${apiKey}");
    assert.equal(imported.extraHeadersJson, "{}");
    assert.equal(imported.extraBodyJson, '{"seed":42}');
    assert.equal(imported.stopSequences, "END");
    assert.equal(snap.disabledLanguages, "markdown, plaintext");
    assert.equal(snap.ignoreGlobs, "**/*.secret\n**/private/**");
    // Orphan secret belonging to replaced local profile must be deleted.
    assert.equal(await hasApiKey(env.context.secrets, oldId), false);
    assert.equal(env.secretsMap.size, 0);
  });

  it("clears profiles when importing or applying empty profiles array []", async () => {
    const existing = await ensureProfiles(env.context);
    await setApiKey(env.context.secrets, existing[0]!.id, "sk-old");
    const bridge = new VsCodeUiBridge(env.context, () => [], () => {});

    const impRes = await bridge.handle({
      v: 1,
      id: "3",
      type: "importSettings",
      payload: { json: JSON.stringify({ profiles: [] }) },
    });
    assert.equal(impRes.ok, true);
    assert.equal((await ensureProfiles(env.context)).length, 0);
    assert.equal(await getActiveProfileId(env.context), "");
    assert.equal(env.secretsMap.size, 0);

    // Recreate a profile, then clear via applySettings({ profiles: [] }).
    const p = await createProfile(env.context, { preset: "ollama" });
    await setApiKey(env.context.secrets, p.id, "sk-two");
    const applyRes = await bridge.handle({
      v: 1,
      id: "4",
      type: "applySettings",
      payload: { profiles: [] },
    });
    assert.equal(applyRes.ok, true);
    assert.equal((await ensureProfiles(env.context)).length, 0);
    assert.equal(env.secretsMap.size, 0);
  });

  it("applySettings runs server-side validation while allowing blank drafts + valid global edits", async () => {
    const profiles = await ensureProfiles(env.context);
    const bridge = new VsCodeUiBridge(env.context, () => [], () => {});

    // Blank draft profile + valid global field change succeeds.
    const blankOk = await bridge.handle({
      v: 1,
      id: "10",
      type: "applySettings",
      payload: {
        enabled: false,
        disabledLanguages: ["yaml", "toml"],
        ignoreGlobs: ["**/tmp/**"],
        profiles: [{ id: profiles[0]!.id, name: "Draft", baseUrl: "", model: "" }],
      },
    });
    assert.equal(blankOk.ok, true);

    // Reject invalid URL scheme.
    const badScheme = await bridge.handle({
      v: 1,
      id: "11",
      type: "applySettings",
      payload: {
        profiles: [{ id: profiles[0]!.id, name: "Bad", baseUrl: "ftp://example.test/v1", model: "m" }],
      },
    });
    assert.equal(badScheme.ok, false);

    // Reject URL userInfo.
    const badUserInfo = await bridge.handle({
      v: 1,
      id: "12",
      type: "applySettings",
      payload: {
        profiles: [
          { id: profiles[0]!.id, name: "Bad", baseUrl: "https://user:pass@example.test/v1", model: "m" },
        ],
      },
    });
    assert.equal(badUserInfo.ok, false);

    // Reject sensitive header in extraHeadersJson.
    const badHeader = await bridge.handle({
      v: 1,
      id: "13",
      type: "applySettings",
      payload: {
        profiles: [
          {
            id: profiles[0]!.id,
            name: "Bad",
            baseUrl: "http://127.0.0.1:11434/v1",
            model: "m",
            extraHeadersJson: '{"X-API-Key":"leak"}',
          },
        ],
      },
    });
    assert.equal(badHeader.ok, false);

    // Reject raw authHeaderTemplate without ${apiKey}.
    const badAuth = await bridge.handle({
      v: 1,
      id: "14",
      type: "applySettings",
      payload: {
        profiles: [
          {
            id: profiles[0]!.id,
            name: "Bad",
            baseUrl: "http://127.0.0.1:11434/v1",
            model: "m",
            authHeaderTemplate: "Authorization: Bearer hardcoded-secret",
          },
        ],
      },
    });
    assert.equal(badAuth.ok, false);

    // Reject invalid extraBodyJson.
    const badBody = await bridge.handle({
      v: 1,
      id: "15",
      type: "applySettings",
      payload: {
        profiles: [
          {
            id: profiles[0]!.id,
            name: "Bad",
            baseUrl: "http://127.0.0.1:11434/v1",
            model: "m",
            extraBodyJson: "[1,2,3]",
          },
        ],
      },
    });
    assert.equal(badBody.ok, false);

    // Reject bad debounce ordering.
    const badDebounce = await bridge.handle({
      v: 1,
      id: "16",
      type: "applySettings",
      payload: {
        debounceMinMs: 500,
        debounceInitialMs: 300,
        debounceMaxMs: 1000,
      },
    });
    assert.equal(badDebounce.ok, false);
  });

  it("supports copyToClipboard, getSessionStats, clearCaches, setSecret/clearSecret, and platform theme", async () => {
    const profiles = await ensureProfiles(env.context);
    const id = profiles[0]!.id;
    let cleared = 0;
    const stats: SessionStats = {
      totalRequests: 12,
      cacheHits: 5,
      cancelled: 2,
      failed: 1,
      accepted: 4,
      p50LatencyMs: 120,
      p95LatencyMs: 340,
      currentDebounceMs: 250,
      backoffBlocked: false,
      backoffFatal: false,
    };
    const bridge = new VsCodeUiBridge(env.context, () => [], () => {}, undefined, {
      getSessionStats: () => stats,
      clearCaches: () => {
        cleared += 1;
      },
    });

    const copyRes = await bridge.handle({
      v: 1,
      id: "20",
      type: "copyToClipboard",
      payload: { text: "copied text" },
    });
    assert.equal(copyRes.ok, true);
    assert.deepEqual(copyRes.payload, { copied: true });
    assert.deepEqual(env.clipboardWrites, ["copied text"]);

    const statsRes = await bridge.handle({ v: 1, id: "21", type: "getSessionStats" });
    assert.equal(statsRes.ok, true);
    assert.deepEqual(statsRes.payload, stats);

    const clearRes = await bridge.handle({ v: 1, id: "22", type: "clearCaches" });
    assert.equal(clearRes.ok, true);
    assert.equal(cleared, 1);

    const setRes = await bridge.handle({
      v: 1,
      id: "23",
      type: "setSecret",
      payload: { profileId: id, secret: "sk-abc" },
    });
    assert.equal(setRes.ok, true);
    assert.deepEqual(setRes.payload, { ok: true, profileId: id, hasApiKey: true });

    const clrRes = await bridge.handle({
      v: 1,
      id: "24",
      type: "clearSecret",
      payload: { profileId: id },
    });
    assert.equal(clrRes.ok, true);
    assert.deepEqual(clrRes.payload, { ok: true, profileId: id, hasApiKey: false });

    env.setColorThemeKind(env.vscode.ColorThemeKind.HighContrastLight);
    const platLight = await bridge.handle({ v: 1, id: "25", type: "getPlatform" });
    assert.equal((platLight.payload as { theme: string }).theme, "high-contrast-light");

    env.setColorThemeKind(env.vscode.ColorThemeKind.HighContrast);
    const platDark = await bridge.handle({ v: 1, id: "26", type: "getPlatform" });
    assert.equal((platDark.payload as { theme: string }).theme, "high-contrast-dark");
  });

  it("wires onLog on all 4 probe methods, extracts httpStatus, validates before probes, and never mutates activeProfileId", async () => {
    const p1 = (await ensureProfiles(env.context))[0]!;
    const p2 = await createProfile(env.context, { name: "Secondary", preset: "ollama" });
    const allProfiles = await ensureProfiles(env.context);
    allProfiles.find((p) => p.id === p2.id)!.model = "qwen2.5-coder:7b";
    // Keep p1 as the active profile!
    await saveProfiles(env.context, allProfiles, p1.id);
    assert.equal(await getActiveProfileId(env.context), p1.id);

    const logBuffer = new LogBuffer(100);
    let fetchMode: "ok" | "fail401" = "fail401";
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/models")) {
        return new Response(JSON.stringify({ data: [{ id: "qwen2.5-coder:7b", context_length: 32768 }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (fetchMode === "fail401") {
        return new Response("invalid api key", { status: 401 });
      }
      return new Response(
        JSON.stringify({ choices: [{ text: "return a + b", message: { content: "return a + b" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const bridge = new VsCodeUiBridge(
      env.context,
      () => logBuffer.snapshot(),
      () => logBuffer.clear(),
      undefined,
      { logBuffer, fetchImpl: mockFetch },
    );

    // 1. testConnection on p2 (not active!) extracts httpStatus=401, logs to LogBuffer, does NOT switch activeProfileId.
    const tcFail = await bridge.handle({
      v: 1,
      id: "30",
      type: "testConnection",
      payload: { profileId: p2.id },
    });
    assert.equal(tcFail.ok, true);
    const tcPayload = tcFail.payload as { status: string; httpStatus: number | null };
    assert.equal(tcPayload.status, "FAILED");
    assert.equal(tcPayload.httpStatus, 401);
    assert.equal(await getActiveProfileId(env.context), p1.id);
    assert.ok(logBuffer.snapshot().some((e) => e.operation === "connection_test"));

    // 2. probeTemplate, probeAllTemplates, listModels all log to LogBuffer and keep activeProfileId = p1.id.
    fetchMode = "ok";
    const pt = await bridge.handle({
      v: 1,
      id: "31",
      type: "probeTemplate",
      payload: { profileId: p2.id, template: "CHAT" },
    });
    assert.equal(pt.ok, true);
    assert.ok(logBuffer.snapshot().some((e) => e.operation === "template_probe"));

    const pa = await bridge.handle({
      v: 1,
      id: "32",
      type: "probeAllTemplates",
      payload: { profileId: p2.id },
    });
    assert.equal(pa.ok, true);
    assert.ok(((pa.payload as { results: unknown[] }).results ?? []).length > 0);

    const lm = await bridge.handle({
      v: 1,
      id: "33",
      type: "listModels",
      payload: { profileId: p2.id },
    });
    assert.equal(lm.ok, true);
    assert.ok(logBuffer.snapshot().some((e) => e.operation === "list_models"));
    assert.equal(await getActiveProfileId(env.context), p1.id);

    // 3. Probe rejects invalid profile before making HTTP call.
    const p3 = await createProfile(env.context, { name: "Blank" });
    let fetchCalled = false;
    const guardBridge = new VsCodeUiBridge(env.context, () => [], () => {}, undefined, {
      fetchImpl: async () => {
        fetchCalled = true;
        return new Response("ok", { status: 200 });
      },
    });
    const invalidProbe = await guardBridge.handle({
      v: 1,
      id: "34",
      type: "testConnection",
      payload: { profileId: p3.id },
    });
    assert.equal(invalidProbe.ok, false);
    assert.equal(fetchCalled, false);
  });

  it("subscribeLogs respects level/limit, unsubscribeLogs stops pushing logBatch, and dispose clears timers", async () => {
    await ensureProfiles(env.context);
    const entries: LogEntry[] = [
      { time: "2026-01-01T00:00:00Z", level: "DEBUG", message: "dbg" },
      { time: "2026-01-01T00:00:01Z", level: "INFO", message: "inf" },
      { time: "2026-01-01T00:00:02Z", level: "ERROR", message: "err" },
    ];
    const bridge = new VsCodeUiBridge(env.context, () => entries, () => {});
    const batches: LogEntry[][] = [];
    bridge.onLogBatch((b) => batches.push(b));

    // Not subscribed yet -> enqueueLog must not push.
    bridge.enqueueLog({ time: "2026-01-01T00:00:03Z", level: "INFO", message: "ignored" });
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(batches.length, 0);

    // Subscribe with level=warn -> filters initial entries.
    const sub = await bridge.handle({
      v: 1,
      id: "40",
      type: "subscribeLogs",
      payload: { level: "warn", limit: 10 },
    });
    assert.equal(sub.ok, true);
    const subEntries = (sub.payload as { entries: LogEntry[] }).entries;
    assert.equal(subEntries.length, 1);
    assert.equal(subEntries[0]?.level, "ERROR");

    // Now enqueue an ERROR entry -> delivered.
    bridge.enqueueLog({ time: "2026-01-01T00:00:04Z", level: "ERROR", message: "pushed" });
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(batches.length, 1);
    assert.equal(batches[0]?.[0]?.message, "pushed");

    // Unsubscribe -> subsequent entries are NOT pushed.
    const unsub = await bridge.handle({ v: 1, id: "41", type: "unsubscribeLogs" });
    assert.equal(unsub.ok, true);
    bridge.enqueueLog({ time: "2026-01-01T00:00:05Z", level: "ERROR", message: "after-unsub" });
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(batches.length, 1);

    // Re-subscribe, queue entry, then dispose() before timer fires -> cancelled cleanly.
    await bridge.handle({ v: 1, id: "42", type: "subscribeLogs" });
    bridge.enqueueLog({ time: "2026-01-01T00:00:06Z", level: "ERROR", message: "before-dispose" });
    bridge.dispose();
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(batches.length, 1);
  });
});

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { ProbeResult, Profile, SessionStats, Snapshot } from "../types.ts";
import { BridgeClient, resetMockBridgeState, type BridgeResponse } from "./client.ts";

describe("BridgeClient & mock handlers", () => {
  beforeEach(() => {
    resetMockBridgeState();
  });

  it("createProfile honors localized name, preset, and deduplicates names", async () => {
    const client = new BridgeClient(5000);
    try {
      const r1 = await client.request("createProfile", {
        name: "DeepSeek",
        preset: "deepseek",
      });
      assert.equal(r1.ok, true);
      const snap1 = r1.payload as Snapshot;
      const created = snap1.profiles?.find((p) => p.id === snap1.activeProfileId);
      assert.ok(created);
      assert.equal(created.name, "DeepSeek");
      assert.equal(created.baseUrl, "https://api.deepseek.com/beta");
      assert.equal(created.promptTemplate, "CODESTRAL_API");
      assert.equal(created.fimPath, "/completions");
      assert.equal(created.hasApiKey, false);

      const r2 = await client.request("createProfile", { name: "DeepSeek" });
      const snap2 = r2.payload as Snapshot;
      const dup = snap2.profiles?.find((p) => p.id === snap2.activeProfileId);
      assert.equal(dup?.name, "DeepSeek 2");
    } finally {
      client.dispose();
    }
  });

  it("setSecret and clearSecret return { profileId, hasApiKey } and update snapshot", async () => {
    const client = new BridgeClient(5000);
    try {
      const setRes = await client.request("setSecret", {
        profileId: "default",
        secret: "sk-test-123",
      });
      assert.equal(setRes.ok, true);
      assert.deepEqual(setRes.payload, { profileId: "default", hasApiKey: true });

      const snapAfterSet = (await client.request("getSnapshot")).payload as Snapshot;
      assert.equal(snapAfterSet.profiles?.[0]?.hasApiKey, true);

      const clearRes = await client.request("clearSecret", { profileId: "default" });
      assert.equal(clearRes.ok, true);
      assert.deepEqual(clearRes.payload, { profileId: "default", hasApiKey: false });
    } finally {
      client.dispose();
    }
  });

  it("probeTemplate returns single ProbeResult while probeAllTemplates returns { results }", async () => {
    const client = new BridgeClient(5000);
    try {
      const single = await client.request("probeTemplate", {
        profileId: "default",
        template: "QWEN",
      });
      assert.equal(single.ok, true);
      assert.equal(single.type, "probeResult");
      const p = single.payload as ProbeResult & { results?: unknown };
      assert.equal(p.template, "QWEN");
      assert.equal(p.results, undefined);

      const all = await client.request("probeAllTemplates", { profileId: "default" });
      assert.equal(all.ok, true);
      assert.equal(all.type, "probeAllResult");
      const list = (all.payload as { results: ProbeResult[] }).results;
      assert.ok(Array.isArray(list) && list.length > 0);
    } finally {
      client.dispose();
    }
  });

  it("supports copyToClipboard, getSessionStats, clearCaches, and export/import sanitization", async () => {
    const client = new BridgeClient(5000);
    try {
      const copyRes = await client.request("copyToClipboard", { text: "hello" });
      assert.equal(copyRes.ok, true);
      assert.deepEqual(copyRes.payload, { copied: true });

      const statsRes = await client.request("getSessionStats");
      assert.equal(statsRes.ok, true);
      const stats = statsRes.payload as SessionStats;
      assert.equal(typeof stats.totalRequests, "number");
      assert.equal(typeof stats.cacheHits, "number");

      const clearRes = await client.request("clearCaches");
      assert.equal(clearRes.ok, true);
      assert.deepEqual(clearRes.payload, { ok: true });

      await client.request("setSecret", { profileId: "default", secret: "sk-secret" });
      const exp = await client.request("exportSettings");
      const exported = JSON.parse((exp.payload as { json: string }).json) as Snapshot;
      const exportedProfile = exported.profiles?.[0] as Profile & Record<string, unknown>;
      assert.equal("hasApiKey" in exportedProfile, false);
      assert.equal("authHeaderTemplate" in exportedProfile, false);
      assert.equal("extraHeadersJson" in exportedProfile, false);

      // Import resets IDs and hasApiKey
      const imp = await client.request("importSettings", {
        json: JSON.stringify({
          schemaVersion: 1,
          activeProfileId: "default",
          profiles: [
            {
              id: "default",
              name: "Imported",
              baseUrl: "http://127.0.0.1:11434/v1",
              model: "qwen2.5-coder:7b",
              hasApiKey: true,
              apiKey: "should-strip",
            },
          ],
        }),
      });
      assert.equal(imp.ok, true);
      const afterImp = (await client.request("getSnapshot")).payload as Snapshot;
      assert.equal(afterImp.profiles?.length, 1);
      assert.notEqual(afterImp.profiles?.[0]?.id, "default");
      assert.equal(afterImp.profiles?.[0]?.hasApiKey, false);

      // Rejects invalid JSON
      const badImp = await client.request("importSettings", { json: "{not-json" });
      assert.equal(badImp.ok, false);
    } finally {
      client.dispose();
    }
  });

  it("routes cefQuery transport and push messages cleanly", async () => {
    const prevWindow = (globalThis as { window?: unknown }).window;
    const fakeWindow: Record<string, unknown> = {
      cefQuery(req: {
        request: string;
        onSuccess: (r: string) => void;
        onFailure: (c: number, m: string) => void;
      }) {
        const parsed = JSON.parse(req.request) as { id: string; type: string };
        if (parsed.type === "failMe") {
          req.onFailure(500, "boom");
          return;
        }
        req.onSuccess(
          JSON.stringify({
            v: 1,
            id: parsed.id,
            type: "pong",
            ok: true,
            payload: { echoed: parsed.type },
          }),
        );
      },
    };
    (globalThis as { window?: unknown }).window = fakeWindow;
    const client = new BridgeClient(5000);
    try {
      const ok = await client.request("ping");
      assert.equal(ok.ok, true);
      assert.deepEqual(ok.payload, { echoed: "ping" });

      const fail = await client.request("failMe");
      assert.equal(fail.ok, false);
      assert.equal(fail.error, "boom");

      const pushed: BridgeResponse[] = [];
      client.onPush((m) => pushed.push(m));
      (fakeWindow.__autoCompleteReceive as (m: BridgeResponse) => void)({
        v: 1,
        id: "",
        type: "themeChanged",
        ok: true,
        payload: { theme: "high-contrast-light" },
      });
      assert.equal(pushed.length, 1);
      assert.equal(pushed[0].type, "themeChanged");
    } finally {
      client.dispose();
      if (prevWindow === undefined) delete (globalThis as { window?: unknown }).window;
      else (globalThis as { window?: unknown }).window = prevWindow;
    }
  });
});

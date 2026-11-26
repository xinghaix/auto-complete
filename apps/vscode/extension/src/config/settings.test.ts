import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  buildEngineSettings,
  createProfile,
  deleteProfile,
  ensureProfiles,
  getActiveProfile,
  getGlobalPrefs,
  isConfigChangeSuppressed,
  saveGlobalPrefs,
  saveProfiles,
  syncExternalConfigChanges,
  toSnapshot,
} from "./settings.js";
import { redactSettingsExport } from "./settingsExport.js";
import { createMockVscodeEnv, type MockVscodeEnv } from "../testHelpers/mockVscode.js";

describe("settings storage & mirroring", () => {
  let env: MockVscodeEnv;

  beforeEach(() => {
    env = createMockVscodeEnv();
    env.install();
  });

  afterEach(() => {
    env.restore();
  });

  it("uses diff-only mirroring and re-entrancy suppression to prevent 33x config storms", async () => {
    await ensureProfiles(env.context);
    let unsuppressedEvents = 0;
    let suppressedEvents = 0;
    env.vscode.workspace.onDidChangeConfiguration(() => {
      if (isConfigChangeSuppressed()) suppressedEvents += 1;
      else unsuppressedEvents += 1;
    });

    // Saving unchanged defaults produces 0 cfg.update calls.
    await saveGlobalPrefs(env.context, { enabled: true, autoTrigger: true });
    assert.equal(env.configUpdates.length, 0);

    // Changing only 1 setting calls cfg.update exactly once, under suppression.
    await saveGlobalPrefs(env.context, { enabled: false });
    assert.equal(env.configUpdates.length, 1);
    assert.equal(env.configUpdates[0]?.key, "enabled");
    assert.equal(env.configUpdates[0]?.value, false);
    assert.equal(suppressedEvents, 1);
    assert.equal(unsuppressedEvents, 0);
    assert.equal(isConfigChangeSuppressed(), false);

    // Repeating the same save triggers 0 additional cfg.update calls.
    await saveGlobalPrefs(env.context, { enabled: false });
    assert.equal(env.configUpdates.length, 1);
  });

  it("never mirrors authHeaderTemplate or extraHeadersJson into settings.json", async () => {
    const profiles = await ensureProfiles(env.context);
    profiles[0]!.authHeaderTemplate = "X-Custom-Auth: Token ${apiKey}";
    profiles[0]!.extraHeadersJson = '{"X-Routing":"canary"}';
    profiles[0]!.model = "deepseek-coder";

    await saveProfiles(env.context, profiles, profiles[0]!.id);

    const updatedKeys = env.configUpdates.map((u) => u.key);
    assert.ok(updatedKeys.includes("model"));
    assert.ok(!updatedKeys.includes("authHeaderTemplate"));
    assert.ok(!updatedKeys.includes("extraHeadersJson"));

    const acGlobal = env.configGlobalValues.get("autoComplete") ?? {};
    assert.equal("authHeaderTemplate" in acGlobal, false);
    assert.equal("extraHeadersJson" in acGlobal, false);
  });

  it("clears mirrored baseUrl/model when the last profile is deleted", async () => {
    const profiles = await ensureProfiles(env.context);
    profiles[0]!.baseUrl = "https://api.example.test/v1";
    profiles[0]!.model = "custom-model";
    await saveProfiles(env.context, profiles, profiles[0]!.id);
    assert.equal(env.configGlobalValues.get("autoComplete")?.model, "custom-model");

    await deleteProfile(env.context, profiles[0]!.id);

    assert.equal((await ensureProfiles(env.context)).length, 0);
    assert.equal(await getActiveProfile(env.context), undefined);
    const acGlobal = env.configGlobalValues.get("autoComplete") ?? {};
    assert.equal(acGlobal.baseUrl, "");
    assert.equal(acGlobal.model, "");
    const engineSettings = await buildEngineSettings(env.context);
    assert.equal(engineSettings.model, "");
  });

  it("creates profiles with default English name and safe public presets", async () => {
    await ensureProfiles(env.context);

    const blank = await createProfile(env.context);
    assert.equal(blank.name, "New Profile");
    assert.equal(blank.baseUrl, "");
    assert.equal(blank.model, "");

    const blank2 = await createProfile(env.context);
    assert.equal(blank2.name, "New Profile 2");

    const ollama = await createProfile(env.context, { preset: "ollama" });
    assert.equal(ollama.name, "Ollama");
    assert.equal(ollama.baseUrl, "http://127.0.0.1:11434/v1");
    assert.equal(ollama.promptTemplate, "AUTO");

    const deepseek = await createProfile(env.context, { preset: "deepseek-beta" });
    assert.equal(deepseek.baseUrl, "https://api.deepseek.com/beta");
    assert.equal(deepseek.promptTemplate, "CODESTRAL_API");
    assert.equal(deepseek.fimPath, "/completions");

    const codestral = await createProfile(env.context, {
      name: "Work Mistral",
      preset: "mistral-codestral",
    });
    assert.equal(codestral.name, "Work Mistral");
    assert.equal(codestral.baseUrl, "https://codestral.mistral.ai/v1");
    assert.equal(codestral.fimPath, "/fim/completions");

    const vllm = await createProfile(env.context, { preset: "vllm-lmstudio" });
    assert.equal(vllm.baseUrl, "http://127.0.0.1:8000/v1");
  });

  it("stores, snapshots, exports, and maps extraBodyJson and stopSequences", async () => {
    const profiles = await ensureProfiles(env.context);
    profiles[0]!.extraBodyJson = '{"top_p":0.95}';
    profiles[0]!.stopSequences = "\n\n\n###";
    await saveProfiles(env.context, profiles, profiles[0]!.id);

    const engineSettings = await buildEngineSettings(env.context);
    assert.equal(engineSettings.providerConfig.extraBodyJson, '{"top_p":0.95}');
    assert.equal(engineSettings.providerConfig.stopSequences, "\n\n\n###");

    const snap = await toSnapshot(env.context);
    assert.equal(snap.profiles[0]?.extraBodyJson, '{"top_p":0.95}');
    assert.equal(snap.profiles[0]?.stopSequences, "\n\n\n###");

    const exported = redactSettingsExport(snap);
    assert.equal((exported.profiles[0] as Record<string, unknown>).extraBodyJson, '{"top_p":0.95}');
    assert.equal((exported.profiles[0] as Record<string, unknown>).stopSequences, "\n\n\n###");
    assert.equal("authHeaderTemplate" in exported.profiles[0]!, false);
    assert.equal("extraHeadersJson" in exported.profiles[0]!, false);
  });

  it("keeps globalState as single source of truth and preserves explicit empty ignoreGlobs", async () => {
    await ensureProfiles(env.context);
    await saveGlobalPrefs(env.context, { enabled: false, ignoreGlobs: "" });
    // Even if external defaults differ, globalState remains authoritative.
    const prefs = getGlobalPrefs(env.context);
    assert.equal(prefs.enabled, false);
    assert.equal(prefs.ignoreGlobs, "");

    const engineSettings = await buildEngineSettings(env.context);
    assert.equal(engineSettings.enabled, false);
    assert.deepEqual(engineSettings.ignoreGlobs, []);
  });

  it("syncExternalConfigChanges updates globalState from native settings.json edits without writeback", async () => {
    await ensureProfiles(env.context);
    await saveGlobalPrefs(env.context, { enabled: true });
    env.configUpdates.length = 0;

    // Simulate external edit in settings.json.
    env.configGlobalValues.get("autoComplete")!.enabled = false;
    env.configGlobalValues.get("autoComplete")!.model = "qwen3-coder:14b";

    await syncExternalConfigChanges(env.context, {
      affectsConfiguration: (s: string) =>
        s === "autoComplete.enabled" || s === "autoComplete.model",
    });

    assert.equal(getGlobalPrefs(env.context).enabled, false);
    assert.equal((await getActiveProfile(env.context))?.model, "qwen3-coder:14b");
    assert.equal(env.configUpdates.length, 0);
  });
});

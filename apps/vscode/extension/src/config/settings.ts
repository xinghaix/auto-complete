import type * as vscode from "vscode";
import { randomUUID } from "crypto";
import type { EngineSettings, PromptTemplateId, ProviderConfig } from "@auto-complete/core-ts";
import { validateSettings } from "@auto-complete/core-ts";
import { getVscode } from "../vscodeApi";

const PROFILES_KEY = "autoComplete.profiles.v1";
const PROFILES_INITIALIZED_KEY = "autoComplete.profilesInitialized.v1";
const ACTIVE_KEY = "autoComplete.activeProfileId";
const GLOBAL_KEY = "autoComplete.global.v1";

export const DEFAULT_AUTH_HEADER_TEMPLATE = "Authorization: Bearer ${apiKey}";
export const DEFAULT_NEW_PROFILE_NAME = "New Profile";

export type StoredProfile = {
  id: string;
  name: string;
  provider?: string;
  baseUrl: string;
  model: string;
  authHeaderTemplate?: string;
  extraHeadersJson?: string;
  extraBodyJson?: string;
  stopSequences?: string;
  fimPath?: string;
  chatPath?: string;
  completionsPath?: string;
  responsesPath?: string;
  requestStyle?: string;
  promptTemplate?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  settingsTimeoutMs?: number;
  stream?: boolean;
  overrideContextBudget?: boolean;
  maxPrefixChars?: number;
  maxSuffixChars?: number;
};

export type ProfilePreset = {
  id: "ollama" | "deepseek-beta" | "mistral-codestral" | "vllm-lmstudio";
  defaultName: string;
  baseUrl: string;
  promptTemplate: PromptTemplateId;
  fimPath: string;
  chatPath: string;
  completionsPath: string;
};

const PRESET_DEFINITIONS: Record<ProfilePreset["id"], ProfilePreset> = {
  ollama: {
    id: "ollama",
    defaultName: "Ollama",
    baseUrl: "http://127.0.0.1:11434/v1",
    promptTemplate: "AUTO",
    fimPath: "",
    chatPath: "/chat/completions",
    completionsPath: "",
  },
  "deepseek-beta": {
    id: "deepseek-beta",
    defaultName: "DeepSeek Beta FIM",
    baseUrl: "https://api.deepseek.com/beta",
    promptTemplate: "CODESTRAL_API",
    fimPath: "/completions",
    chatPath: "/chat/completions",
    completionsPath: "",
  },
  "mistral-codestral": {
    id: "mistral-codestral",
    defaultName: "Mistral Codestral",
    baseUrl: "https://codestral.mistral.ai/v1",
    promptTemplate: "CODESTRAL_API",
    fimPath: "/fim/completions",
    chatPath: "/chat/completions",
    completionsPath: "",
  },
  "vllm-lmstudio": {
    id: "vllm-lmstudio",
    defaultName: "vLLM / LM Studio",
    baseUrl: "http://127.0.0.1:8000/v1",
    promptTemplate: "AUTO",
    fimPath: "",
    chatPath: "/chat/completions",
    completionsPath: "",
  },
};

const PRESET_ALIASES: Record<string, ProfilePreset["id"]> = {
  ollama: "ollama",
  deepseek: "deepseek-beta",
  "deepseek-beta": "deepseek-beta",
  "deepseek-beta-fim": "deepseek-beta",
  mistral: "mistral-codestral",
  "mistral-codestral": "mistral-codestral",
  codestral: "mistral-codestral",
  vllm: "vllm-lmstudio",
  "vllm-lmstudio": "vllm-lmstudio",
  lmstudio: "vllm-lmstudio",
  "lm-studio": "vllm-lmstudio",
};

export function resolveProfilePreset(raw?: string | null): ProfilePreset | undefined {
  const key = (raw ?? "").trim().toLowerCase();
  if (!key) return undefined;
  const canonical = PRESET_ALIASES[key];
  return canonical ? PRESET_DEFINITIONS[canonical] : undefined;
}

export type UiTheme = "auto" | "light" | "dark";

export type GlobalPrefs = {
  enabled: boolean;
  autoTrigger: boolean;
  enableInComments: boolean;
  enableInStrings: boolean;
  firstLineOnlyWhenMidLine: boolean;
  sendFilePath: boolean;
  respectGitignore: boolean;
  ignoreGlobs: string;
  disabledLanguages: string;
  logLevel: string;
  logPromptBodies: boolean;
  logRetention: number;
  notifyOnFatalError: boolean;
  showCostApprox: boolean;
  maxPrefixChars: number;
  maxSuffixChars: number;
  debounceMinMs: number;
  debounceInitialMs: number;
  debounceMaxMs: number;
  maxInFlight: number;
  cacheSize: number;
  lruSize: number;
  maxFileSizeKb: number;
  enableRecentFileContext: boolean;
  recentFileLimit: number;
  recentFileMaxChars: number;
  showStatusBar: boolean;
  /** Settings panel theme preference (auto | light | dark). */
  uiTheme: UiTheme;
  /**
   * Settings panel UI locale. `auto` follows IDE language; otherwise a fixed
   * catalog id (en | zh | ja | ko).
   */
  uiLocale: string;
};

export const DEFAULT_GLOBAL: GlobalPrefs = {
  enabled: true,
  autoTrigger: true,
  enableInComments: true,
  enableInStrings: true,
  firstLineOnlyWhenMidLine: true,
  sendFilePath: true,
  respectGitignore: true,
  ignoreGlobs: [
    "**/.git/**",
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/target/**",
    "**/.idea/**",
    "**/.gradle/**",
    "**/vendor/**",
  ].join("\n"),
  disabledLanguages: "",
  logLevel: "info",
  logPromptBodies: false,
  logRetention: 1000,
  notifyOnFatalError: true,
  showCostApprox: false,
  maxPrefixChars: 8000,
  maxSuffixChars: 2000,
  debounceMinMs: 150,
  debounceInitialMs: 300,
  debounceMaxMs: 1000,
  maxInFlight: 1,
  cacheSize: 20,
  lruSize: 64,
  maxFileSizeKb: 512,
  enableRecentFileContext: false,
  recentFileLimit: 3,
  recentFileMaxChars: 1200,
  showStatusBar: true,
  uiTheme: "auto",
  uiLocale: "auto",
};

/**
 * Re-entrancy guard preventing mirrored `cfg.update(...)` calls from re-triggering
 * `onDidChangeConfiguration` refresh storms.
 */
let suppressConfigChangeDepth = 0;

export function isConfigChangeSuppressed(): boolean {
  return suppressConfigChangeDepth > 0;
}

export async function withSuppressedConfigChange<T>(fn: () => Promise<T>): Promise<T> {
  suppressConfigChangeDepth += 1;
  try {
    return await fn();
  } finally {
    suppressConfigChangeDepth = Math.max(0, suppressConfigChangeDepth - 1);
  }
}

async function updateConfigIfChanged(
  cfg: vscode.WorkspaceConfiguration,
  key: string,
  value: unknown,
): Promise<boolean> {
  const vscode = getVscode();
  const inspected = cfg.inspect?.(key);
  if (value === undefined) {
    if (inspected && inspected.globalValue === undefined) return false;
    await cfg.update(key, undefined, vscode.ConfigurationTarget.Global);
    return true;
  }
  const current =
    inspected && inspected.globalValue !== undefined ? inspected.globalValue : cfg.get(key);
  if (Object.is(current, value)) return false;
  await cfg.update(key, value, vscode.ConfigurationTarget.Global);
  return true;
}

export function normalizeUiTheme(raw: unknown): UiTheme {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "light" || v === "dark") return v;
  return "auto";
}

export function normalizeUiLocale(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "en" || v === "zh" || v === "ja" || v === "ko") return v;
  return "auto";
}

export function normalizeDisabledLanguagesInput(raw: unknown): string | undefined {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw
      .filter((x) => typeof x === "string")
      .map((x) => x.trim())
      .filter(Boolean)
      .join(", ");
  }
  return undefined;
}

export function normalizeIgnoreGlobsInput(raw: unknown): string | undefined {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw
      .filter((x) => typeof x === "string")
      .map((x) => x.trim())
      .filter(Boolean)
      .join("\n");
  }
  return undefined;
}

function secretKey(profileId: string): string {
  return `autoComplete.apiKey:${profileId}`;
}

export function uniqueName(preferred: string, existing: string[]): string {
  const base = preferred.trim() || DEFAULT_NEW_PROFILE_NAME;
  const taken = new Set(existing.map((n) => n.trim()).filter(Boolean));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

export async function ensureProfiles(context: vscode.ExtensionContext): Promise<StoredProfile[]> {
  let profiles = context.globalState.get<StoredProfile[]>(PROFILES_KEY);
  const initialized = context.globalState.get<boolean>(PROFILES_INITIALIZED_KEY, false);
  if (profiles && (profiles.length > 0 || initialized)) return profiles.map((p) => ({ ...p }));
  if (!profiles && initialized) return [];

  // Migrate from contributes.configuration flat keys once.
  const c = getVscode().workspace.getConfiguration("autoComplete");
  const migrated: StoredProfile = {
    id: randomUUID(),
    name: "Default",
    provider: "openai-compatible",
    baseUrl: c.get("baseUrl", "http://127.0.0.1:11434/v1"),
    model: c.get("model", "qwen2.5-coder:7b"),
    authHeaderTemplate: c.get("authHeaderTemplate", DEFAULT_AUTH_HEADER_TEMPLATE),
    extraHeadersJson: "{}",
    extraBodyJson: "",
    stopSequences: "",
    fimPath: c.get("fimPath", ""),
    chatPath: c.get("chatPath", "/chat/completions"),
    completionsPath: c.get("completionsPath", ""),
    promptTemplate: c.get("promptTemplate", "AUTO"),
    temperature: c.get("temperature", 0),
    maxTokens: c.get("maxTokens", 128),
    timeoutMs: c.get("timeoutMs", 3000),
    settingsTimeoutMs: c.get("settingsTimeoutMs", 15000),
    stream: c.get("stream", false),
    overrideContextBudget: false,
    maxPrefixChars: c.get("maxPrefixChars", 8000),
    maxSuffixChars: c.get("maxSuffixChars", 2000),
  };
  // Legacy single secret → profile secret
  const legacy = await context.secrets.get("autoComplete.apiKey");
  if (legacy?.trim()) {
    await context.secrets.store(secretKey(migrated.id), legacy.trim());
    await context.secrets.delete("autoComplete.apiKey");
  }
  profiles = [migrated];
  await context.globalState.update(PROFILES_KEY, profiles);
  await context.globalState.update(PROFILES_INITIALIZED_KEY, true);
  await context.globalState.update(ACTIVE_KEY, migrated.id);
  return profiles.map((p) => ({ ...p }));
}

const MIRRORED_GLOBAL_KEYS: ReadonlyArray<keyof GlobalPrefs> = [
  "enabled",
  "autoTrigger",
  "enableInComments",
  "enableInStrings",
  "firstLineOnlyWhenMidLine",
  "sendFilePath",
  "logLevel",
  "logPromptBodies",
  "maxPrefixChars",
  "maxSuffixChars",
  "debounceMinMs",
  "debounceInitialMs",
  "debounceMaxMs",
  "maxFileSizeKb",
  "showStatusBar",
  "uiTheme",
  "uiLocale",
  "respectGitignore",
  "enableRecentFileContext",
  "notifyOnFatalError",
  "showCostApprox",
];

/**
 * Returns global preferences with `globalState` as the single source of truth.
 * Falls back to `contributes.configuration` only for keys not yet present in `globalState`.
 */
export function getGlobalPrefs(context: vscode.ExtensionContext): GlobalPrefs {
  const stored = context.globalState.get<Partial<GlobalPrefs>>(GLOBAL_KEY);
  if (stored) {
    return {
      ...DEFAULT_GLOBAL,
      ...stored,
      uiTheme: normalizeUiTheme(stored.uiTheme ?? DEFAULT_GLOBAL.uiTheme),
      uiLocale: normalizeUiLocale(stored.uiLocale ?? DEFAULT_GLOBAL.uiLocale),
    };
  }
  // Initial bootstrap before GLOBAL_KEY has ever been written.
  const c = getVscode().workspace.getConfiguration("autoComplete");
  return {
    ...DEFAULT_GLOBAL,
    enabled: c.get("enabled", DEFAULT_GLOBAL.enabled),
    autoTrigger: c.get("autoTrigger", DEFAULT_GLOBAL.autoTrigger),
    enableInComments: c.get("enableInComments", DEFAULT_GLOBAL.enableInComments),
    enableInStrings: c.get("enableInStrings", DEFAULT_GLOBAL.enableInStrings),
    firstLineOnlyWhenMidLine: c.get(
      "firstLineOnlyWhenMidLine",
      DEFAULT_GLOBAL.firstLineOnlyWhenMidLine,
    ),
    sendFilePath: c.get("sendFilePath", DEFAULT_GLOBAL.sendFilePath),
    respectGitignore: c.get("respectGitignore", DEFAULT_GLOBAL.respectGitignore),
    logLevel: c.get("logLevel", DEFAULT_GLOBAL.logLevel),
    logPromptBodies: c.get("logPromptBodies", DEFAULT_GLOBAL.logPromptBodies),
    notifyOnFatalError: c.get("notifyOnFatalError", DEFAULT_GLOBAL.notifyOnFatalError),
    showCostApprox: c.get("showCostApprox", DEFAULT_GLOBAL.showCostApprox),
    maxPrefixChars: c.get("maxPrefixChars", DEFAULT_GLOBAL.maxPrefixChars),
    maxSuffixChars: c.get("maxSuffixChars", DEFAULT_GLOBAL.maxSuffixChars),
    debounceMinMs: c.get("debounceMinMs", DEFAULT_GLOBAL.debounceMinMs),
    debounceInitialMs: c.get("debounceInitialMs", DEFAULT_GLOBAL.debounceInitialMs),
    debounceMaxMs: c.get("debounceMaxMs", DEFAULT_GLOBAL.debounceMaxMs),
    maxFileSizeKb: c.get("maxFileSizeKb", DEFAULT_GLOBAL.maxFileSizeKb),
    enableRecentFileContext: c.get(
      "enableRecentFileContext",
      DEFAULT_GLOBAL.enableRecentFileContext,
    ),
    showStatusBar: c.get("showStatusBar", DEFAULT_GLOBAL.showStatusBar),
    uiTheme: normalizeUiTheme(c.get("uiTheme", DEFAULT_GLOBAL.uiTheme)),
    uiLocale: normalizeUiLocale(c.get("uiLocale", DEFAULT_GLOBAL.uiLocale)),
  };
}

export async function saveGlobalPrefs(
  context: vscode.ExtensionContext,
  prefs: Partial<GlobalPrefs>,
): Promise<void> {
  // Drop undefined keys so partial applySettings does not wipe stored values.
  const patch = Object.fromEntries(
    Object.entries(prefs).filter(([, v]) => v !== undefined),
  ) as Partial<GlobalPrefs>;
  const current = getGlobalPrefs(context);
  const next: GlobalPrefs = {
    ...current,
    ...patch,
    uiTheme: normalizeUiTheme(patch.uiTheme ?? current.uiTheme),
    uiLocale: normalizeUiLocale(patch.uiLocale ?? current.uiLocale),
  };
  await context.globalState.update(GLOBAL_KEY, next);

  // Mirror ONLY changed non-secret global keys under re-entrancy suppression.
  await withSuppressedConfigChange(async () => {
    const cfg = getVscode().workspace.getConfiguration("autoComplete");
    for (const key of MIRRORED_GLOBAL_KEYS) {
      await updateConfigIfChanged(cfg, key, next[key]);
    }
  });
}

export async function getActiveProfileId(context: vscode.ExtensionContext): Promise<string> {
  const profiles = await ensureProfiles(context);
  let id = context.globalState.get<string>(ACTIVE_KEY) ?? "";
  if (!profiles.some((p) => p.id === id)) id = profiles[0]?.id ?? "";
  return id;
}

export async function getActiveProfile(
  context: vscode.ExtensionContext,
): Promise<StoredProfile | undefined> {
  const profiles = await ensureProfiles(context);
  const id = await getActiveProfileId(context);
  return profiles.find((p) => p.id === id) ?? profiles[0];
}

export async function saveProfiles(
  context: vscode.ExtensionContext,
  profiles: StoredProfile[],
  activeId?: string,
): Promise<void> {
  const cloned = profiles.map((p) => ({ ...p }));
  await context.globalState.update(PROFILES_KEY, cloned);
  await context.globalState.update(PROFILES_INITIALIZED_KEY, true);

  let resolvedActiveId: string;
  if (activeId !== undefined) {
    resolvedActiveId = cloned.some((p) => p.id === activeId) ? activeId : (cloned[0]?.id ?? "");
    await context.globalState.update(ACTIVE_KEY, resolvedActiveId);
  } else {
    resolvedActiveId = await getActiveProfileId(context);
    if (cloned.length === 0) {
      await context.globalState.update(ACTIVE_KEY, "");
    }
  }

  // Mirror non-secret active profile fields into contributes.configuration (diff-only, guarded).
  // Security: NEVER mirror authHeaderTemplate or extraHeadersJson into settings.json (Settings Sync).
  const active = cloned.find((p) => p.id === resolvedActiveId);
  await withSuppressedConfigChange(async () => {
    const cfg = getVscode().workspace.getConfiguration("autoComplete");
    if (active) {
      await updateConfigIfChanged(cfg, "baseUrl", active.baseUrl);
      await updateConfigIfChanged(cfg, "model", active.model);
      await updateConfigIfChanged(cfg, "promptTemplate", active.promptTemplate ?? "AUTO");
      await updateConfigIfChanged(cfg, "timeoutMs", active.timeoutMs ?? 3000);
      await updateConfigIfChanged(cfg, "settingsTimeoutMs", active.settingsTimeoutMs ?? 15000);
      await updateConfigIfChanged(cfg, "maxTokens", active.maxTokens ?? 128);
      await updateConfigIfChanged(cfg, "temperature", active.temperature ?? 0);
      await updateConfigIfChanged(cfg, "stream", active.stream ?? false);
      await updateConfigIfChanged(cfg, "fimPath", active.fimPath ?? "");
      await updateConfigIfChanged(cfg, "chatPath", active.chatPath ?? "/chat/completions");
      await updateConfigIfChanged(cfg, "completionsPath", active.completionsPath ?? "");
      await updateConfigIfChanged(cfg, "responsesPath", active.responsesPath ?? "");
    } else {
      // Last profile deleted / empty profile list: clear mirrored profile keys cleanly.
      await updateConfigIfChanged(cfg, "baseUrl", "");
      await updateConfigIfChanged(cfg, "model", "");
      await updateConfigIfChanged(cfg, "promptTemplate", undefined);
      await updateConfigIfChanged(cfg, "timeoutMs", undefined);
      await updateConfigIfChanged(cfg, "settingsTimeoutMs", undefined);
      await updateConfigIfChanged(cfg, "maxTokens", undefined);
      await updateConfigIfChanged(cfg, "temperature", undefined);
      await updateConfigIfChanged(cfg, "stream", undefined);
      await updateConfigIfChanged(cfg, "fimPath", "");
      await updateConfigIfChanged(cfg, "chatPath", "");
      await updateConfigIfChanged(cfg, "completionsPath", "");
      await updateConfigIfChanged(cfg, "responsesPath", "");
    }
  });
}

/**
 * Syncs edits made externally in VS Code's native Settings UI (`settings.json`)
 * back into `globalState` without writing back to `settings.json`.
 */
export async function syncExternalConfigChanges(
  context: vscode.ExtensionContext,
  event: vscode.ConfigurationChangeEvent,
): Promise<void> {
  const cfg = getVscode().workspace.getConfiguration("autoComplete");

  // 1. Sync affected global keys into globalState.
  const currentGlobal = getGlobalPrefs(context);
  const nextGlobal: GlobalPrefs = { ...currentGlobal };
  let globalChanged = false;
  for (const key of MIRRORED_GLOBAL_KEYS) {
    if (!event.affectsConfiguration(`autoComplete.${key}`)) continue;
    const raw = cfg.get(key);
    if (raw === undefined) continue;
    const val =
      key === "uiTheme"
        ? normalizeUiTheme(raw)
        : key === "uiLocale"
          ? normalizeUiLocale(raw)
          : raw;
    if (!Object.is(nextGlobal[key], val)) {
      (nextGlobal as Record<string, unknown>)[key] = val;
      globalChanged = true;
    }
  }
  if (globalChanged) {
    await context.globalState.update(GLOBAL_KEY, nextGlobal);
  }

  // 2. Sync affected non-secret profile keys into the active profile in globalState.
  const profileKeys: ReadonlyArray<keyof StoredProfile> = [
    "baseUrl",
    "model",
    "promptTemplate",
    "timeoutMs",
    "settingsTimeoutMs",
    "maxTokens",
    "temperature",
    "stream",
    "fimPath",
    "chatPath",
    "completionsPath",
    "responsesPath",
  ];
  const affectedProfileKeys = profileKeys.filter((k) =>
    event.affectsConfiguration(`autoComplete.${k}`),
  );
  if (affectedProfileKeys.length > 0) {
    const profiles = await ensureProfiles(context);
    const activeId = await getActiveProfileId(context);
    const active = profiles.find((p) => p.id === activeId);
    if (active) {
      let profileChanged = false;
      for (const k of affectedProfileKeys) {
        const raw = cfg.get(k);
        if (raw === undefined) continue;
        if (!Object.is(active[k], raw)) {
          (active as Record<string, unknown>)[k] = raw;
          profileChanged = true;
        }
      }
      if (profileChanged) {
        await context.globalState.update(
          PROFILES_KEY,
          profiles.map((p) => ({ ...p })),
        );
      }
    }
  }
}

export async function getApiKey(
  secrets: vscode.SecretStorage,
  profileId: string,
): Promise<string> {
  return (await secrets.get(secretKey(profileId))) ?? "";
}

export async function setApiKey(
  secrets: vscode.SecretStorage,
  profileId: string,
  value: string,
): Promise<void> {
  const key = secretKey(profileId);
  if (!value.trim()) await secrets.delete(key);
  else await secrets.store(key, value.trim());
}

export async function clearApiKey(secrets: vscode.SecretStorage, profileId: string): Promise<void> {
  await secrets.delete(secretKey(profileId));
}

export async function hasApiKey(secrets: vscode.SecretStorage, profileId: string): Promise<boolean> {
  return !!(await secrets.get(secretKey(profileId)))?.trim();
}

export function profileToProviderConfig(profile: StoredProfile, apiKey: string): ProviderConfig {
  return {
    kind: "OPENAI_COMPATIBLE",
    baseUrl: profile.baseUrl ?? "",
    apiKey,
    model: profile.model ?? "",
    authHeaderTemplate: profile.authHeaderTemplate ?? DEFAULT_AUTH_HEADER_TEMPLATE,
    extraHeadersJson: profile.extraHeadersJson ?? "{}",
    extraBodyJson: profile.extraBodyJson ?? "",
    stopSequences: profile.stopSequences ?? "",
    fimPath: profile.fimPath ?? "",
    chatPath: profile.chatPath ?? "/chat/completions",
    completionsPath: profile.completionsPath ?? "",
    responsesPath: profile.responsesPath ?? "",
    requestStyle: "AUTO",
    promptTemplate: (profile.promptTemplate as PromptTemplateId) ?? "AUTO",
    temperature: profile.temperature ?? 0,
    maxTokens: profile.maxTokens ?? 128,
    timeoutMs: profile.timeoutMs ?? 3000,
    settingsTimeoutMs: profile.settingsTimeoutMs ?? 15000,
    stream: profile.stream ?? false,
    allowRemote: true,
  };
}

/**
 * Resolves a profile's `ProviderConfig` + validation metadata WITHOUT mutating global `activeProfileId`.
 */
export async function resolveProfileForOperation(
  context: vscode.ExtensionContext,
  profileId?: string,
): Promise<{
  profile: StoredProfile | undefined;
  providerConfig: ProviderConfig | undefined;
  global: GlobalPrefs;
}> {
  const profiles = await ensureProfiles(context);
  const global = getGlobalPrefs(context);
  const profile = profileId
    ? profiles.find((p) => p.id === profileId)
    : await getActiveProfile(context);
  if (!profile) {
    return { profile: undefined, providerConfig: undefined, global };
  }
  const apiKey = await getApiKey(context.secrets, profile.id);
  return {
    profile,
    providerConfig: profileToProviderConfig(profile, apiKey),
    global,
  };
}

export async function buildEngineSettings(
  context: vscode.ExtensionContext,
): Promise<EngineSettings> {
  const profile = await getActiveProfile(context);
  const global = getGlobalPrefs(context);
  const apiKey = profile ? await getApiKey(context.secrets, profile.id) : "";
  const baseUrl = profile?.baseUrl ?? "";
  const model = profile?.model ?? "";
  const timeoutMs = profile?.timeoutMs ?? 3000;
  const settingsTimeoutMs = profile?.settingsTimeoutMs ?? 15000;
  const maxTokens = profile?.maxTokens ?? 128;
  const temperature = profile?.temperature ?? 0;
  const maxPrefixChars = profile?.overrideContextBudget
    ? (profile.maxPrefixChars ?? global.maxPrefixChars)
    : global.maxPrefixChars;
  const maxSuffixChars = profile?.overrideContextBudget
    ? (profile.maxSuffixChars ?? global.maxSuffixChars)
    : global.maxSuffixChars;
  const extraHeadersJson = profile?.extraHeadersJson ?? "{}";
  const extraBodyJson = profile?.extraBodyJson ?? "";
  const authHeaderTemplate = profile?.authHeaderTemplate ?? DEFAULT_AUTH_HEADER_TEMPLATE;

  const validationErrors =
    !profile || (!baseUrl.trim() && !model.trim())
      ? ["no active profile"]
      : validateSettings({
          baseUrl,
          model,
          timeoutMs,
          settingsTimeoutMs,
          maxTokens,
          temperature,
          maxPrefixChars,
          maxSuffixChars,
          allowRemote: true,
          authHeaderTemplate,
          extraHeadersJson,
          extraBodyJson,
          debounceMinMs: global.debounceMinMs,
          debounceInitialMs: global.debounceInitialMs,
          debounceMaxMs: global.debounceMaxMs,
          requireConnection: true,
        });

  const providerConfig: ProviderConfig = profile
    ? profileToProviderConfig(profile, apiKey)
    : {
        kind: "OPENAI_COMPATIBLE",
        baseUrl: "",
        apiKey: "",
        model: "",
        authHeaderTemplate: DEFAULT_AUTH_HEADER_TEMPLATE,
        extraHeadersJson: "{}",
        extraBodyJson: "",
        stopSequences: "",
        fimPath: "",
        chatPath: "/chat/completions",
        completionsPath: "",
        responsesPath: "",
        requestStyle: "AUTO",
        promptTemplate: "AUTO",
        temperature: 0,
        maxTokens: 128,
        timeoutMs: 3000,
        settingsTimeoutMs: 15000,
        stream: false,
        allowRemote: true,
      };

  const disabledLangSet = new Set(
    global.disabledLanguages
      .split(/[,;\n]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  const ignoreList = global.ignoreGlobs
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    enabled: global.enabled,
    autoTrigger: global.autoTrigger,
    snoozed: false,
    model,
    disabledLanguages: disabledLangSet,
    maxFileSizeKb: global.maxFileSizeKb,
    respectGitignore: global.respectGitignore,
    ignoreGlobs: ignoreList,
    validationErrors,
    firstLineOnlyWhenMidLine: global.firstLineOnlyWhenMidLine,
    enableInComments: global.enableInComments,
    enableInStrings: global.enableInStrings,
    debounceMinMs: global.debounceMinMs,
    debounceInitialMs: global.debounceInitialMs,
    debounceMaxMs: global.debounceMaxMs,
    maxPrefixChars,
    maxSuffixChars,
    maxTokens,
    temperature,
    stream: profile?.stream ?? false,
    sendFilePath: global.sendFilePath,
    enableRecentFileContext: global.enableRecentFileContext,
    recentFileLimit: global.recentFileLimit,
    recentFileMaxChars: global.recentFileMaxChars,
    cacheSize: global.cacheSize,
    lruSize: global.lruSize,
    maxInFlight: global.maxInFlight,
    logRetention: global.logRetention,
    logLevel: global.logLevel,
    logPromptBodies: global.logPromptBodies,
    notifyOnFatalError: global.notifyOnFatalError,
    showCostApprox: global.showCostApprox,
    providerConfig,
  };
}

export async function toSnapshot(context: vscode.ExtensionContext) {
  const profiles = await ensureProfiles(context);
  const activeProfileId = await getActiveProfileId(context);
  const global = getGlobalPrefs(context);
  const withKeys = await Promise.all(
    profiles.map(async (p) => ({
      id: p.id,
      name: p.name,
      provider: p.provider ?? "openai-compatible",
      baseUrl: p.baseUrl,
      model: p.model,
      promptTemplate: p.promptTemplate ?? "AUTO",
      maxTokens: p.maxTokens ?? 128,
      temperature: p.temperature ?? 0,
      timeoutMs: p.timeoutMs ?? 3000,
      settingsTimeoutMs: p.settingsTimeoutMs ?? 15000,
      stream: p.stream ?? false,
      hasApiKey: await hasApiKey(context.secrets, p.id),
      fimPath: p.fimPath ?? "",
      chatPath: p.chatPath ?? "/chat/completions",
      completionsPath: p.completionsPath ?? "",
      responsesPath: p.responsesPath ?? "",
      authHeaderTemplate: p.authHeaderTemplate ?? DEFAULT_AUTH_HEADER_TEMPLATE,
      extraHeadersJson: p.extraHeadersJson ?? "{}",
      extraBodyJson: p.extraBodyJson ?? "",
      stopSequences: p.stopSequences ?? "",
      overrideContextBudget: p.overrideContextBudget ?? false,
      maxPrefixChars: p.maxPrefixChars ?? 8000,
      maxSuffixChars: p.maxSuffixChars ?? 2000,
    })),
  );
  return {
    schemaVersion: 1,
    enabled: global.enabled,
    autoTrigger: global.autoTrigger,
    activeProfileId,
    profiles: withKeys,
    enableInComments: global.enableInComments,
    enableInStrings: global.enableInStrings,
    firstLineOnlyWhenMidLine: global.firstLineOnlyWhenMidLine,
    sendFilePath: global.sendFilePath,
    showStatusBar: global.showStatusBar,
    respectGitignore: global.respectGitignore,
    ignoreGlobs: global.ignoreGlobs,
    disabledLanguages: global.disabledLanguages,
    debounceMinMs: global.debounceMinMs,
    debounceInitialMs: global.debounceInitialMs,
    debounceMaxMs: global.debounceMaxMs,
    maxPrefixChars: global.maxPrefixChars,
    maxSuffixChars: global.maxSuffixChars,
    maxInFlight: global.maxInFlight,
    cacheSize: global.cacheSize,
    lruSize: global.lruSize,
    maxFileSizeKb: global.maxFileSizeKb,
    enableRecentFileContext: global.enableRecentFileContext,
    recentFileLimit: global.recentFileLimit,
    recentFileMaxChars: global.recentFileMaxChars,
    logLevel: global.logLevel,
    logPromptBodies: global.logPromptBodies,
    logRetention: global.logRetention,
    notifyOnFatalError: global.notifyOnFatalError,
    showCostApprox: global.showCostApprox,
    uiTheme: global.uiTheme,
    uiLocale: global.uiLocale,
  };
}

export async function createProfile(
  context: vscode.ExtensionContext,
  opts?: { name?: string; preset?: string },
): Promise<StoredProfile> {
  const profiles = await ensureProfiles(context);
  const preset = resolveProfilePreset(opts?.preset);
  const preferredName = opts?.name?.trim() || preset?.defaultName || DEFAULT_NEW_PROFILE_NAME;
  const name = uniqueName(
    preferredName,
    profiles.map((p) => p.name),
  );
  const profile: StoredProfile = {
    id: randomUUID(),
    name,
    provider: "openai-compatible",
    baseUrl: preset?.baseUrl ?? "",
    model: "",
    authHeaderTemplate: DEFAULT_AUTH_HEADER_TEMPLATE,
    extraHeadersJson: "{}",
    extraBodyJson: "",
    stopSequences: "",
    fimPath: preset?.fimPath ?? "",
    chatPath: preset?.chatPath ?? "/chat/completions",
    completionsPath: preset?.completionsPath ?? "",
    responsesPath: "",
    promptTemplate: preset?.promptTemplate ?? "AUTO",
    temperature: 0,
    maxTokens: 128,
    timeoutMs: 3000,
    settingsTimeoutMs: 15000,
    stream: false,
    overrideContextBudget: false,
    maxPrefixChars: 8000,
    maxSuffixChars: 2000,
  };
  profiles.push(profile);
  await saveProfiles(context, profiles, profile.id);
  return profile;
}

export async function deleteProfile(
  context: vscode.ExtensionContext,
  profileId: string,
): Promise<void> {
  let profiles = await ensureProfiles(context);
  profiles = profiles.filter((p) => p.id !== profileId);
  await clearApiKey(context.secrets, profileId);
  let active = await getActiveProfileId(context);
  if (active === profileId) active = profiles[0]?.id ?? "";
  await saveProfiles(context, profiles, active);
}

export async function selectProfile(
  context: vscode.ExtensionContext,
  profileId: string,
): Promise<void> {
  const profiles = await ensureProfiles(context);
  if (!profiles.some((p) => p.id === profileId)) return;
  await saveProfiles(context, profiles, profileId);
}

export async function renameProfile(
  context: vscode.ExtensionContext,
  profileId: string,
  name: string,
): Promise<void> {
  const profiles = await ensureProfiles(context);
  const p = profiles.find((x) => x.id === profileId);
  if (!p) return;
  p.name = uniqueName(
    name,
    profiles.filter((x) => x.id !== profileId).map((x) => x.name),
  );
  await saveProfiles(context, profiles);
}

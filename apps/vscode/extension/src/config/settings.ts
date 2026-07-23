import * as vscode from "vscode";
import { randomUUID } from "crypto";
import type { EngineSettings, PromptTemplateId, ProviderConfig } from "@auto-complete/core-ts";
import { validateSettings } from "@auto-complete/core-ts";

const PROFILES_KEY = "autoComplete.profiles.v1";
const PROFILES_INITIALIZED_KEY = "autoComplete.profilesInitialized.v1";
const ACTIVE_KEY = "autoComplete.activeProfileId";
const GLOBAL_KEY = "autoComplete.global.v1";

export type StoredProfile = {
  id: string;
  name: string;
  provider?: string;
  baseUrl: string;
  model: string;
  authHeaderTemplate?: string;
  extraHeadersJson?: string;
  fimPath?: string;
  chatPath?: string;
  completionsPath?: string;
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

const DEFAULT_GLOBAL: GlobalPrefs = {
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

function normalizeUiTheme(raw: unknown): UiTheme {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "light" || v === "dark") return v;
  return "auto";
}

function secretKey(profileId: string): string {
  return `autoComplete.apiKey:${profileId}`;
}

export function uniqueName(preferred: string, existing: string[]): string {
  const base = preferred.trim() || "新配置";
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
  const c = vscode.workspace.getConfiguration("autoComplete");
  const migrated: StoredProfile = {
    id: randomUUID(),
    name: "Default",
    provider: "openai-compatible",
    baseUrl: c.get("baseUrl", "http://127.0.0.1:11434/v1"),
    model: c.get("model", "qwen2.5-coder:7b"),
    authHeaderTemplate: c.get("authHeaderTemplate", "Authorization: Bearer ${apiKey}"),
    extraHeadersJson: "{}",
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

export function getGlobalPrefs(context: vscode.ExtensionContext): GlobalPrefs {
  const stored = context.globalState.get<Partial<GlobalPrefs>>(GLOBAL_KEY) ?? {};
  const c = vscode.workspace.getConfiguration("autoComplete");
  return {
    ...DEFAULT_GLOBAL,
    enabled: c.get("enabled", stored.enabled ?? DEFAULT_GLOBAL.enabled),
    autoTrigger: c.get("autoTrigger", stored.autoTrigger ?? DEFAULT_GLOBAL.autoTrigger),
    enableInComments: c.get(
      "enableInComments",
      stored.enableInComments ?? DEFAULT_GLOBAL.enableInComments,
    ),
    enableInStrings: c.get(
      "enableInStrings",
      stored.enableInStrings ?? DEFAULT_GLOBAL.enableInStrings,
    ),
    firstLineOnlyWhenMidLine: c.get(
      "firstLineOnlyWhenMidLine",
      stored.firstLineOnlyWhenMidLine ?? DEFAULT_GLOBAL.firstLineOnlyWhenMidLine,
    ),
    sendFilePath: c.get("sendFilePath", stored.sendFilePath ?? DEFAULT_GLOBAL.sendFilePath),
    respectGitignore: c.get(
      "respectGitignore",
      stored.respectGitignore ?? DEFAULT_GLOBAL.respectGitignore,
    ),
    ignoreGlobs: stored.ignoreGlobs ?? DEFAULT_GLOBAL.ignoreGlobs,
    disabledLanguages: stored.disabledLanguages ?? DEFAULT_GLOBAL.disabledLanguages,
    logLevel: c.get("logLevel", stored.logLevel ?? DEFAULT_GLOBAL.logLevel),
    logPromptBodies: c.get(
      "logPromptBodies",
      stored.logPromptBodies ?? DEFAULT_GLOBAL.logPromptBodies,
    ),
    logRetention: stored.logRetention ?? DEFAULT_GLOBAL.logRetention,
    notifyOnFatalError: c.get(
      "notifyOnFatalError",
      stored.notifyOnFatalError ?? DEFAULT_GLOBAL.notifyOnFatalError,
    ),
    showCostApprox: c.get(
      "showCostApprox",
      stored.showCostApprox ?? DEFAULT_GLOBAL.showCostApprox,
    ),
    maxPrefixChars: c.get("maxPrefixChars", stored.maxPrefixChars ?? DEFAULT_GLOBAL.maxPrefixChars),
    maxSuffixChars: c.get("maxSuffixChars", stored.maxSuffixChars ?? DEFAULT_GLOBAL.maxSuffixChars),
    debounceMinMs: c.get("debounceMinMs", stored.debounceMinMs ?? DEFAULT_GLOBAL.debounceMinMs),
    debounceInitialMs: c.get(
      "debounceInitialMs",
      stored.debounceInitialMs ?? DEFAULT_GLOBAL.debounceInitialMs,
    ),
    debounceMaxMs: c.get("debounceMaxMs", stored.debounceMaxMs ?? DEFAULT_GLOBAL.debounceMaxMs),
    maxInFlight: stored.maxInFlight ?? DEFAULT_GLOBAL.maxInFlight,
    cacheSize: stored.cacheSize ?? DEFAULT_GLOBAL.cacheSize,
    lruSize: stored.lruSize ?? DEFAULT_GLOBAL.lruSize,
    maxFileSizeKb: c.get("maxFileSizeKb", stored.maxFileSizeKb ?? DEFAULT_GLOBAL.maxFileSizeKb),
    enableRecentFileContext: c.get(
      "enableRecentFileContext",
      stored.enableRecentFileContext ?? DEFAULT_GLOBAL.enableRecentFileContext,
    ),
    recentFileLimit: stored.recentFileLimit ?? DEFAULT_GLOBAL.recentFileLimit,
    recentFileMaxChars: stored.recentFileMaxChars ?? DEFAULT_GLOBAL.recentFileMaxChars,
    showStatusBar: c.get("showStatusBar", stored.showStatusBar ?? DEFAULT_GLOBAL.showStatusBar),
    uiTheme: normalizeUiTheme(
      c.get("uiTheme", stored.uiTheme ?? DEFAULT_GLOBAL.uiTheme),
    ),
    uiLocale: normalizeUiLocale(
      c.get("uiLocale", stored.uiLocale ?? DEFAULT_GLOBAL.uiLocale),
    ),
  };
}

function normalizeUiLocale(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "en" || v === "zh" || v === "ja" || v === "ko") return v;
  return "auto";
}

export async function saveGlobalPrefs(
  context: vscode.ExtensionContext,
  prefs: Partial<GlobalPrefs>,
): Promise<void> {
  // Drop undefined keys so partial applySettings does not wipe stored values.
  const patch = Object.fromEntries(
    Object.entries(prefs).filter(([, v]) => v !== undefined),
  ) as Partial<GlobalPrefs>;
  const next = { ...getGlobalPrefs(context), ...patch };
  await context.globalState.update(GLOBAL_KEY, next);
  const cfg = vscode.workspace.getConfiguration("autoComplete");
  const target = vscode.ConfigurationTarget.Global;
  await cfg.update("enabled", next.enabled, target);
  await cfg.update("autoTrigger", next.autoTrigger, target);
  await cfg.update("enableInComments", next.enableInComments, target);
  await cfg.update("enableInStrings", next.enableInStrings, target);
  await cfg.update("firstLineOnlyWhenMidLine", next.firstLineOnlyWhenMidLine, target);
  await cfg.update("sendFilePath", next.sendFilePath, target);
  await cfg.update("logLevel", next.logLevel, target);
  await cfg.update("logPromptBodies", next.logPromptBodies, target);
  await cfg.update("maxPrefixChars", next.maxPrefixChars, target);
  await cfg.update("maxSuffixChars", next.maxSuffixChars, target);
  await cfg.update("debounceMinMs", next.debounceMinMs, target);
  await cfg.update("debounceInitialMs", next.debounceInitialMs, target);
  await cfg.update("debounceMaxMs", next.debounceMaxMs, target);
  await cfg.update("maxFileSizeKb", next.maxFileSizeKb, target);
  await cfg.update("showStatusBar", next.showStatusBar, target);
  await cfg.update("uiTheme", next.uiTheme, target);
  await cfg.update("uiLocale", next.uiLocale, target);
  await cfg.update("respectGitignore", next.respectGitignore, target);
  await cfg.update("enableRecentFileContext", next.enableRecentFileContext, target);
  await cfg.update("notifyOnFatalError", next.notifyOnFatalError, target);
  await cfg.update("showCostApprox", next.showCostApprox, target);
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
  await context.globalState.update(
    PROFILES_KEY,
    profiles.map((p) => ({ ...p })),
  );
  await context.globalState.update(PROFILES_INITIALIZED_KEY, true);
  if (activeId !== undefined) {
    await context.globalState.update(ACTIVE_KEY, activeId);
  }
  // Mirror active profile into contributes.configuration for native settings UI
  const resolvedActiveId = activeId ?? (await getActiveProfileId(context));
  const active = profiles.find((p) => p.id === resolvedActiveId);
  if (active) {
    const cfg = vscode.workspace.getConfiguration("autoComplete");
    const target = vscode.ConfigurationTarget.Global;
    await cfg.update("baseUrl", active.baseUrl, target);
    await cfg.update("model", active.model, target);
    await cfg.update("promptTemplate", active.promptTemplate ?? "AUTO", target);
    await cfg.update("timeoutMs", active.timeoutMs ?? 3000, target);
    await cfg.update("settingsTimeoutMs", active.settingsTimeoutMs ?? 15000, target);
    await cfg.update("maxTokens", active.maxTokens ?? 128, target);
    await cfg.update("temperature", active.temperature ?? 0, target);
    await cfg.update("stream", active.stream ?? false, target);
    await cfg.update("fimPath", active.fimPath ?? "", target);
    await cfg.update("chatPath", active.chatPath ?? "/chat/completions", target);
    await cfg.update("completionsPath", active.completionsPath ?? "", target);
    await cfg.update(
      "authHeaderTemplate",
      active.authHeaderTemplate ?? "Authorization: Bearer ${apiKey}",
      target,
    );
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
  const maxPrefixChars = profile?.overrideContextBudget
    ? (profile.maxPrefixChars ?? global.maxPrefixChars)
    : global.maxPrefixChars;
  const maxSuffixChars = profile?.overrideContextBudget
    ? (profile.maxSuffixChars ?? global.maxSuffixChars)
    : global.maxSuffixChars;
  const extraHeadersJson = profile?.extraHeadersJson ?? "{}";
  const validationErrors =
    !profile || (!baseUrl.trim() && !model.trim())
      ? ["no active profile"]
      : validateSettings({
          baseUrl,
          model,
          timeoutMs,
          settingsTimeoutMs,
          maxTokens,
          maxPrefixChars,
          maxSuffixChars,
          allowRemote: true,
          extraHeadersJson,
          requireConnection: true,
        });

  const providerConfig: ProviderConfig = {
    kind: "OPENAI_COMPATIBLE",
    baseUrl,
    apiKey,
    model,
    authHeaderTemplate: profile?.authHeaderTemplate ?? "Authorization: Bearer ${apiKey}",
    extraHeadersJson,
    fimPath: profile?.fimPath ?? "",
    chatPath: profile?.chatPath ?? "/chat/completions",
    completionsPath: profile?.completionsPath ?? "",
    requestStyle: "AUTO",
    promptTemplate: (profile?.promptTemplate as PromptTemplateId) ?? "AUTO",
    temperature: profile?.temperature ?? 0,
    maxTokens,
    timeoutMs,
    settingsTimeoutMs,
    stream: profile?.stream ?? false,
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
    ignoreGlobs: ignoreList.length ? ignoreList : DEFAULT_GLOBAL.ignoreGlobs.split("\n"),
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
    temperature: profile?.temperature ?? 0,
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
      authHeaderTemplate: p.authHeaderTemplate ?? "Authorization: Bearer ${apiKey}",
      extraHeadersJson: p.extraHeadersJson ?? "{}",
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

export async function createProfile(context: vscode.ExtensionContext): Promise<void> {
  const profiles = await ensureProfiles(context);
  const name = uniqueName("新配置", profiles.map((p) => p.name));
  const profile: StoredProfile = {
    id: randomUUID(),
    name,
    provider: "openai-compatible",
    baseUrl: "",
    model: "",
    authHeaderTemplate: "Authorization: Bearer ${apiKey}",
    extraHeadersJson: "{}",
    fimPath: "",
    chatPath: "/chat/completions",
    completionsPath: "",
    promptTemplate: "AUTO",
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

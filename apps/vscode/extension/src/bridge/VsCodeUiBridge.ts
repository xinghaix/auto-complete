import type * as vscode from "vscode";
import { randomUUID } from "crypto";
import {
  extractStatus,
  HttpCompletionClient,
  HttpStatusError,
  isEnabledBy,
  pathFor,
  redactSecrets,
  redactUrl,
  resolveTemplateForConfig,
  resolveUrl,
  validateSettings,
  type HttpLogEvent,
  type LogBuffer,
  type LogEntry,
  type PromptTemplateId,
  type SessionStats,
} from "@auto-complete/core-ts";
import {
  clearApiKey,
  createProfile,
  DEFAULT_AUTH_HEADER_TEMPLATE,
  DEFAULT_NEW_PROFILE_NAME,
  deleteProfile,
  ensureProfiles,
  getActiveProfileId,
  getGlobalPrefs,
  hasApiKey,
  normalizeDisabledLanguagesInput,
  normalizeIgnoreGlobsInput,
  normalizeUiLocale,
  normalizeUiTheme,
  renameProfile,
  resolveProfileForOperation,
  saveGlobalPrefs,
  saveProfiles,
  selectProfile,
  setApiKey,
  toSnapshot,
  uniqueName,
  type GlobalPrefs,
  type StoredProfile,
} from "../config/settings";
import { redactSettingsExport } from "../config/settingsExport";
import { getVscode } from "../vscodeApi";

export type BridgeMessage = {
  v: 1;
  id: string;
  type: string;
  payload?: unknown;
  ok?: boolean;
  error?: string;
};

export type HostThemeKind = "light" | "dark" | "high-contrast-light" | "high-contrast-dark";

export function mapColorThemeKind(kind: number): HostThemeKind {
  const { ColorThemeKind } = getVscode();
  if (kind === ColorThemeKind.HighContrastLight) return "high-contrast-light";
  if (kind === ColorThemeKind.HighContrast) return "high-contrast-dark";
  if (kind === ColorThemeKind.Light) return "light";
  return "dark";
}

export interface VsCodeUiBridgeOptions {
  logBuffer?: LogBuffer;
  appendLog?: (entry: LogEntry, configuredLevel: string) => void;
  getSessionStats?: () => SessionStats;
  clearCaches?: () => void;
  fetchImpl?: typeof fetch;
}

const EMPTY_SESSION_STATS: SessionStats = {
  totalRequests: 0,
  cacheHits: 0,
  cancelled: 0,
  failed: 0,
  accepted: 0,
  p50LatencyMs: null,
  p95LatencyMs: null,
  currentDebounceMs: 300,
  backoffBlocked: false,
  backoffFatal: false,
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((item) => typeof item === "string");
}

function validateGlobalBounds(global: GlobalPrefs): string[] {
  const errors: string[] = [];
  if (
    !Number.isFinite(global.debounceMinMs) ||
    !Number.isFinite(global.debounceInitialMs) ||
    !Number.isFinite(global.debounceMaxMs) ||
    global.debounceMinMs < 0 ||
    global.debounceInitialMs < 0 ||
    global.debounceMaxMs < 0
  ) {
    errors.push("debounce values must be >= 0");
  } else if (
    global.debounceMinMs > global.debounceInitialMs ||
    global.debounceInitialMs > global.debounceMaxMs
  ) {
    errors.push("debounceMinMs <= debounceInitialMs <= debounceMaxMs required");
  }
  if (!Number.isFinite(global.maxPrefixChars) || global.maxPrefixChars <= 0) {
    errors.push("maxPrefixChars must be > 0");
  }
  if (!Number.isFinite(global.maxSuffixChars) || global.maxSuffixChars <= 0) {
    errors.push("maxSuffixChars must be > 0");
  }
  if (!Number.isFinite(global.maxInFlight) || global.maxInFlight < 1) {
    errors.push("maxInFlight must be >= 1");
  }
  if (!Number.isFinite(global.cacheSize) || global.cacheSize < 1) {
    errors.push("cacheSize must be >= 1");
  }
  if (!Number.isFinite(global.lruSize) || global.lruSize < 1) {
    errors.push("lruSize must be >= 1");
  }
  if (!Number.isFinite(global.maxFileSizeKb) || global.maxFileSizeKb < 1) {
    errors.push("maxFileSizeKb must be >= 1");
  }
  if (!Number.isFinite(global.recentFileLimit) || global.recentFileLimit < 0) {
    errors.push("recentFileLimit must be >= 0");
  }
  if (!Number.isFinite(global.recentFileMaxChars) || global.recentFileMaxChars < 1) {
    errors.push("recentFileMaxChars must be >= 1");
  }
  if (
    !Number.isFinite(global.logRetention) ||
    global.logRetention < 50 ||
    global.logRetention > 10_000
  ) {
    errors.push("logRetention must be 50..10000");
  }
  return errors;
}

function validateProfileValues(
  profile: StoredProfile,
  global: GlobalPrefs,
  opts: { requireBaseUrl: boolean; requireModel: boolean },
): string[] {
  const maxPrefixChars = profile.overrideContextBudget
    ? (profile.maxPrefixChars ?? global.maxPrefixChars)
    : Math.max(1, profile.maxPrefixChars ?? global.maxPrefixChars);
  const maxSuffixChars = profile.overrideContextBudget
    ? (profile.maxSuffixChars ?? global.maxSuffixChars)
    : Math.max(1, profile.maxSuffixChars ?? global.maxSuffixChars);

  const errors = validateSettings({
    baseUrl: profile.baseUrl ?? "",
    model: opts.requireModel ? (profile.model ?? "") : (profile.model?.trim() || "__optional__"),
    timeoutMs: profile.timeoutMs ?? 3000,
    settingsTimeoutMs: profile.settingsTimeoutMs ?? 15000,
    maxTokens: profile.maxTokens ?? 128,
    temperature: profile.temperature ?? 0,
    maxPrefixChars,
    maxSuffixChars,
    allowRemote: true,
    authHeaderTemplate: profile.authHeaderTemplate ?? DEFAULT_AUTH_HEADER_TEMPLATE,
    extraHeadersJson: profile.extraHeadersJson ?? "{}",
    extraBodyJson: profile.extraBodyJson ?? "",
    debounceMinMs: global.debounceMinMs,
    debounceInitialMs: global.debounceInitialMs,
    debounceMaxMs: global.debounceMaxMs,
    requireConnection: opts.requireBaseUrl || opts.requireModel,
  });

  if (!opts.requireBaseUrl && opts.requireModel) {
    return errors.filter((e) => e !== "baseUrl is required");
  }
  if (opts.requireBaseUrl && !opts.requireModel) {
    return errors.filter((e) => e !== "model is required");
  }
  return errors;
}

function validateGlobalInputTypes(data: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const boolFields = [
    "enabled",
    "autoTrigger",
    "enableInComments",
    "enableInStrings",
    "firstLineOnlyWhenMidLine",
    "sendFilePath",
    "showStatusBar",
    "respectGitignore",
    "enableRecentFileContext",
    "logPromptBodies",
    "notifyOnFatalError",
    "showCostApprox",
  ];
  for (const key of boolFields) {
    if (data[key] !== undefined && typeof data[key] !== "boolean") {
      errors.push(`${key} must be a boolean`);
    }
  }
  const numFields = [
    "debounceMinMs",
    "debounceInitialMs",
    "debounceMaxMs",
    "maxPrefixChars",
    "maxSuffixChars",
    "maxInFlight",
    "cacheSize",
    "lruSize",
    "maxFileSizeKb",
    "recentFileLimit",
    "recentFileMaxChars",
    "logRetention",
  ];
  for (const key of numFields) {
    if (data[key] !== undefined && (typeof data[key] !== "number" || !Number.isFinite(data[key]))) {
      errors.push(`${key} must be a finite number`);
    }
  }
  const strFields = ["logLevel", "uiTheme", "uiLocale", "activeProfileId"];
  for (const key of strFields) {
    if (data[key] !== undefined && typeof data[key] !== "string") {
      errors.push(`${key} must be a string`);
    }
  }
  if (
    data.disabledLanguages !== undefined &&
    typeof data.disabledLanguages !== "string" &&
    !isStringArray(data.disabledLanguages)
  ) {
    errors.push("disabledLanguages must be a string or string[]");
  }
  if (
    data.ignoreGlobs !== undefined &&
    typeof data.ignoreGlobs !== "string" &&
    !isStringArray(data.ignoreGlobs)
  ) {
    errors.push("ignoreGlobs must be a string or string[]");
  }
  if (data.profiles !== undefined && !Array.isArray(data.profiles)) {
    errors.push("profiles must be an array");
  }
  return errors;
}

function extractGlobalPatch(data: Record<string, unknown>): Partial<GlobalPrefs> {
  const num = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;
  const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
  const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);

  return {
    enabled: bool(data.enabled),
    autoTrigger: bool(data.autoTrigger),
    enableInComments: bool(data.enableInComments),
    enableInStrings: bool(data.enableInStrings),
    firstLineOnlyWhenMidLine: bool(data.firstLineOnlyWhenMidLine),
    sendFilePath: bool(data.sendFilePath),
    showStatusBar: bool(data.showStatusBar),
    respectGitignore: bool(data.respectGitignore),
    ignoreGlobs: normalizeIgnoreGlobsInput(data.ignoreGlobs),
    disabledLanguages: normalizeDisabledLanguagesInput(data.disabledLanguages),
    debounceMinMs: num(data.debounceMinMs),
    debounceInitialMs: num(data.debounceInitialMs),
    debounceMaxMs: num(data.debounceMaxMs),
    maxPrefixChars: num(data.maxPrefixChars),
    maxSuffixChars: num(data.maxSuffixChars),
    maxInFlight: num(data.maxInFlight),
    cacheSize: num(data.cacheSize),
    lruSize: num(data.lruSize),
    maxFileSizeKb: num(data.maxFileSizeKb),
    enableRecentFileContext: bool(data.enableRecentFileContext),
    recentFileLimit: num(data.recentFileLimit),
    recentFileMaxChars: num(data.recentFileMaxChars),
    logLevel: str(data.logLevel),
    logPromptBodies: bool(data.logPromptBodies),
    logRetention: num(data.logRetention),
    notifyOnFatalError: bool(data.notifyOnFatalError),
    showCostApprox: bool(data.showCostApprox),
    uiTheme:
      data.uiTheme === "light" || data.uiTheme === "dark" || data.uiTheme === "auto"
        ? data.uiTheme
        : undefined,
    uiLocale:
      typeof data.uiLocale === "string" && data.uiLocale.trim()
        ? normalizeUiLocale(data.uiLocale)
        : undefined,
  };
}

function mergeGlobalPrefs(current: GlobalPrefs, patch: Partial<GlobalPrefs>): GlobalPrefs {
  const definedPatch = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  ) as Partial<GlobalPrefs>;
  return {
    ...current,
    ...definedPatch,
    uiTheme: normalizeUiTheme(definedPatch.uiTheme ?? current.uiTheme),
    uiLocale: normalizeUiLocale(definedPatch.uiLocale ?? current.uiLocale),
  };
}

export class VsCodeUiBridge {
  private logListeners = new Set<(entries: LogEntry[]) => void>();
  private pendingBatch: LogEntry[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private logsSubscribed = false;
  private subscribedLevel: string | null = null;
  private readonly logBuffer?: LogBuffer;
  private readonly appendLogFn?: (entry: LogEntry, configuredLevel: string) => void;
  private readonly getSessionStatsFn: () => SessionStats;
  private readonly clearCachesFn: () => void;
  private readonly fetchImpl?: typeof fetch;

  constructor(
    private context: vscode.ExtensionContext,
    private getLogs: () => LogEntry[],
    private clearLogsFn: () => void,
    private onSettingsChanged?: () => void | Promise<void>,
    options: VsCodeUiBridgeOptions = {},
  ) {
    this.logBuffer = options.logBuffer;
    this.appendLogFn =
      options.appendLog ??
      (options.logBuffer
        ? (entry, configuredLevel) => options.logBuffer!.appendIfEnabled(entry, configuredLevel)
        : undefined);
    this.getSessionStatsFn = options.getSessionStats ?? (() => ({ ...EMPTY_SESSION_STATS }));
    this.clearCachesFn = options.clearCaches ?? (() => {});
    this.fetchImpl = options.fetchImpl;
  }

  async handle(msg: BridgeMessage): Promise<BridgeMessage> {
    try {
      switch (msg.type) {
        case "getSnapshot":
          return this.ok(msg, "snapshot", await toSnapshot(this.context));
        case "applySettings": {
          const result = await this.applySettings(msg.payload);
          return result.ok
            ? this.ok(msg, "applyResult", result)
            : this.failWithPayload(msg, "applyResult", result.errors.join("; "), result);
        }
        case "createProfile": {
          const payload = isPlainObject(msg.payload) ? msg.payload : {};
          const name = typeof payload.name === "string" ? payload.name : undefined;
          const preset = typeof payload.preset === "string" ? payload.preset : undefined;
          await createProfile(this.context, { name, preset });
          await this.onSettingsChanged?.();
          return this.ok(msg, "snapshot", await toSnapshot(this.context));
        }
        case "deleteProfile": {
          const { profileId } = (msg.payload ?? {}) as { profileId?: string };
          if (!profileId || typeof profileId !== "string") {
            return this.fail(msg, "profileId is required");
          }
          await deleteProfile(this.context, profileId);
          await this.onSettingsChanged?.();
          return this.ok(msg, "snapshot", await toSnapshot(this.context));
        }
        case "selectProfile": {
          const { profileId } = (msg.payload ?? {}) as { profileId?: string };
          if (!profileId || typeof profileId !== "string") {
            return this.fail(msg, "profileId is required");
          }
          await selectProfile(this.context, profileId);
          await this.onSettingsChanged?.();
          return this.ok(msg, "snapshot", await toSnapshot(this.context));
        }
        case "renameProfile": {
          const { profileId, name } = (msg.payload ?? {}) as { profileId?: string; name?: string };
          if (!profileId || typeof profileId !== "string") {
            return this.fail(msg, "profileId is required");
          }
          await renameProfile(this.context, profileId, typeof name === "string" ? name : "");
          await this.onSettingsChanged?.();
          return this.ok(msg, "snapshot", await toSnapshot(this.context));
        }
        case "setSecret": {
          const { profileId, secret } = (msg.payload ?? {}) as {
            profileId?: string;
            secret?: string;
          };
          if (!profileId || typeof profileId !== "string") {
            return this.fail(msg, "profileId is required");
          }
          await setApiKey(this.context.secrets, profileId, typeof secret === "string" ? secret : "");
          await this.onSettingsChanged?.();
          return this.ok(msg, "secretResult", {
            ok: true,
            profileId,
            hasApiKey: await hasApiKey(this.context.secrets, profileId),
          });
        }
        case "clearSecret": {
          const { profileId } = (msg.payload ?? {}) as { profileId?: string };
          if (!profileId || typeof profileId !== "string") {
            return this.fail(msg, "profileId is required");
          }
          await clearApiKey(this.context.secrets, profileId);
          await this.onSettingsChanged?.();
          return this.ok(msg, "secretResult", {
            ok: true,
            profileId,
            hasApiKey: false,
          });
        }
        case "testConnection":
          return this.ok(msg, "probeResult", await this.testConnection(msg.payload));
        case "probeTemplate":
          return this.ok(msg, "probeResult", await this.probeTemplate(msg.payload));
        case "probeAllTemplates":
          return this.ok(msg, "probeAllResult", await this.probeAll(msg.payload));
        case "listModels":
          return this.ok(msg, "modelsResult", await this.listModels(msg.payload));
        case "subscribeLogs": {
          const payload = isPlainObject(msg.payload) ? msg.payload : {};
          const level =
            typeof payload.level === "string" && payload.level.trim()
              ? payload.level.trim().toLowerCase()
              : null;
          const requestedLimit =
            typeof payload.limit === "number" && Number.isFinite(payload.limit)
              ? Math.floor(payload.limit)
              : undefined;
          const retention = getGlobalPrefs(this.context).logRetention;
          const cap = Math.min(Math.max(50, retention || 1000), 2000);
          const effectiveLimit =
            requestedLimit && requestedLimit > 0 ? Math.min(requestedLimit, cap) : cap;

          this.logsSubscribed = true;
          this.subscribedLevel = level;
          const all = this.getLogs();
          const filtered = level ? all.filter((e) => isEnabledBy(e.level, level)) : all;
          return this.ok(msg, "logSubscribed", {
            ok: true,
            entries: filtered.slice(-effectiveLimit),
          });
        }
        case "unsubscribeLogs":
          this.stopLogStreaming();
          return this.ok(msg, "logUnsubscribed", { ok: true });
        case "clearLogs":
          this.clearLogsFn();
          return this.ok(msg, "logsCleared", { ok: true });
        case "getLogLevel":
          return this.ok(msg, "logLevel", {
            level: getGlobalPrefs(this.context).logLevel,
          });
        case "getSessionStats":
          return this.ok(msg, "sessionStats", this.getSessionStatsFn());
        case "clearCaches":
          this.clearCachesFn();
          return this.ok(msg, "cachesCleared", { ok: true });
        case "copyToClipboard": {
          const payload = isPlainObject(msg.payload) ? msg.payload : {};
          if (typeof payload.text !== "string") {
            return this.fail(msg, "text must be a string");
          }
          await getVscode().env.clipboard.writeText(payload.text);
          return this.ok(msg, "copyResult", { copied: true });
        }
        case "getPlatform": {
          const vscode = getVscode();
          return this.ok(msg, "platform", {
            platform: "vscode",
            // VS Code display language: e.g. zh-cn, ja, ko, en
            locale: vscode.env.language,
            theme: mapColorThemeKind(vscode.window.activeColorTheme.kind),
          });
        }
        case "exportSettings": {
          const clean = redactSettingsExport(await toSnapshot(this.context));
          return this.ok(msg, "exportResult", { json: JSON.stringify(clean, null, 2) });
        }
        case "importSettings": {
          const result = await this.importSettings(msg.payload);
          return result.ok
            ? this.ok(msg, "applyResult", result)
            : this.failWithPayload(msg, "applyResult", result.errors.join("; "), result);
        }
        case "openExternal": {
          const url = (msg.payload as { url?: string } | undefined)?.url?.trim() ?? "";
          if (!/^https?:\/\//i.test(url)) {
            return this.fail(msg, "invalid url");
          }
          const vscode = getVscode();
          await vscode.env.openExternal(vscode.Uri.parse(url));
          return this.ok(msg, "openExternalResult", { ok: true, url });
        }
        case "openKeymap": {
          // Focus Keyboard Shortcuts on the manual trigger command.
          await getVscode().commands.executeCommand(
            "workbench.action.openGlobalKeybindings",
            "autoComplete.trigger",
          );
          return this.ok(msg, "openKeymapResult", { ok: true });
        }
        default:
          return this.fail(msg, `unknown type: ${msg.type}`);
      }
    } catch (e) {
      return this.fail(msg, e instanceof Error ? e.message : String(e));
    }
  }

  enqueueLog(entry: LogEntry): void {
    if (!this.logsSubscribed || this.logListeners.size === 0) return;
    if (this.subscribedLevel && !isEnabledBy(entry.level, this.subscribedLevel)) return;
    this.pendingBatch.push(entry);
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        const batch = this.pendingBatch;
        this.pendingBatch = [];
        this.batchTimer = null;
        if (!this.logsSubscribed || batch.length === 0) return;
        for (const l of this.logListeners) {
          try {
            l(batch);
          } catch {
            /* ignore listener error */
          }
        }
      }, 150);
    }
  }

  onLogBatch(listener: (entries: LogEntry[]) => void): vscode.Disposable {
    this.logListeners.add(listener);
    const vscode = getVscode();
    return new vscode.Disposable(() => {
      this.logListeners.delete(listener);
      if (this.logListeners.size === 0) {
        this.stopLogStreaming();
      }
    });
  }

  /** Stops pending batch timers, clears subscriptions, and detaches log listeners. */
  dispose(): void {
    this.stopLogStreaming();
    this.logListeners.clear();
  }

  private stopLogStreaming(): void {
    this.logsSubscribed = false;
    this.subscribedLevel = null;
    this.pendingBatch = [];
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
  }

  private async applySettings(
    payload: unknown,
  ): Promise<{ ok: boolean; errors: string[] }> {
    if (!isPlainObject(payload)) {
      return { ok: false, errors: ["settings payload must be an object"] };
    }
    const typeErrors = validateGlobalInputTypes(payload);
    if (typeErrors.length > 0) {
      return { ok: false, errors: typeErrors };
    }

    const currentGlobal = getGlobalPrefs(this.context);
    const globalPatch = extractGlobalPatch(payload);
    const nextGlobal = mergeGlobalPrefs(currentGlobal, globalPatch);
    const errors = validateGlobalBounds(nextGlobal);

    let mergedProfiles: StoredProfile[] | undefined;
    let removedIds: string[] = [];
    let nextActiveId: string | undefined;

    if (Array.isArray(payload.profiles)) {
      const existing = await ensureProfiles(this.context);
      const byId = new Map(existing.map((p) => [p.id, p]));
      mergedProfiles = [];
      for (let i = 0; i < payload.profiles.length; i++) {
        const raw = payload.profiles[i];
        if (!isPlainObject(raw)) {
          errors.push(`profiles[${i}] must be an object`);
          continue;
        }
        const rawId = typeof raw.id === "string" ? raw.id : "";
        const prev = rawId ? byId.get(rawId) : undefined;
        const merged: StoredProfile = {
          id: rawId || prev?.id || randomUUID(),
          name:
            (typeof raw.name === "string" && raw.name.trim()) ||
            prev?.name ||
            DEFAULT_NEW_PROFILE_NAME,
          provider:
            typeof raw.provider === "string"
              ? raw.provider
              : (prev?.provider ?? "openai-compatible"),
          baseUrl: typeof raw.baseUrl === "string" ? raw.baseUrl : (prev?.baseUrl ?? ""),
          model: typeof raw.model === "string" ? raw.model : (prev?.model ?? ""),
          authHeaderTemplate:
            typeof raw.authHeaderTemplate === "string"
              ? raw.authHeaderTemplate
              : (prev?.authHeaderTemplate ?? DEFAULT_AUTH_HEADER_TEMPLATE),
          extraHeadersJson:
            typeof raw.extraHeadersJson === "string"
              ? raw.extraHeadersJson
              : (prev?.extraHeadersJson ?? "{}"),
          extraBodyJson:
            typeof raw.extraBodyJson === "string"
              ? raw.extraBodyJson
              : (prev?.extraBodyJson ?? ""),
          stopSequences:
            typeof raw.stopSequences === "string"
              ? raw.stopSequences
              : (prev?.stopSequences ?? ""),
          fimPath: typeof raw.fimPath === "string" ? raw.fimPath : (prev?.fimPath ?? ""),
          chatPath:
            typeof raw.chatPath === "string"
              ? raw.chatPath
              : (prev?.chatPath ?? "/chat/completions"),
          completionsPath:
            typeof raw.completionsPath === "string"
              ? raw.completionsPath
              : (prev?.completionsPath ?? ""),
          responsesPath:
            typeof raw.responsesPath === "string"
              ? raw.responsesPath
              : (prev?.responsesPath ?? ""),
          promptTemplate:
            typeof raw.promptTemplate === "string"
              ? raw.promptTemplate
              : (prev?.promptTemplate ?? "AUTO"),
          temperature:
            typeof raw.temperature === "number" && Number.isFinite(raw.temperature)
              ? raw.temperature
              : (prev?.temperature ?? 0),
          maxTokens:
            typeof raw.maxTokens === "number" && Number.isFinite(raw.maxTokens)
              ? raw.maxTokens
              : (prev?.maxTokens ?? 128),
          timeoutMs:
            typeof raw.timeoutMs === "number" && Number.isFinite(raw.timeoutMs)
              ? raw.timeoutMs
              : (prev?.timeoutMs ?? 3000),
          settingsTimeoutMs:
            typeof raw.settingsTimeoutMs === "number" && Number.isFinite(raw.settingsTimeoutMs)
              ? raw.settingsTimeoutMs
              : (prev?.settingsTimeoutMs ?? 15000),
          stream: typeof raw.stream === "boolean" ? raw.stream : (prev?.stream ?? false),
          overrideContextBudget:
            typeof raw.overrideContextBudget === "boolean"
              ? raw.overrideContextBudget
              : (prev?.overrideContextBudget ?? false),
          maxPrefixChars:
            typeof raw.maxPrefixChars === "number" && Number.isFinite(raw.maxPrefixChars)
              ? raw.maxPrefixChars
              : (prev?.maxPrefixChars ?? 8000),
          maxSuffixChars:
            typeof raw.maxSuffixChars === "number" && Number.isFinite(raw.maxSuffixChars)
              ? raw.maxSuffixChars
              : (prev?.maxSuffixChars ?? 2000),
        };
        const pErrors = validateProfileValues(merged, nextGlobal, {
          requireBaseUrl: false,
          requireModel: false,
        });
        for (const pe of pErrors) {
          if (!errors.includes(pe)) errors.push(pe);
        }
        mergedProfiles.push(merged);
      }
      const nextIds = new Set(mergedProfiles.map((p) => p.id));
      removedIds = existing.filter((p) => !nextIds.has(p.id)).map((p) => p.id);
      if (mergedProfiles.length === 0) {
        nextActiveId = "";
      } else {
        const requestedActive =
          typeof payload.activeProfileId === "string" ? payload.activeProfileId : "";
        const currentActive = await getActiveProfileId(this.context);
        nextActiveId =
          (requestedActive && nextIds.has(requestedActive) ? requestedActive : "") ||
          (currentActive && nextIds.has(currentActive) ? currentActive : "") ||
          mergedProfiles[0]!.id;
      }
    }

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    await saveGlobalPrefs(this.context, globalPatch);
    if (mergedProfiles !== undefined) {
      await saveProfiles(this.context, mergedProfiles, nextActiveId);
      for (const oldId of removedIds) {
        await clearApiKey(this.context.secrets, oldId);
      }
    }
    await this.onSettingsChanged?.();
    return { ok: true, errors: [] };
  }

  private async importSettings(
    payload: unknown,
  ): Promise<{ ok: boolean; errors: string[] }> {
    if (!isPlainObject(payload) || typeof payload.json !== "string" || !payload.json.trim()) {
      return { ok: false, errors: ["import payload must include non-empty json string"] };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(payload.json);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      return { ok: false, errors: [`invalid JSON: ${reason}`] };
    }

    if (!isPlainObject(parsed)) {
      return { ok: false, errors: ["settings JSON must be an object"] };
    }

    const typeErrors = validateGlobalInputTypes(parsed);
    if (typeErrors.length > 0) {
      return { ok: false, errors: typeErrors };
    }

    const currentGlobal = getGlobalPrefs(this.context);
    const globalPatch = extractGlobalPatch(parsed);
    const nextGlobal = mergeGlobalPrefs(currentGlobal, globalPatch);
    const errors = validateGlobalBounds(nextGlobal);

    let importedProfiles: StoredProfile[] | undefined;
    let remappedActiveId = "";

    if (Array.isArray(parsed.profiles)) {
      importedProfiles = [];
      const idMap = new Map<string, string>();
      const usedNames: string[] = [];

      for (let i = 0; i < parsed.profiles.length; i++) {
        const raw = parsed.profiles[i];
        if (!isPlainObject(raw)) {
          errors.push(`profiles[${i}] must be an object`);
          continue;
        }
        // Security (P0-6): always regenerate fresh UUIDs, strip secrets & header overrides,
        // and NEVER merge from existing local profiles.
        const newId = randomUUID();
        if (typeof raw.id === "string" && raw.id.trim()) {
          idMap.set(raw.id, newId);
        }
        const preferredName =
          typeof raw.name === "string" && raw.name.trim()
            ? raw.name.trim()
            : DEFAULT_NEW_PROFILE_NAME;
        const name = uniqueName(preferredName, usedNames);
        usedNames.push(name);

        const profile: StoredProfile = {
          id: newId,
          name,
          provider: typeof raw.provider === "string" ? raw.provider : "openai-compatible",
          baseUrl: typeof raw.baseUrl === "string" ? raw.baseUrl : "",
          model: typeof raw.model === "string" ? raw.model : "",
          authHeaderTemplate: DEFAULT_AUTH_HEADER_TEMPLATE,
          extraHeadersJson: "{}",
          extraBodyJson: typeof raw.extraBodyJson === "string" ? raw.extraBodyJson : "",
          stopSequences: typeof raw.stopSequences === "string" ? raw.stopSequences : "",
          fimPath: typeof raw.fimPath === "string" ? raw.fimPath : "",
          chatPath: typeof raw.chatPath === "string" ? raw.chatPath : "/chat/completions",
          completionsPath: typeof raw.completionsPath === "string" ? raw.completionsPath : "",
          responsesPath: typeof raw.responsesPath === "string" ? raw.responsesPath : "",
          promptTemplate: typeof raw.promptTemplate === "string" ? raw.promptTemplate : "AUTO",
          temperature:
            typeof raw.temperature === "number" && Number.isFinite(raw.temperature)
              ? raw.temperature
              : 0,
          maxTokens:
            typeof raw.maxTokens === "number" && Number.isFinite(raw.maxTokens)
              ? raw.maxTokens
              : 128,
          timeoutMs:
            typeof raw.timeoutMs === "number" && Number.isFinite(raw.timeoutMs)
              ? raw.timeoutMs
              : 3000,
          settingsTimeoutMs:
            typeof raw.settingsTimeoutMs === "number" && Number.isFinite(raw.settingsTimeoutMs)
              ? raw.settingsTimeoutMs
              : 15000,
          stream: typeof raw.stream === "boolean" ? raw.stream : false,
          overrideContextBudget:
            typeof raw.overrideContextBudget === "boolean" ? raw.overrideContextBudget : false,
          maxPrefixChars:
            typeof raw.maxPrefixChars === "number" && Number.isFinite(raw.maxPrefixChars)
              ? raw.maxPrefixChars
              : 8000,
          maxSuffixChars:
            typeof raw.maxSuffixChars === "number" && Number.isFinite(raw.maxSuffixChars)
              ? raw.maxSuffixChars
              : 2000,
        };
        const pErrors = validateProfileValues(profile, nextGlobal, {
          requireBaseUrl: false,
          requireModel: false,
        });
        for (const pe of pErrors) {
          if (!errors.includes(pe)) errors.push(pe);
        }
        importedProfiles.push(profile);
      }

      if (importedProfiles.length > 0) {
        const rawActive = typeof parsed.activeProfileId === "string" ? parsed.activeProfileId : "";
        remappedActiveId = (rawActive ? idMap.get(rawActive) : undefined) ?? importedProfiles[0]!.id;
      } else {
        remappedActiveId = "";
      }
    }

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    const previousProfiles = importedProfiles !== undefined ? await ensureProfiles(this.context) : [];
    await saveGlobalPrefs(this.context, globalPatch);
    if (importedProfiles !== undefined) {
      await saveProfiles(this.context, importedProfiles, remappedActiveId);
      // Clean up all orphan SecretStorage keys belonging to replaced/removed local profiles.
      for (const old of previousProfiles) {
        await clearApiKey(this.context.secrets, old.id);
      }
    }
    await this.onSettingsChanged?.();
    return { ok: true, errors: [] };
  }

  private async resolveForProbe(
    payload: unknown,
    opts: { requireModel: boolean },
  ) {
    const profileId = isPlainObject(payload) && typeof payload.profileId === "string"
      ? payload.profileId
      : undefined;
    const { profile, providerConfig, global } = await resolveProfileForOperation(
      this.context,
      profileId,
    );
    if (!profile || !providerConfig) {
      throw new Error(profileId ? `Profile not found: ${profileId}` : "No active profile configured");
    }
    const errors = validateProfileValues(profile, global, {
      requireBaseUrl: true,
      requireModel: opts.requireModel,
    });
    if (errors.length > 0) {
      throw new Error(errors.join("; "));
    }
    return { profile, providerConfig, global };
  }

  private createHttpLogger(configuredLevel: string): (event: HttpLogEvent) => void {
    return (event: HttpLogEvent) => {
      if (!this.appendLogFn) return;
      const entry: LogEntry = {
        time: new Date().toISOString(),
        level: event.level,
        operation: event.operation,
        method: event.method,
        url: event.url,
        model: event.model,
        requestStyle: event.requestStyle,
        status: event.status,
        latencyMs: event.latencyMs,
        responseChars: event.responseChars,
        message: event.message,
        error: event.error,
      };
      this.appendLogFn(entry, configuredLevel);
    };
  }

  private async testConnection(payload: unknown) {
    const { providerConfig: cfg, global } = await this.resolveForProbe(payload, {
      requireModel: true,
    });
    const template = resolveTemplateForConfig(cfg);
    const resolvedPath = pathFor(template, cfg);
    const resolvedUrl = redactUrl(resolveUrl(template, cfg));
    const client = new HttpCompletionClient(
      cfg,
      "connection_test",
      this.createHttpLogger(global.logLevel),
      this.fetchImpl,
    );
    const started = Date.now();
    try {
      const resp = await client.testConnection();
      const isEmpty = !resp.text.trim();
      return {
        template,
        status: isEmpty ? "EMPTY" : "SUCCESS",
        httpStatus: resp.rawStatus ?? null,
        latencyMs: Date.now() - started,
        preview: resp.text.replace(/\n/g, " ").trim().slice(0, 80),
        error: isEmpty ? (resp.emptyReason || "empty completion") : undefined,
        resolvedPath,
        resolvedUrl,
      };
    } catch (e) {
      const httpStatus = e instanceof HttpStatusError ? e.status : extractStatus(e);
      return {
        template,
        status: "FAILED",
        httpStatus,
        latencyMs: Date.now() - started,
        error: redactSecrets(e instanceof Error ? e.message : String(e), cfg.apiKey),
        resolvedPath,
        resolvedUrl,
      };
    }
  }

  private async probeTemplate(payload: unknown) {
    const p = isPlainObject(payload) ? payload : {};
    const { providerConfig: cfg, global } = await this.resolveForProbe(p, {
      requireModel: true,
    });
    const client = new HttpCompletionClient(
      cfg,
      "template_probe",
      this.createHttpLogger(global.logLevel),
      this.fetchImpl,
    );
    const template = (typeof p.template === "string" && p.template ? p.template : "AUTO") as PromptTemplateId;
    return client.probeTemplate(template);
  }

  private async probeAll(payload: unknown) {
    const { providerConfig: cfg, global } = await this.resolveForProbe(payload, {
      requireModel: true,
    });
    const client = new HttpCompletionClient(
      cfg,
      "template_probe_all",
      this.createHttpLogger(global.logLevel),
      this.fetchImpl,
    );
    return { results: await client.probeAllTemplates() };
  }

  private async listModels(payload: unknown) {
    const { providerConfig: cfg, global } = await this.resolveForProbe(payload, {
      requireModel: false,
    });
    const client = new HttpCompletionClient(
      cfg,
      "list_models",
      this.createHttpLogger(global.logLevel),
      this.fetchImpl,
    );
    return { models: await client.listModels() };
  }

  private ok(req: BridgeMessage, type: string, payload: unknown): BridgeMessage {
    return { v: 1, id: req.id, type, ok: true, payload };
  }

  private fail(req: BridgeMessage, error: string): BridgeMessage {
    return { v: 1, id: req.id, type: req.type, ok: false, error };
  }

  private failWithPayload(
    req: BridgeMessage,
    type: string,
    error: string,
    payload: unknown,
  ): BridgeMessage {
    return { v: 1, id: req.id, type, ok: false, error, payload };
  }
}

void (0 as unknown as LogBuffer | undefined);

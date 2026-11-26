import type { LogEntry, ProbeResult, Profile, SessionStats, Snapshot } from "../types";

export type BridgeRequest = {
  v: 1;
  id: string;
  type: string;
  payload?: unknown;
};

export type BridgeResponse = {
  v: 1;
  id: string;
  type: string;
  ok: boolean;
  payload?: unknown;
  error?: string;
};

type Pending = {
  resolve: (r: BridgeResponse) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

declare global {
  interface Window {
    acquireVsCodeApi?: () => { postMessage: (msg: unknown) => void };
    __autoCompleteBridge?: {
      postMessage: (msg: unknown) => void;
      onMessage?: (handler: (msg: BridgeResponse) => void) => void;
    };
    __autoCompleteReceive?: (msg: BridgeResponse) => void;
    cefQuery?: (req: {
      request: string;
      onSuccess: (r: string) => void;
      onFailure: (c: number, m: string) => void;
    }) => void;
  }
}

const DEFAULT_AUTH_HEADER = "Authorization: Bearer ${apiKey}";

const MOCK_PRESETS: Record<
  string,
  Partial<Pick<Profile, "baseUrl" | "promptTemplate" | "fimPath" | "chatPath" | "completionsPath">>
> = {
  ollama: {
    baseUrl: "http://127.0.0.1:11434/v1",
    promptTemplate: "AUTO",
    fimPath: "",
    chatPath: "/chat/completions",
    completionsPath: "",
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com/beta",
    promptTemplate: "CODESTRAL_API",
    fimPath: "/completions",
    chatPath: "/chat/completions",
    completionsPath: "",
  },
  mistral: {
    baseUrl: "https://codestral.mistral.ai/v1",
    promptTemplate: "CODESTRAL_API",
    fimPath: "/fim/completions",
    chatPath: "/chat/completions",
    completionsPath: "",
  },
  vllm: {
    baseUrl: "http://127.0.0.1:8000/v1",
    promptTemplate: "AUTO",
    fimPath: "",
    chatPath: "/chat/completions",
    completionsPath: "",
  },
};

function stripPortableProfileFields(raw: Profile & Record<string, unknown>): Profile {
  const {
    apiKey: _apiKey,
    hasApiKey: _hasApiKey,
    authHeaderTemplate: _auth,
    extraHeadersJson: _headers,
    ...rest
  } = raw;
  return rest as Profile;
}

/**
 * Transport is resolved per call so JCEF can inject `window.cefQuery` after the
 * document starts loading (inject-on-loadEnd races with app bootstrap).
 */
export class BridgeClient {
  private pending = new Map<string, Pending>();
  private seq = 0;
  private pushHandlers = new Set<(msg: BridgeResponse) => void>();
  private vscodeApi: { postMessage: (msg: unknown) => void } | null = null;
  private mode: "vscode" | "dynamic" = "dynamic";
  private messageListener: ((ev: MessageEvent) => void) | null = null;

  constructor(private readonly timeoutMs = 120_000) {
    if (typeof window !== "undefined" && window.acquireVsCodeApi) {
      this.vscodeApi = window.acquireVsCodeApi();
      this.mode = "vscode";
      this.messageListener = (ev: MessageEvent) => {
        this.onIncoming(ev.data as BridgeResponse);
      };
      window.addEventListener("message", this.messageListener);
    } else if (typeof window !== "undefined") {
      window.__autoCompleteReceive = (msg) => this.onIncoming(msg);
    }
  }

  onPush(handler: (msg: BridgeResponse) => void): () => void {
    this.pushHandlers.add(handler);
    return () => this.pushHandlers.delete(handler);
  }

  request(type: string, payload?: unknown): Promise<BridgeResponse> {
    const id = String(++this.seq);
    const msg: BridgeRequest = { v: 1, id, type, payload };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`bridge timeout: ${type}`));
        }
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.dispatch(msg);
    });
  }

  /** Test/cleanup helper: cancel pending timers and detach listeners. */
  dispose(): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
    }
    this.pending.clear();
    this.pushHandlers.clear();
    if (typeof window !== "undefined" && this.messageListener) {
      window.removeEventListener("message", this.messageListener);
      this.messageListener = null;
    }
  }

  private dispatch(msg: BridgeRequest): void {
    if (this.mode === "vscode" && this.vscodeApi) {
      this.vscodeApi.postMessage(msg);
      return;
    }
    if (typeof window !== "undefined" && typeof window.cefQuery === "function") {
      window.cefQuery({
        request: JSON.stringify(msg),
        onSuccess: (raw) => {
          try {
            this.onIncoming(JSON.parse(raw) as BridgeResponse);
          } catch {
            this.onIncoming({
              v: 1,
              id: msg.id,
              type: msg.type,
              ok: false,
              error: "invalid bridge JSON response",
            });
          }
        },
        onFailure: (_c, m) => {
          this.onIncoming({
            v: 1,
            id: msg.id,
            type: msg.type,
            ok: false,
            error: m || "cefQuery failed",
          });
        },
      });
      return;
    }
    if (typeof window !== "undefined" && window.__autoCompleteBridge) {
      window.__autoCompleteBridge.postMessage(msg);
      return;
    }
    // Browser dev / no host yet
    void mockHandle(msg).then((r) => this.onIncoming(r));
  }

  private onIncoming(msg: BridgeResponse): void {
    if (!msg || msg.v !== 1) return;
    if (msg.id && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      p.resolve(msg);
      return;
    }
    for (const h of this.pushHandlers) h(msg);
  }
}

function createInitialMockState(): Snapshot & { profiles: Profile[] } {
  return {
    schemaVersion: 1,
    enabled: true,
    autoTrigger: true,
    activeProfileId: "default",
    profiles: [
      {
        id: "default",
        name: "Default",
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "qwen2.5-coder:7b",
        promptTemplate: "AUTO",
        maxTokens: 128,
        timeoutMs: 3000,
        settingsTimeoutMs: 15000,
        temperature: 0,
        stream: false,
        hasApiKey: false,
        authHeaderTemplate: DEFAULT_AUTH_HEADER,
        fimPath: "",
        chatPath: "/chat/completions",
        completionsPath: "",
        extraHeadersJson: "{}",
        extraBodyJson: "",
        stopSequences: "",
        overrideContextBudget: false,
        maxPrefixChars: 8000,
        maxSuffixChars: 2000,
      },
    ],
    logLevel: "info",
    uiTheme: "auto",
    uiLocale: "auto",
    enableInComments: true,
    enableInStrings: true,
    firstLineOnlyWhenMidLine: true,
    sendFilePath: true,
    showStatusBar: true,
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
    debounceMinMs: 150,
    debounceInitialMs: 300,
    debounceMaxMs: 1000,
    maxPrefixChars: 8000,
    maxSuffixChars: 2000,
    maxInFlight: 1,
    cacheSize: 20,
    lruSize: 64,
    maxFileSizeKb: 512,
    enableRecentFileContext: false,
    recentFileLimit: 3,
    recentFileMaxChars: 1200,
    logPromptBodies: false,
    logRetention: 1000,
    notifyOnFatalError: true,
    showCostApprox: false,
  };
}

let mockState = createInitialMockState();
let mockLogs: LogEntry[] = [];
let mockStats: SessionStats = {
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

/** Reset in-memory mock state (for unit tests). */
export function resetMockBridgeState(): void {
  mockState = createInitialMockState();
  mockLogs = [];
  mockStats = {
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
}

async function mockHandle(msg: BridgeRequest): Promise<BridgeResponse> {
  await new Promise((r) => setTimeout(r, 10));
  switch (msg.type) {
    case "getSnapshot":
      return { v: 1, id: msg.id, type: "snapshot", ok: true, payload: structuredClone(mockState) };
    case "getPlatform":
      return {
        v: 1,
        id: msg.id,
        type: "platform",
        ok: true,
        payload: {
          platform: "mock",
          locale: typeof navigator !== "undefined" ? navigator.language : "en",
          theme: "dark",
        },
      };
    case "applySettings": {
      const data = (msg.payload ?? {}) as Snapshot;
      const incomingProfiles = Array.isArray(data.profiles)
        ? data.profiles.map((p) => {
            const existing = mockState.profiles.find((x) => x.id === p.id);
            return { ...existing, ...p, hasApiKey: existing?.hasApiKey ?? false };
          })
        : mockState.profiles;
      mockState = { ...mockState, ...data, profiles: incomingProfiles };
      if (typeof data.debounceInitialMs === "number") {
        mockStats.currentDebounceMs = data.debounceInitialMs;
      }
      return { v: 1, id: msg.id, type: "applyResult", ok: true, payload: { ok: true, errors: [] } };
    }
    case "createProfile": {
      const payload = (msg.payload ?? {}) as { name?: string; preset?: string };
      const id = crypto.randomUUID();
      const existingNames = mockState.profiles.map((p) => p.name);
      const baseName = payload.name?.trim() || "New profile";
      let name = baseName;
      let n = 2;
      while (existingNames.includes(name)) {
        name = `${baseName} ${n++}`;
      }
      const presetKey = payload.preset?.trim().toLowerCase() ?? "";
      const presetFields = presetKey ? MOCK_PRESETS[presetKey] ?? {} : {};
      const profile: Profile = {
        id,
        name,
        baseUrl: "",
        model: "",
        promptTemplate: "AUTO",
        maxTokens: 128,
        timeoutMs: 3000,
        settingsTimeoutMs: 15000,
        temperature: 0,
        stream: false,
        hasApiKey: false,
        authHeaderTemplate: DEFAULT_AUTH_HEADER,
        fimPath: "",
        chatPath: "/chat/completions",
        completionsPath: "",
        extraHeadersJson: "{}",
        extraBodyJson: "",
        stopSequences: "",
        overrideContextBudget: false,
        maxPrefixChars: 8000,
        maxSuffixChars: 2000,
        ...presetFields,
      };
      mockState.profiles.push(profile);
      mockState.activeProfileId = id;
      return { v: 1, id: msg.id, type: "snapshot", ok: true, payload: structuredClone(mockState) };
    }
    case "deleteProfile": {
      const { profileId } = (msg.payload ?? {}) as { profileId: string };
      mockState.profiles = mockState.profiles.filter((p) => p.id !== profileId);
      if (mockState.activeProfileId === profileId) {
        mockState.activeProfileId = mockState.profiles[0]?.id ?? "";
      }
      return { v: 1, id: msg.id, type: "snapshot", ok: true, payload: structuredClone(mockState) };
    }
    case "selectProfile": {
      const { profileId } = (msg.payload ?? {}) as { profileId: string };
      if (mockState.profiles.some((p) => p.id === profileId)) mockState.activeProfileId = profileId;
      return { v: 1, id: msg.id, type: "snapshot", ok: true, payload: structuredClone(mockState) };
    }
    case "renameProfile": {
      const { profileId, name } = (msg.payload ?? {}) as { profileId: string; name: string };
      const p = mockState.profiles.find((x) => x.id === profileId);
      if (p && name?.trim()) p.name = name.trim();
      return { v: 1, id: msg.id, type: "snapshot", ok: true, payload: structuredClone(mockState) };
    }
    case "setSecret": {
      const { profileId, secret } = (msg.payload ?? {}) as { profileId: string; secret?: string };
      const p = mockState.profiles.find((x) => x.id === profileId);
      const hasApiKey = Boolean(secret?.trim());
      if (p) p.hasApiKey = hasApiKey;
      return {
        v: 1,
        id: msg.id,
        type: "secretResult",
        ok: true,
        payload: { profileId, hasApiKey },
      };
    }
    case "clearSecret": {
      const { profileId } = (msg.payload ?? {}) as { profileId: string };
      const p = mockState.profiles.find((x) => x.id === profileId);
      if (p) p.hasApiKey = false;
      return {
        v: 1,
        id: msg.id,
        type: "secretResult",
        ok: true,
        payload: { profileId, hasApiKey: false },
      };
    }
    case "testConnection": {
      const result: ProbeResult = {
        status: "FAILED",
        httpStatus: null,
        latencyMs: 12,
        resolvedPath: "/chat/completions",
        error: "mock: no backend",
      };
      return {
        v: 1,
        id: msg.id,
        type: "probeResult",
        ok: true,
        payload: result,
      };
    }
    case "listModels":
      return {
        v: 1,
        id: msg.id,
        type: "modelsResult",
        ok: true,
        payload: {
          models: [
            { id: "qwen2.5-coder:7b", contextLength: 32768 },
            { id: "codestral-latest", contextLength: 262144 },
            { id: "deepseek-coder", contextLength: 131072 },
          ],
        },
      };
    case "probeTemplate": {
      const template = (msg.payload as { template?: string } | undefined)?.template || "AUTO";
      const result: ProbeResult = {
        template,
        status: "FAILED",
        httpStatus: null,
        latencyMs: 5,
        resolvedPath: "/chat/completions",
        error: "mock: no backend",
      };
      return {
        v: 1,
        id: msg.id,
        type: "probeResult",
        ok: true,
        payload: result,
      };
    }
    case "probeAllTemplates":
      return {
        v: 1,
        id: msg.id,
        type: "probeAllResult",
        ok: true,
        payload: {
          results: [
            {
              template: "CODESTRAL_API",
              status: "FAILED",
              httpStatus: null,
              latencyMs: 5,
              resolvedPath: "/fim/completions",
              error: "mock: no backend",
            },
            {
              template: "CHAT",
              status: "FAILED",
              httpStatus: null,
              latencyMs: 7,
              resolvedPath: "/chat/completions",
              error: "mock: no backend",
            },
          ] satisfies ProbeResult[],
        },
      };
    case "subscribeLogs": {
      const limit = Math.min(
        Math.max(1, (msg.payload as { limit?: number } | undefined)?.limit ?? 1000),
        2000,
      );
      return {
        v: 1,
        id: msg.id,
        type: "logSubscribed",
        ok: true,
        payload: { entries: structuredClone(mockLogs.slice(-limit)) },
      };
    }
    case "unsubscribeLogs":
      return {
        v: 1,
        id: msg.id,
        type: "logUnsubscribed",
        ok: true,
        payload: { ok: true },
      };
    case "clearLogs":
      mockLogs = [];
      return {
        v: 1,
        id: msg.id,
        type: "logsCleared",
        ok: true,
        payload: { ok: true },
      };
    case "getSessionStats":
      return {
        v: 1,
        id: msg.id,
        type: "sessionStats",
        ok: true,
        payload: { ...mockStats },
      };
    case "clearCaches":
      mockStats = {
        ...mockStats,
        backoffBlocked: false,
        backoffFatal: false,
      };
      return {
        v: 1,
        id: msg.id,
        type: "cachesCleared",
        ok: true,
        payload: { ok: true },
      };
    case "copyToClipboard": {
      const text = (msg.payload as { text?: string } | undefined)?.text ?? "";
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          return {
            v: 1,
            id: msg.id,
            type: "copyResult",
            ok: true,
            payload: { copied: true },
          };
        } catch (e) {
          return {
            v: 1,
            id: msg.id,
            type: "copyResult",
            ok: false,
            error: e instanceof Error ? e.message : "clipboard write failed",
          };
        }
      }
      return {
        v: 1,
        id: msg.id,
        type: "copyResult",
        ok: true,
        payload: { copied: true },
      };
    }
    case "exportSettings": {
      const { profiles, ...rest } = mockState;
      const clean = {
        ...rest,
        profiles: profiles.map((p) => stripPortableProfileFields(p as Profile & Record<string, unknown>)),
      };
      return {
        v: 1,
        id: msg.id,
        type: "exportResult",
        ok: true,
        payload: { json: JSON.stringify(clean, null, 2) },
      };
    }
    case "importSettings": {
      try {
        const { json } = (msg.payload ?? {}) as { json: string };
        const parsed = JSON.parse(json) as Snapshot & { profiles?: Array<Profile & Record<string, unknown>> };
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("settings JSON must be an object");
        }
        if (Array.isArray(parsed.profiles)) {
          const idMap = new Map<string, string>();
          const profiles: Profile[] = parsed.profiles.map((raw) => {
            const cleaned = stripPortableProfileFields(raw);
            const newId = crypto.randomUUID();
            if (cleaned.id) idMap.set(cleaned.id, newId);
            return {
              ...cleaned,
              id: newId,
              name: cleaned.name?.trim() || "Profile",
              hasApiKey: false,
              authHeaderTemplate: DEFAULT_AUTH_HEADER,
              extraHeadersJson: "{}",
            };
          });
          const mappedActive =
            (parsed.activeProfileId ? idMap.get(parsed.activeProfileId) : undefined) ??
            profiles[0]?.id ??
            "";
          mockState = {
            ...mockState,
            ...parsed,
            profiles,
            activeProfileId: mappedActive,
          };
        } else {
          mockState = { ...mockState, ...parsed };
        }
        return { v: 1, id: msg.id, type: "applyResult", ok: true, payload: { ok: true } };
      } catch (e) {
        return {
          v: 1,
          id: msg.id,
          type: "applyResult",
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }
    case "openExternal": {
      const url = (msg.payload as { url?: string } | undefined)?.url?.trim() ?? "";
      if (!/^https?:\/\//i.test(url)) {
        return {
          v: 1,
          id: msg.id,
          type: "openExternalResult",
          ok: false,
          error: "invalid url",
        };
      }
      try {
        if (typeof window !== "undefined") {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      } catch {
        /* ignore */
      }
      return {
        v: 1,
        id: msg.id,
        type: "openExternalResult",
        ok: true,
        payload: { ok: true, url },
      };
    }
    case "openKeymap":
      return {
        v: 1,
        id: msg.id,
        type: "openKeymapResult",
        ok: true,
        payload: { ok: true, mock: true },
      };
    default:
      return { v: 1, id: msg.id, type: msg.type, ok: true, payload: { ok: true } };
  }
}

export const bridge = new BridgeClient();

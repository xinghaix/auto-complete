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

  constructor() {
    if (typeof window !== "undefined" && window.acquireVsCodeApi) {
      this.vscodeApi = window.acquireVsCodeApi();
      this.mode = "vscode";
      window.addEventListener("message", (ev) => {
        this.onIncoming(ev.data as BridgeResponse);
      });
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
      this.pending.set(id, { resolve, reject });
      this.dispatch(msg);
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`bridge timeout: ${type}`));
        }
      }, 120_000);
    });
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
            /* ignore */
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
      p.resolve(msg);
      return;
    }
    for (const h of this.pushHandlers) h(msg);
  }
}

let mockState = {
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
      authHeaderTemplate: "Authorization: Bearer ${apiKey}",
      fimPath: "",
      chatPath: "/chat/completions",
      completionsPath: "",
      extraHeadersJson: "{}",
      overrideContextBudget: false,
      maxPrefixChars: 8000,
      maxSuffixChars: 2000,
    },
  ],
  logLevel: "info",
  uiTheme: "auto" as "auto" | "light" | "dark",
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

async function mockHandle(msg: BridgeRequest): Promise<BridgeResponse> {
  await new Promise((r) => setTimeout(r, 20));
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
      const data = msg.payload as typeof mockState;
      mockState = { ...mockState, ...data, profiles: data.profiles ?? mockState.profiles };
      return { v: 1, id: msg.id, type: "applyResult", ok: true, payload: { ok: true, errors: [] } };
    }
    case "createProfile": {
      const id = crypto.randomUUID();
      const names = mockState.profiles.map((p) => p.name);
      let name = "新配置";
      let n = 2;
      while (names.includes(name)) {
        name = `新配置 ${n++}`;
      }
      mockState.profiles.push({
        id,
        name,
        baseUrl: "",
        model: "",
        promptTemplate: "AUTO",
        maxTokens: 128,
        timeoutMs: 3000,
        hasApiKey: false,
      } as (typeof mockState.profiles)[0]);
      mockState.activeProfileId = id;
      return { v: 1, id: msg.id, type: "snapshot", ok: true, payload: structuredClone(mockState) };
    }
    case "deleteProfile": {
      const { profileId } = msg.payload as { profileId: string };
      mockState.profiles = mockState.profiles.filter((p) => p.id !== profileId);
      if (mockState.activeProfileId === profileId) {
        mockState.activeProfileId = mockState.profiles[0]?.id ?? "";
      }
      return { v: 1, id: msg.id, type: "snapshot", ok: true, payload: structuredClone(mockState) };
    }
    case "selectProfile": {
      const { profileId } = msg.payload as { profileId: string };
      if (mockState.profiles.some((p) => p.id === profileId)) mockState.activeProfileId = profileId;
      return { v: 1, id: msg.id, type: "snapshot", ok: true, payload: structuredClone(mockState) };
    }
    case "renameProfile": {
      const { profileId, name } = msg.payload as { profileId: string; name: string };
      const p = mockState.profiles.find((x) => x.id === profileId);
      if (p) p.name = name.trim() || p.name;
      return { v: 1, id: msg.id, type: "snapshot", ok: true, payload: structuredClone(mockState) };
    }
    case "setSecret": {
      const { profileId } = msg.payload as { profileId: string };
      const p = mockState.profiles.find((x) => x.id === profileId);
      if (p) p.hasApiKey = true;
      return { v: 1, id: msg.id, type: "secretResult", ok: true, payload: { ok: true, hasApiKey: true } };
    }
    case "clearSecret": {
      const { profileId } = msg.payload as { profileId: string };
      const p = mockState.profiles.find((x) => x.id === profileId);
      if (p) p.hasApiKey = false;
      return { v: 1, id: msg.id, type: "secretResult", ok: true, payload: { ok: true } };
    }
    case "testConnection":
      return {
        v: 1,
        id: msg.id,
        type: "probeResult",
        ok: true,
        payload: { status: "FAILED", latencyMs: 12, error: "mock: no backend" },
      };
    case "listModels":
      return {
        v: 1,
        id: msg.id,
        type: "modelsResult",
        ok: true,
        payload: {
          models: [
            { id: "qwen2.5-coder:7b", contextLength: 32768 },
            { id: "codestral-latest" },
            { id: "deepseek-coder" },
          ],
        },
      };
    case "probeTemplate":
    case "probeAllTemplates":
      return {
        v: 1,
        id: msg.id,
        type: "probeAllResult",
        ok: true,
        payload: {
          results: [{ template: "CHAT", status: "FAILED", latencyMs: 5, error: "mock" }],
        },
      };
    case "exportSettings":
      return {
        v: 1,
        id: msg.id,
        type: "exportResult",
        ok: true,
        payload: { json: JSON.stringify(mockState, null, 2) },
      };
    case "importSettings": {
      try {
        const { json } = msg.payload as { json: string };
        const parsed = JSON.parse(json) as typeof mockState;
        if (parsed.profiles) {
          mockState = { ...mockState, ...parsed };
          for (const p of mockState.profiles) p.hasApiKey = false;
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
    default:
      return { v: 1, id: msg.id, type: msg.type, ok: true, payload: { ok: true } };
  }
}

export const bridge = new BridgeClient();

import * as vscode from "vscode";
import { HttpCompletionClient, type LogEntry, type PromptTemplateId } from "@auto-complete/core-ts";
import {
  buildEngineSettings,
  clearApiKey,
  createProfile,
  deleteProfile,
  ensureProfiles,
  getActiveProfile,
  getActiveProfileId,
  hasApiKey,
  renameProfile,
  saveGlobalPrefs,
  saveProfiles,
  selectProfile,
  setApiKey,
  toSnapshot,
  type StoredProfile,
} from "../config/settings";

export type BridgeMessage = {
  v: 1;
  id: string;
  type: string;
  payload?: unknown;
  ok?: boolean;
  error?: string;
};

export class VsCodeUiBridge {
  private logListeners = new Set<(entries: LogEntry[]) => void>();
  private pendingBatch: LogEntry[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private context: vscode.ExtensionContext,
    private getLogs: () => LogEntry[],
    private clearLogsFn: () => void,
    private onSettingsChanged?: () => void | Promise<void>,
  ) {}

  async handle(msg: BridgeMessage): Promise<BridgeMessage> {
    try {
      switch (msg.type) {
        case "getSnapshot":
          return this.ok(msg, "snapshot", await toSnapshot(this.context));
        case "applySettings":
          return this.ok(msg, "applyResult", await this.applySettings(msg.payload));
        case "createProfile":
          await createProfile(this.context);
          await this.onSettingsChanged?.();
          return this.ok(msg, "snapshot", await toSnapshot(this.context));
        case "deleteProfile": {
          const { profileId } = msg.payload as { profileId: string };
          await deleteProfile(this.context, profileId);
          await this.onSettingsChanged?.();
          return this.ok(msg, "snapshot", await toSnapshot(this.context));
        }
        case "selectProfile": {
          const { profileId } = msg.payload as { profileId: string };
          await selectProfile(this.context, profileId);
          await this.onSettingsChanged?.();
          return this.ok(msg, "snapshot", await toSnapshot(this.context));
        }
        case "renameProfile": {
          const { profileId, name } = msg.payload as { profileId: string; name: string };
          await renameProfile(this.context, profileId, name);
          await this.onSettingsChanged?.();
          return this.ok(msg, "snapshot", await toSnapshot(this.context));
        }
        case "setSecret": {
          const { profileId, secret } = msg.payload as { profileId: string; secret: string };
          await setApiKey(this.context.secrets, profileId, secret ?? "");
          await this.onSettingsChanged?.();
          return this.ok(msg, "secretResult", {
            ok: true,
            hasApiKey: await hasApiKey(this.context.secrets, profileId),
          });
        }
        case "clearSecret": {
          const { profileId } = msg.payload as { profileId: string };
          await clearApiKey(this.context.secrets, profileId);
          await this.onSettingsChanged?.();
          return this.ok(msg, "secretResult", { ok: true });
        }
        case "testConnection":
          return this.ok(msg, "probeResult", await this.testConnection(msg.payload));
        case "probeTemplate":
          return this.ok(msg, "probeResult", await this.probeTemplate(msg.payload));
        case "probeAllTemplates":
          return this.ok(msg, "probeAllResult", await this.probeAll(msg.payload));
        case "listModels":
          return this.ok(msg, "modelsResult", await this.listModels(msg.payload));
        case "subscribeLogs":
          return this.ok(msg, "logSubscribed", {
            ok: true,
            entries: this.getLogs().slice(-200),
          });
        case "unsubscribeLogs":
          // Host keeps push wiring for the open panel; no-op is enough for protocol parity.
          return this.ok(msg, "logUnsubscribed", { ok: true });
        case "clearLogs":
          this.clearLogsFn();
          return this.ok(msg, "logsCleared", { ok: true });
        case "getLogLevel":
          return this.ok(msg, "logLevel", {
            level: vscode.workspace.getConfiguration("autoComplete").get("logLevel", "info"),
          });
        case "getPlatform":
          return this.ok(msg, "platform", {
            platform: "vscode",
            // VS Code display language: e.g. zh-cn, ja, ko, en
            locale: vscode.env.language,
            theme: vscodeThemeKind(),
          });
        case "exportSettings": {
          const snap = await toSnapshot(this.context);
          // strip hasApiKey noise is fine; never include secrets
          const clean = {
            ...snap,
            profiles: snap.profiles.map(({ hasApiKey: _h, ...rest }) => rest),
          };
          return this.ok(msg, "exportResult", { json: JSON.stringify(clean, null, 2) });
        }
        case "importSettings":
          return this.ok(msg, "applyResult", await this.importSettings(msg.payload));
        case "openExternal": {
          const url = (msg.payload as { url?: string } | undefined)?.url?.trim() ?? "";
          if (!/^https?:\/\//i.test(url)) {
            return this.fail(msg, "invalid url");
          }
          await vscode.env.openExternal(vscode.Uri.parse(url));
          return this.ok(msg, "openExternalResult", { ok: true, url });
        }
        case "openKeymap": {
          // Focus Keyboard Shortcuts on the manual trigger command.
          await vscode.commands.executeCommand(
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
    this.pendingBatch.push(entry);
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        const batch = this.pendingBatch;
        this.pendingBatch = [];
        this.batchTimer = null;
        for (const l of this.logListeners) l(batch);
      }, 150);
    }
  }

  onLogBatch(listener: (entries: LogEntry[]) => void): vscode.Disposable {
    this.logListeners.add(listener);
    return new vscode.Disposable(() => this.logListeners.delete(listener));
  }

  private async applySettings(payload: unknown) {
    const data = payload as Record<string, unknown>;
    const num = (v: unknown): number | undefined =>
      typeof v === "number" && Number.isFinite(v) ? v : undefined;
    const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
    const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);

    await saveGlobalPrefs(this.context, {
      enabled: bool(data.enabled),
      autoTrigger: bool(data.autoTrigger),
      enableInComments: bool(data.enableInComments),
      enableInStrings: bool(data.enableInStrings),
      firstLineOnlyWhenMidLine: bool(data.firstLineOnlyWhenMidLine),
      sendFilePath: bool(data.sendFilePath),
      showStatusBar: bool(data.showStatusBar),
      respectGitignore: bool(data.respectGitignore),
      ignoreGlobs: str(data.ignoreGlobs),
      disabledLanguages: str(data.disabledLanguages),
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
          ? data.uiLocale.trim().toLowerCase()
          : undefined,
    });

    const incoming = (data.profiles as StoredProfile[] | undefined) ?? [];
    if (incoming.length) {
      const existing = await ensureProfiles(this.context);
      const byId = new Map(existing.map((p) => [p.id, p]));
      const merged: StoredProfile[] = incoming.map((p) => {
        const prev = byId.get(p.id);
        return {
          id: p.id || prev?.id || crypto.randomUUID(),
          name: p.name || prev?.name || "配置",
          provider: p.provider ?? prev?.provider ?? "openai-compatible",
          baseUrl: p.baseUrl ?? prev?.baseUrl ?? "",
          model: p.model ?? prev?.model ?? "",
          authHeaderTemplate:
            p.authHeaderTemplate ?? prev?.authHeaderTemplate ?? "Authorization: Bearer ${apiKey}",
          extraHeadersJson: p.extraHeadersJson ?? prev?.extraHeadersJson ?? "{}",
          fimPath: p.fimPath ?? prev?.fimPath ?? "",
          chatPath: p.chatPath ?? prev?.chatPath ?? "/chat/completions",
          completionsPath: p.completionsPath ?? prev?.completionsPath ?? "",
          promptTemplate: p.promptTemplate ?? prev?.promptTemplate ?? "AUTO",
          temperature: p.temperature ?? prev?.temperature ?? 0,
          maxTokens: p.maxTokens ?? prev?.maxTokens ?? 128,
          timeoutMs: p.timeoutMs ?? prev?.timeoutMs ?? 3000,
          settingsTimeoutMs: p.settingsTimeoutMs ?? prev?.settingsTimeoutMs ?? 15000,
          stream: p.stream ?? prev?.stream ?? false,
          overrideContextBudget: p.overrideContextBudget ?? prev?.overrideContextBudget ?? false,
          maxPrefixChars: p.maxPrefixChars ?? prev?.maxPrefixChars ?? 8000,
          maxSuffixChars: p.maxSuffixChars ?? prev?.maxSuffixChars ?? 2000,
        };
      });
      const activeId =
        (typeof data.activeProfileId === "string" && data.activeProfileId) ||
        (await getActiveProfileId(this.context));
      await saveProfiles(this.context, merged, activeId);
    }
    await this.onSettingsChanged?.();
    return { ok: true, errors: [] as string[] };
  }

  private async importSettings(payload: unknown) {
    const { json } = payload as { json: string };
    const data = JSON.parse(json) as Record<string, unknown>;
    // force no secrets
    if (Array.isArray(data.profiles)) {
      data.profiles = (data.profiles as Record<string, unknown>[]).map((p) => {
        const { hasApiKey: _h, apiKey: _k, ...rest } = p as Record<string, unknown> & {
          hasApiKey?: unknown;
          apiKey?: unknown;
        };
        return rest;
      });
    }
    return this.applySettings(data);
  }

  private async providerConfigFor(payload: unknown) {
    const profileId = (payload as { profileId?: string } | undefined)?.profileId;
    if (profileId) await selectProfile(this.context, profileId);
    const settings = await buildEngineSettings(this.context);
    return settings.providerConfig;
  }

  private async testConnection(payload: unknown) {
    const cfg = await this.providerConfigFor(payload);
    const client = new HttpCompletionClient(cfg, "connection_test");
    const started = Date.now();
    try {
      const resp = await client.testConnection();
      return {
        status: resp.text.trim() ? "SUCCESS" : "EMPTY",
        httpStatus: resp.rawStatus,
        latencyMs: Date.now() - started,
        preview: resp.text.replace(/\n/g, " ").trim().slice(0, 80),
      };
    } catch (e) {
      return {
        status: "FAILED",
        latencyMs: Date.now() - started,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  private async probeTemplate(payload: unknown) {
    const p = payload as { template?: string; profileId?: string };
    const cfg = await this.providerConfigFor(p);
    const client = new HttpCompletionClient(cfg, "template_probe");
    return client.probeTemplate((p.template as PromptTemplateId) ?? "AUTO");
  }

  private async probeAll(payload: unknown) {
    const cfg = await this.providerConfigFor(payload);
    const client = new HttpCompletionClient(cfg, "template_probe_all");
    return { results: await client.probeAllTemplates() };
  }

  private async listModels(payload: unknown) {
    const cfg = await this.providerConfigFor(payload);
    const client = new HttpCompletionClient(cfg, "list_models");
    return { models: await client.listModels() };
  }

  private ok(req: BridgeMessage, type: string, payload: unknown): BridgeMessage {
    return { v: 1, id: req.id, type, ok: true, payload };
  }

  private fail(req: BridgeMessage, error: string): BridgeMessage {
    return { v: 1, id: req.id, type: req.type, ok: false, error };
  }
}

function vscodeThemeKind(): "light" | "dark" | "high-contrast" {
  const kind = vscode.window.activeColorTheme.kind;
  if (kind === vscode.ColorThemeKind.HighContrast || kind === vscode.ColorThemeKind.HighContrastLight) {
    return "high-contrast";
  }
  if (kind === vscode.ColorThemeKind.Light) return "light";
  return "dark";
}

// silence unused import if tree-shaken
void getActiveProfile;

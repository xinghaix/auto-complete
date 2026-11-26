import * as vscode from "vscode";
import {
  CompletionEngine,
  formatLogSummary,
  HttpCompletionClient,
  LogBuffer,
  normalizeLanguage,
  type EngineSettings,
  type LogEntry,
} from "@auto-complete/core-ts";
import {
  buildEngineSettings,
  ensureProfiles,
  getActiveProfile,
  getGlobalPrefs,
  isConfigChangeSuppressed,
  saveGlobalPrefs,
  selectProfile,
  setApiKey,
  syncExternalConfigChanges,
  toSnapshot,
} from "./config/settings";
import {
  AutoCompleteInlineProvider,
  INTERNAL_ACCEPTED_COMMAND,
  type InlineActivityEvent,
} from "./inline/provider";
import { VsCodeUiBridge } from "./bridge/VsCodeUiBridge";
import { SettingsPanel } from "./webview/SettingsPanel";
import { VsCodeProjectContext } from "./project/context";
import { createVsCodeProxyFetch } from "./net/proxyFetch";

const STATUS_BAR_MENU_COMMAND = "autoComplete.statusBarMenu";

let engine: CompletionEngine | undefined;
let statusBar: vscode.StatusBarItem | undefined;
let output: vscode.OutputChannel | undefined;
let logBuffer: LogBuffer | undefined;
let bridge: VsCodeUiBridge | undefined;
let projectContext: VsCodeProjectContext | undefined;
let extContext: vscode.ExtensionContext | undefined;
let cachedSettings: EngineSettings | undefined;
let cachedShowStatusBar = true;
let activeProfileName = "";
let inFlightCount = 0;
let lastLatencyMs: number | null = null;
let lastCached = false;
let lastError: string | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  extContext = context;
  output = vscode.window.createOutputChannel("Auto Complete");
  logBuffer = new LogBuffer(1000);
  logBuffer.addListener((entry: LogEntry) => {
    output?.appendLine(formatLogSummary(entry));
    bridge?.enqueueLog(entry);
  });

  await ensureProfiles(context);

  const initialSettings = await buildEngineSettings(context);
  cachedSettings = initialSettings;
  cachedShowStatusBar = getGlobalPrefs(context).showStatusBar;
  activeProfileName = (await getActiveProfile(context))?.name ?? "";
  logBuffer.setRetention(initialSettings.logRetention);

  projectContext = new VsCodeProjectContext(() => {
    const s = cachedSettings ?? initialSettings;
    return {
      ignoreGlobs: s.ignoreGlobs,
      respectGitignore: s.respectGitignore,
      maxFileSizeKb: s.maxFileSizeKb,
      sendFilePath: s.sendFilePath,
    };
  });
  await projectContext.refreshGitignore();

  const proxyFetch = createVsCodeProxyFetch();
  const settingsSource = () => cachedSettings ?? initialSettings;

  engine = new CompletionEngine(
    settingsSource,
    logBuffer,
    projectContext,
    (cfg) =>
      new HttpCompletionClient(
        cfg,
        "completion",
        (event) => {
          logBuffer?.appendIfEnabled(
            {
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
            },
            settingsSource().logLevel,
          );
        },
        proxyFetch,
      ),
    undefined,
    (status, message) => {
      if (!extContext) return;
      const prefs = getGlobalPrefs(extContext);
      if (!prefs.notifyOnFatalError) return;
      void vscode.window.showErrorMessage(
        `Auto Complete auth/config error${status ? ` (HTTP ${status})` : ""}: ${message}`,
      );
    },
  );

  const refreshSettings = async (notifyPanel = false) => {
    cachedSettings = await buildEngineSettings(context);
    cachedShowStatusBar = getGlobalPrefs(context).showStatusBar;
    activeProfileName = (await getActiveProfile(context))?.name ?? "";
    engine?.reloadCaches();
    logBuffer?.setRetention(cachedSettings.logRetention);
    lastError = null;
    updateStatusBar();
    if (notifyPanel && SettingsPanel.current) {
      SettingsPanel.pushSettingsChanged(await toSnapshot(context));
    }
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("autoComplete") && !isConfigChangeSuppressed()) {
        await syncExternalConfigChanges(context, e);
        await refreshSettings(true);
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void projectContext?.refreshGitignore();
    }),
    // Reload gitignore when the file is saved/created under a workspace root
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.fileName.replace(/\\/g, "/").endsWith("/.gitignore")) {
        void projectContext?.refreshGitignore();
      }
    }),
  );

  bridge = new VsCodeUiBridge(
    context,
    () => logBuffer?.snapshot() ?? [],
    () => logBuffer?.clear(),
    () => refreshSettings(false),
    {
      logBuffer,
      getSessionStats: () =>
        engine?.sessionStats() ?? {
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
        },
      clearCaches: () => {
        engine?.clearCaches();
        lastError = null;
        updateStatusBar();
      },
      fetchImpl: proxyFetch,
    },
  );

  const handleActivity = (event: InlineActivityEvent) => {
    if (event.kind === "start") {
      inFlightCount += 1;
      updateStatusBar();
      return;
    }
    if (event.kind === "done") {
      inFlightCount = Math.max(0, inFlightCount - 1);
      if (event.outcome.kind === "success") {
        lastLatencyMs = event.outcome.response.latencyMs;
        lastCached = event.outcome.response.cached;
        lastError = null;
      } else if (event.outcome.kind === "failed") {
        lastError = event.outcome.status
          ? `HTTP ${event.outcome.status}: ${event.outcome.message}`
          : event.outcome.message;
      }
      updateStatusBar();
      return;
    }
    if (event.kind === "skipped" && event.manual) {
      vscode.window.setStatusBarMessage(`Auto Complete skipped: ${event.reason}`, 3000);
    }
  };

  const inlineProvider = new AutoCompleteInlineProvider(
    engine,
    settingsSource,
    projectContext,
    handleActivity,
  );

  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider({ pattern: "**" }, inlineProvider),
  );

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = STATUS_BAR_MENU_COMMAND;
  context.subscriptions.push(statusBar);
  updateStatusBar();

  const toggleLanguageDisabled = async (lang: string) => {
    const prefs = getGlobalPrefs(context);
    const items = prefs.disabledLanguages
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const lower = lang.toLowerCase();
    const exists = items.some((x) => x.toLowerCase() === lower);
    const nextList = exists
      ? items.filter((x) => x.toLowerCase() !== lower)
      : [...items, lower];
    await saveGlobalPrefs(context, { disabledLanguages: nextList.join(", ") });
    await refreshSettings(true);
    vscode.window.setStatusBarMessage(
      exists
        ? `Auto Complete enabled for ${lower}`
        : `Auto Complete disabled for ${lower}`,
      3000,
    );
  };

  const showStatusBarMenu = async () => {
    const s = settingsSource();
    const profiles = await ensureProfiles(context);
    const active = await getActiveProfile(context);
    const activeEditor = vscode.window.activeTextEditor;
    const currentLang = activeEditor
      ? normalizeLanguage(activeEditor.document.languageId, activeEditor.document.fileName)
      : "";
    const langDisabled = currentLang
      ? s.disabledLanguages instanceof Set
        ? s.disabledLanguages.has(currentLang.toLowerCase())
        : s.disabledLanguages.some((l) => l.toLowerCase() === currentLang.toLowerCase())
      : false;

    type MenuItem = vscode.QuickPickItem & { action: string };
    const items: MenuItem[] = [
      {
        label: "$(arrow-swap) Switch Profile",
        description: active ? `${active.name}${active.model ? ` · ${active.model}` : ""}` : "None",
        detail: `${profiles.length} configured profile${profiles.length === 1 ? "" : "s"}`,
        action: "switchProfile",
      },
      {
        label: s.enabled
          ? "$(circle-slash) Disable Auto Complete"
          : "$(check) Enable Auto Complete",
        description: s.enabled ? "Currently enabled" : "Currently disabled",
        action: "toggleEnabled",
      },
    ];

    if (currentLang) {
      items.push({
        label: langDisabled
          ? `$(code) Enable for ${currentLang}`
          : `$(code) Disable for ${currentLang}`,
        description: langDisabled ? "Language is currently muted" : "Mute completions in this language",
        action: "toggleLanguage",
      });
    }

    items.push(
      {
        label: "$(sparkle) Trigger Completion (Force Refresh)",
        description: "Bypass cache and request a fresh completion",
        action: "triggerRefresh",
      },
      {
        label: "$(gear) Open Settings Panel",
        action: "openSettings",
      },
      {
        label: "$(output) Open Logs",
        description: lastError ? `Last error: ${lastError.slice(0, 60)}` : undefined,
        action: "openLogs",
      },
      {
        label: "$(trash) Clear Cache & Reset Backoff",
        description: engine?.backoff.blocked() ? "Backoff active" : undefined,
        action: "clearCaches",
      },
    );

    const picked = await vscode.window.showQuickPick(items, {
      title: "Auto Complete",
      placeHolder: "Choose an action",
    });
    if (!picked) return;

    switch (picked.action) {
      case "switchProfile": {
        if (profiles.length === 0) {
          SettingsPanel.show(context, bridge!, "profile");
          return;
        }
        const profilePick = await vscode.window.showQuickPick(
          profiles.map((p) => ({
            label: `${p.id === active?.id ? "$(check) " : ""}${p.name}`,
            description: p.model || "(no model)",
            detail: p.baseUrl || "(no base URL)",
            profileId: p.id,
          })),
          {
            title: "Switch Auto Complete Profile",
            placeHolder: "Select active profile",
          },
        );
        if (!profilePick) return;
        await selectProfile(context, profilePick.profileId);
        await refreshSettings(true);
        break;
      }
      case "toggleEnabled":
        await vscode.commands.executeCommand("autoComplete.toggleEnabled");
        break;
      case "toggleLanguage":
        if (currentLang) await toggleLanguageDisabled(currentLang);
        break;
      case "triggerRefresh":
        await vscode.commands.executeCommand("autoComplete.triggerRefresh");
        break;
      case "openSettings":
        SettingsPanel.show(context, bridge!, "profile");
        break;
      case "openLogs":
        SettingsPanel.show(context, bridge!, "logs");
        break;
      case "clearCaches":
        engine?.clearCaches();
        lastError = null;
        updateStatusBar();
        vscode.window.setStatusBarMessage("Auto Complete cache cleared and backoff reset", 3000);
        break;
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(INTERNAL_ACCEPTED_COMMAND, () => {
      engine?.recordAccepted();
    }),
    vscode.commands.registerCommand(STATUS_BAR_MENU_COMMAND, showStatusBarMenu),
    vscode.commands.registerCommand("autoComplete.trigger", async () => {
      await vscode.commands.executeCommand("editor.action.inlineSuggest.trigger");
    }),
    vscode.commands.registerCommand("autoComplete.triggerRefresh", async () => {
      inlineProvider.requestForceRefresh();
      await vscode.commands.executeCommand("editor.action.inlineSuggest.trigger");
    }),
    vscode.commands.registerCommand("autoComplete.openSettings", () => {
      SettingsPanel.show(context, bridge!, "profile");
    }),
    vscode.commands.registerCommand("autoComplete.toggleEnabled", async () => {
      const current = getGlobalPrefs(context);
      await saveGlobalPrefs(context, { enabled: !current.enabled });
      await refreshSettings(true);
    }),
    vscode.commands.registerCommand("autoComplete.showLogs", () => {
      SettingsPanel.show(context, bridge!, "logs");
      output?.show(true);
    }),
    vscode.commands.registerCommand("autoComplete.setApiKey", async () => {
      const profile = await getActiveProfile(context);
      if (!profile) {
        void vscode.window.showWarningMessage("No active profile");
        return;
      }
      const value = await vscode.window.showInputBox({
        prompt: `API key for profile "${profile.name}" (SecretStorage)`,
        password: true,
        ignoreFocusOut: true,
      });
      if (value === undefined) return;
      await setApiKey(context.secrets, profile.id, value);
      await refreshSettings(true);
      void vscode.window.showInformationMessage(
        value.trim() ? "API key saved" : "API key cleared",
      );
    }),
  );

  output.appendLine("Auto Complete activated (multi-profile)");
  context.subscriptions.push({
    dispose: () => {
      bridge?.dispose();
      bridge = undefined;
      engine?.dispose();
      engine = undefined;
    },
  });
}

function truncateLabel(value: string, maxLen = 28): string {
  const s = value.trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1)}…`;
}

function updateStatusBar(): void {
  if (!statusBar || !cachedSettings) return;
  if (!cachedShowStatusBar) {
    statusBar.hide();
    return;
  }
  statusBar.show();

  const enabled = cachedSettings.enabled && !cachedSettings.snoozed;
  const profileLabel = activeProfileName ? truncateLabel(activeProfileName, 18) : "";
  const modelLabel = cachedSettings.model ? truncateLabel(cachedSettings.model, 24) : "";
  const identity =
    profileLabel && modelLabel
      ? `${profileLabel} · ${modelLabel}`
      : modelLabel || profileLabel || "No Profile";

  if (!enabled) {
    statusBar.text = "$(circle-slash) AC: Off";
  } else if (inFlightCount > 0) {
    statusBar.text = `$(loading~spin) AC: ${identity}`;
  } else if (engine?.backoff.isFatal() || lastError) {
    statusBar.text = `$(warning) AC: ${identity}`;
  } else {
    statusBar.text = `$(sparkle) AC: ${identity}`;
  }

  const lines: string[] = [
    `Auto Complete — ${enabled ? "Enabled" : "Disabled"}`,
    `Profile: ${activeProfileName || "(none)"}`,
    `Model: ${cachedSettings.model || "(not set)"}`,
  ];
  if (inFlightCount > 0) {
    lines.push("Status: Requesting completion…");
  }
  if (lastLatencyMs !== null) {
    lines.push(`Last latency: ${lastLatencyMs}ms${lastCached ? " (cached)" : ""}`);
  }
  if (engine?.backoff.isFatal()) {
    const code = engine.backoff.getFatalStatus();
    lines.push(`Backoff: Fatal error${code ? ` (HTTP ${code})` : ""} — trigger manually or reset`);
  } else if (engine?.backoff.blocked()) {
    lines.push("Backoff: Temporarily cooling down");
  }
  if (lastError) {
    lines.push(`Last error: ${lastError}`);
  }
  lines.push("Click for Auto Complete quick actions");
  statusBar.tooltip = lines.join("\n");
}

export function deactivate(): void {
  bridge?.dispose();
  bridge = undefined;
  engine?.dispose();
  engine = undefined;
  extContext = undefined;
  cachedSettings = undefined;
  activeProfileName = "";
  inFlightCount = 0;
  lastLatencyMs = null;
  lastCached = false;
  lastError = null;
}

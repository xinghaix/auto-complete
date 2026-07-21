import * as vscode from "vscode";
import {
  CompletionEngine,
  formatLogSummary,
  LogBuffer,
  type LogEntry,
} from "@auto-complete/core-ts";
import {
  buildEngineSettings,
  ensureProfiles,
  getActiveProfile,
  getActiveProfileId,
  getGlobalPrefs,
  setApiKey,
} from "./config/settings";
import { AutoCompleteInlineProvider } from "./inline/provider";
import { VsCodeUiBridge } from "./bridge/VsCodeUiBridge";
import { SettingsPanel } from "./webview/SettingsPanel";
import { VsCodeProjectContext } from "./project/context";

let engine: CompletionEngine | undefined;
let statusBar: vscode.StatusBarItem | undefined;
let output: vscode.OutputChannel | undefined;
let logBuffer: LogBuffer | undefined;
let bridge: VsCodeUiBridge | undefined;
let projectContext: VsCodeProjectContext | undefined;
let extContext: vscode.ExtensionContext | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  extContext = context;
  output = vscode.window.createOutputChannel("Auto Complete");
  logBuffer = new LogBuffer(1000);
  logBuffer.addListener((entry: LogEntry) => {
    output?.appendLine(formatLogSummary(entry));
    bridge?.enqueueLog(entry);
  });

  await ensureProfiles(context);

  projectContext = new VsCodeProjectContext();
  await projectContext.refreshGitignore();

  let cachedSettings = await buildEngineSettings(context);
  const settingsSource = () => cachedSettings;

  engine = new CompletionEngine(
    settingsSource,
    logBuffer,
    projectContext,
    undefined,
    undefined,
    (status, message) => {
      // Re-read prefs so notifyOnFatalError is honored after settings changes.
      if (!extContext) return;
      const prefs = getGlobalPrefs(extContext);
      if (!prefs.notifyOnFatalError) return;
      void vscode.window.showErrorMessage(
        `Auto Complete auth/config error${status ? ` (HTTP ${status})` : ""}: ${message}`,
      );
    },
  );

  const refreshSettings = async () => {
    cachedSettings = await buildEngineSettings(context);
    engine?.reloadCaches();
    logBuffer?.setRetention(cachedSettings.logRetention);
    updateStatusBar();
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("autoComplete")) {
        await refreshSettings();
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
    refreshSettings,
  );

  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: "**" },
      new AutoCompleteInlineProvider(engine),
    ),
  );

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = "autoComplete.openSettings";
  context.subscriptions.push(statusBar);
  updateStatusBar();

  context.subscriptions.push(
    vscode.commands.registerCommand("autoComplete.trigger", async () => {
      await vscode.commands.executeCommand("editor.action.inlineSuggest.trigger");
    }),
    vscode.commands.registerCommand("autoComplete.openSettings", () => {
      SettingsPanel.show(context, bridge!, "config");
    }),
    vscode.commands.registerCommand("autoComplete.toggleEnabled", async () => {
      const cfg = vscode.workspace.getConfiguration("autoComplete");
      const next = !cfg.get<boolean>("enabled", true);
      await cfg.update("enabled", next, vscode.ConfigurationTarget.Global);
      await refreshSettings();
    }),
    vscode.commands.registerCommand("autoComplete.showLogs", () => {
      // Prefer unified settings-ui Logs tab; OutputChannel remains for raw stream.
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
      await refreshSettings();
      void vscode.window.showInformationMessage(
        value.trim() ? "API key saved" : "API key cleared",
      );
    }),
  );

  output.appendLine("Auto Complete activated (multi-profile)");
  context.subscriptions.push({
    dispose: () => {
      engine?.dispose();
      engine = undefined;
    },
  });
}

function updateStatusBar(): void {
  if (!statusBar) return;
  const c = vscode.workspace.getConfiguration("autoComplete");
  const show = extContext
    ? getGlobalPrefs(extContext).showStatusBar
    : c.get("showStatusBar", true);
  if (!show) {
    statusBar.hide();
    return;
  }
  statusBar.show();
  const enabled = c.get("enabled", true);
  const model = c.get("model", "");
  statusBar.text = enabled ? `$(sparkle) AC: ${model || "on"}` : "$(circle-slash) AC off";
  statusBar.tooltip = "Auto Complete — open settings panel";
}

export function deactivate(): void {
  engine?.dispose();
  engine = undefined;
  extContext = undefined;
}

void getActiveProfileId;

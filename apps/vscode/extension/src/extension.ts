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
  setApiKey,
} from "./config/settings";
import { AutoCompleteInlineProvider } from "./inline/provider";
import { VsCodeUiBridge } from "./bridge/VsCodeUiBridge";
import { SettingsPanel } from "./webview/SettingsPanel";

let engine: CompletionEngine | undefined;
let statusBar: vscode.StatusBarItem | undefined;
let output: vscode.OutputChannel | undefined;
let logBuffer: LogBuffer | undefined;
let bridge: VsCodeUiBridge | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  output = vscode.window.createOutputChannel("Auto Complete");
  logBuffer = new LogBuffer(1000);
  logBuffer.addListener((entry: LogEntry) => {
    output?.appendLine(formatLogSummary(entry));
    bridge?.enqueueLog(entry);
  });

  await ensureProfiles(context);

  let cachedSettings = await buildEngineSettings(context);
  const settingsSource = () => cachedSettings;

  engine = new CompletionEngine(
    settingsSource,
    logBuffer,
    undefined,
    undefined,
    undefined,
    (status, message) => {
      void vscode.window.showErrorMessage(
        `Auto Complete auth/config error${status ? ` (HTTP ${status})` : ""}: ${message}`,
      );
    },
  );

  const refreshSettings = async () => {
    cachedSettings = await buildEngineSettings(context);
    engine?.reloadCaches();
    updateStatusBar();
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("autoComplete")) {
        await refreshSettings();
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
  if (vscode.workspace.getConfiguration("autoComplete").get("showStatusBar", true)) {
    statusBar.show();
  }

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

async function updateStatusBar(): Promise<void> {
  if (!statusBar) return;
  const config = vscode.workspace.getConfiguration("autoComplete");
  const enabled = config.get("enabled", true);
  const showStatusBar = config.get("showStatusBar", true);
  // model may come from globalState profile — show config mirror
  const model = config.get("model", "");
  statusBar.text = enabled ? `$(sparkle) AC: ${model || "on"}` : "$(circle-slash) AC off";
  statusBar.tooltip = "Auto Complete — open settings panel";
  if (showStatusBar) statusBar.show();
  else statusBar.hide();
}

export function deactivate(): void {
  engine?.dispose();
  engine = undefined;
}

void getActiveProfileId;

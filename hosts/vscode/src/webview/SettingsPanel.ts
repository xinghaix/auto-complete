import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { VsCodeUiBridge, type BridgeMessage } from "../bridge/VsCodeUiBridge";

export class SettingsPanel {
  public static current: SettingsPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private context: vscode.ExtensionContext,
    private bridge: VsCodeUiBridge,
  ) {
    this.panel = panel;
    this.panel.webview.html = this.getHtml(this.panel.webview);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      async (msg: BridgeMessage) => {
        const response = await this.bridge.handle(msg);
        await this.panel.webview.postMessage(response);
      },
      null,
      this.disposables,
    );
    this.disposables.push(
      this.bridge.onLogBatch((entries) => {
        void this.panel.webview.postMessage({
          v: 1,
          id: "",
          type: "logBatch",
          ok: true,
          payload: { entries },
        });
      }),
    );
    // Push IDE theme / language when they change so settings-ui can follow.
    this.disposables.push(
      vscode.window.onDidChangeActiveColorTheme((theme) => {
        const kind = theme.kind;
        let t: "light" | "dark" | "high-contrast" = "dark";
        if (
          kind === vscode.ColorThemeKind.HighContrast ||
          kind === vscode.ColorThemeKind.HighContrastLight
        ) {
          t = "high-contrast";
        } else if (kind === vscode.ColorThemeKind.Light) {
          t = "light";
        }
        void this.panel.webview.postMessage({
          v: 1,
          id: "",
          type: "themeChanged",
          ok: true,
          payload: { theme: t },
        });
      }),
    );
  }

  /** Notify webview of current IDE locale (also used after open). */
  pushLocale(): void {
    void this.panel.webview.postMessage({
      v: 1,
      id: "",
      type: "localeChanged",
      ok: true,
      payload: { locale: vscode.env.language },
    });
  }

  static show(
    context: vscode.ExtensionContext,
    bridge: VsCodeUiBridge,
    tab: "config" | "behavior" | "logs" | "settings" = "config",
  ): void {
    const normalized = tab === "settings" ? "config" : tab;
    if (SettingsPanel.current) {
      SettingsPanel.current.panel.reveal(vscode.ViewColumn.Beside);
      SettingsPanel.current.openTab(normalized);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "autoCompleteSettings",
      "Auto Complete",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, "media")),
          vscode.Uri.file(path.join(context.extensionPath, "dist", "webview")),
        ],
      },
    );
    const instance = new SettingsPanel(panel, context, bridge);
    SettingsPanel.current = instance;
    instance.pushLocale();
    instance.openTab(normalized);
  }

  openTab(tab: "config" | "behavior" | "logs" | "settings"): void {
    const normalized = tab === "settings" ? "config" : tab;
    void this.panel.webview.postMessage({
      v: 1,
      id: "",
      type: "openTab",
      ok: true,
      payload: { tab: normalized },
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const mediaDir = path.join(this.context.extensionPath, "media");
    const distDir = path.join(this.context.extensionPath, "dist", "webview");
    const indexDist = path.join(distDir, "index.html");
    const indexMedia = path.join(mediaDir, "index.html");

    if (fs.existsSync(indexDist)) {
      return this.rewriteHtml(fs.readFileSync(indexDist, "utf8"), webview, distDir);
    }
    if (fs.existsSync(indexMedia)) {
      return this.rewriteHtml(fs.readFileSync(indexMedia, "utf8"), webview, mediaDir);
    }
    // Embedded fallback UI (no build of settings-ui required)
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src ${webview.cspSource} 'unsafe-inline'`,
      `img-src ${webview.cspSource} data:`,
    ].join("; ");
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Auto Complete</title>
  <style>
    :root { color-scheme: light dark; font-family: var(--vscode-font-family, system-ui); }
    body { margin: 0; padding: 16px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    h1 { font-size: 1.2rem; margin: 0 0 12px; }
    .tabs { display: flex; gap: 8px; margin-bottom: 16px; }
    .tabs button { cursor: pointer; padding: 6px 12px; border: 1px solid var(--vscode-button-border, #555); background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border-radius: 4px; }
    .tabs button.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    label { display: block; margin: 10px 0 4px; font-size: 12px; opacity: 0.85; }
    input, select { width: 100%; box-sizing: border-box; padding: 6px 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, #555); border-radius: 3px; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    button.action { cursor: pointer; padding: 6px 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; }
    button.action.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    #status { margin-top: 12px; font-size: 12px; white-space: pre-wrap; }
    #logs { font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; max-height: 420px; overflow: auto; border: 1px solid var(--vscode-panel-border, #444); padding: 8px; }
    .hidden { display: none; }
    .hint { font-size: 11px; opacity: 0.7; margin-top: 4px; }
  </style>
</head>
<body>
  <h1>Auto Complete</h1>
  <div class="tabs">
    <button id="tabSettings" class="active" type="button">Settings</button>
    <button id="tabLogs" type="button">Logs</button>
  </div>
  <div id="panelSettings">
    <label>Base URL</label>
    <input id="baseUrl" />
    <label>Model</label>
    <input id="model" />
    <label>Prompt template</label>
    <select id="promptTemplate">
      <option value="AUTO">Auto</option>
      <option value="CODESTRAL_API">(fim) OpenAI FIM</option>
      <option value="QWEN">(fim) Qwen</option>
      <option value="DEEPSEEK">(fim) DeepSeek</option>
      <option value="STARCODER">(fim) StarCoder</option>
      <option value="CHAT">(chat) Pseudo-FIM</option>
    </select>
    <label>API Key <span id="keyStatus" class="hint"></span></label>
    <input id="apiKey" type="password" placeholder="Paste key (stored in SecretStorage)" />
    <label>Max tokens</label>
    <input id="maxTokens" type="number" />
    <label>Completion timeout (ms)</label>
    <input id="timeoutMs" type="number" />
    <div class="row">
      <button class="action" id="btnApply" type="button">Apply</button>
      <button class="action secondary" id="btnTest" type="button">Test connection</button>
      <button class="action secondary" id="btnClearKey" type="button">Clear key</button>
    </div>
    <div id="status"></div>
    <p class="hint">Secrets never appear in settings.json. Native VS Code Settings also work for non-secret keys.</p>
  </div>
  <div id="panelLogs" class="hidden">
    <div class="row">
      <button class="action secondary" id="btnClearLogs" type="button">Clear</button>
      <button class="action secondary" id="btnRefreshLogs" type="button">Refresh</button>
    </div>
    <div id="logs"></div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    let reqId = 0;
    const pending = new Map();
    function send(type, payload) {
      const id = String(++reqId);
      return new Promise((resolve) => {
        pending.set(id, resolve);
        vscode.postMessage({ v: 1, id, type, payload });
      });
    }
    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg && msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
      if (msg && msg.type === 'logBatch' && msg.payload && msg.payload.entries) {
        const el = document.getElementById('logs');
        for (const entry of msg.payload.entries) {
          el.textContent += (entry.time || '') + ' ' + (entry.level || '') + ' ' + (entry.message || entry.error || '') + '\\n';
        }
      }
    });
    function showTab(name) {
      document.getElementById('panelSettings').classList.toggle('hidden', name !== 'settings');
      document.getElementById('panelLogs').classList.toggle('hidden', name !== 'logs');
      document.getElementById('tabSettings').classList.toggle('active', name === 'settings');
      document.getElementById('tabLogs').classList.toggle('active', name === 'logs');
    }
    document.getElementById('tabSettings').onclick = () => showTab('settings');
    document.getElementById('tabLogs').onclick = () => { showTab('logs'); send('subscribeLogs'); };
    async function load() {
      const res = await send('getSnapshot');
      if (!res.ok) { document.getElementById('status').textContent = res.error || 'load failed'; return; }
      const s = res.payload;
      const p = (s.profiles && s.profiles[0]) || {};
      document.getElementById('baseUrl').value = p.baseUrl || '';
      document.getElementById('model').value = p.model || '';
      document.getElementById('promptTemplate').value = p.promptTemplate || 'AUTO';
      document.getElementById('maxTokens').value = p.maxTokens || 128;
      document.getElementById('timeoutMs').value = p.timeoutMs || 3000;
      document.getElementById('keyStatus').textContent = p.hasApiKey ? '(configured)' : '(not set)';
    }
    document.getElementById('btnApply').onclick = async () => {
      const payload = {
        profiles: [{
          id: 'default', name: 'Default',
          baseUrl: document.getElementById('baseUrl').value,
          model: document.getElementById('model').value,
          promptTemplate: document.getElementById('promptTemplate').value,
          maxTokens: Number(document.getElementById('maxTokens').value),
          timeoutMs: Number(document.getElementById('timeoutMs').value),
        }]
      };
      const key = document.getElementById('apiKey').value;
      if (key) {
        await send('setSecret', { profileId: 'default', secret: key });
        document.getElementById('apiKey').value = '';
      }
      const res = await send('applySettings', payload);
      document.getElementById('status').textContent = res.ok ? 'Applied' : (res.error || 'failed');
      await load();
    };
    document.getElementById('btnTest').onclick = async () => {
      document.getElementById('status').textContent = 'Testing…';
      const res = await send('testConnection');
      const p = res.payload || {};
      document.getElementById('status').textContent = res.ok
        ? (p.status + ' ' + (p.latencyMs || 0) + 'ms ' + (p.preview || p.error || ''))
        : (res.error || 'failed');
    };
    document.getElementById('btnClearKey').onclick = async () => {
      await send('clearSecret', { profileId: 'default' });
      await load();
    };
    document.getElementById('btnClearLogs').onclick = async () => {
      await send('clearLogs');
      document.getElementById('logs').textContent = '';
    };
    document.getElementById('btnRefreshLogs').onclick = () => send('subscribeLogs');
    load();
  </script>
</body>
</html>`;
  }

  private rewriteHtml(html: string, webview: vscode.Webview, assetDir: string): string {
    // Replace relative asset paths with webview URIs when packing Vite dist.
    return html.replace(/(src|href)="([^"]+)"/g, (full, attr, rel) => {
      if (rel.startsWith("http") || rel.startsWith("data:") || rel.startsWith("#")) return full;
      const uri = webview.asWebviewUri(vscode.Uri.file(path.join(assetDir, rel)));
      return `${attr}="${uri}"`;
    });
  }

  dispose(): void {
    SettingsPanel.current = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

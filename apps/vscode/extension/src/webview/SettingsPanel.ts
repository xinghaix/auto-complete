import type * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { randomBytes } from "crypto";
import {
  mapColorThemeKind,
  VsCodeUiBridge,
  type BridgeMessage,
  type HostThemeKind,
} from "../bridge/VsCodeUiBridge";
import { getVscode } from "../vscodeApi";

export type PanelTab = "profile" | "behavior" | "performance" | "general" | "logs" | "about";
export type PanelTabInput = PanelTab | "config" | "settings" | "log" | "perf" | "behaviour";

export { mapColorThemeKind, type HostThemeKind };

export function normalizePanelTab(tab?: string | null): PanelTab {
  const v = (tab ?? "").trim().toLowerCase();
  if (v === "logs" || v === "log") return "logs";
  if (v === "behavior" || v === "behaviour") return "behavior";
  if (v === "performance" || v === "perf") return "performance";
  if (v === "general") return "general";
  if (v === "about") return "about";
  return "profile";
}

export function generateNonce(): string {
  return randomBytes(16).toString("base64");
}

export function buildWebviewCsp(cspSource: string, nonce: string): string {
  return [
    "default-src 'none'",
    `img-src ${cspSource} data:`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    "connect-src 'none'",
    `font-src ${cspSource}`,
  ].join("; ") + ";";
}

/**
 * Rewrites built Vite HTML for VS Code Webview:
 * - Converts relative `src`/`href` assets into `webview.asWebviewUri(...)`
 * - Injects a strict nonce-based CSP (`connect-src 'none'`)
 * - Adds `nonce="..."` to all `<script>` tags
 * - Injects `window.__acPreferredTab` before bundle scripts run so first-time tab navigation never drops
 */
export function rewriteWebviewHtml(
  html: string,
  webview: Pick<vscode.Webview, "cspSource" | "asWebviewUri">,
  assetDir: string,
  options?: { initialTab?: PanelTab; nonce?: string },
): string {
  const vscode = getVscode();
  const nonce = options?.nonce ?? generateNonce();
  const initialTab = normalizePanelTab(options?.initialTab);
  const csp = buildWebviewCsp(webview.cspSource, nonce);

  // Strip any existing CSP meta tag so our strict host CSP is authoritative.
  let out = html.replace(
    /<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*\/?>/gi,
    "",
  );

  // Replace relative asset paths with webview URIs when packing Vite dist.
  out = out.replace(/(src|href)="([^"]+)"/g, (full, attr, rel: string) => {
    if (
      rel.startsWith("http://") ||
      rel.startsWith("https://") ||
      rel.startsWith("data:") ||
      rel.startsWith("#") ||
      rel.startsWith("vscode-webview-resource:")
    ) {
      return full;
    }
    const uri = webview.asWebviewUri(vscode.Uri.file(path.join(assetDir, rel)));
    return `${attr}="${uri}"`;
  });

  // Add nonce to every script tag that does not already specify one.
  out = out.replace(/<script\b(?![^>]*\bnonce=)/gi, `<script nonce="${nonce}"`);

  const injectedHead = [
    `  <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
    `  <script nonce="${nonce}">window.__acPreferredTab = ${JSON.stringify(initialTab)};</script>`,
  ].join("\n");

  if (/<head\b[^>]*>/i.test(out)) {
    out = out.replace(/<head\b[^>]*>/i, (match) => `${match}\n${injectedHead}`);
  } else {
    out = `${injectedHead}\n${out}`;
  }
  return out;
}

/**
 * Safe read-only diagnostic notice shown only if `dist/webview/index.html` is missing.
 * Uses strict nonce CSP (no `'unsafe-inline'` script) and never mutates stored profiles or secrets.
 */
export function buildFallbackHtml(cspSource: string, nonce = generateNonce()): string {
  const csp = buildWebviewCsp(cspSource, nonce);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Auto Complete — UI Bundle Missing</title>
  <style>
    :root { color-scheme: light dark; font-family: var(--vscode-font-family, system-ui); }
    body { margin: 0; padding: 24px; color: var(--vscode-foreground); background: var(--vscode-editor-background); line-height: 1.5; }
    .card { max-width: 600px; border: 1px solid var(--vscode-panel-border, #555); border-radius: 6px; padding: 16px 20px; }
    h1 { font-size: 1.15rem; margin: 0 0 10px; }
    p { margin: 8px 0; font-size: 13px; }
    pre { padding: 10px 12px; border-radius: 4px; background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.15)); overflow-x: auto; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; }
    .note { opacity: 0.8; font-size: 12px; }
  </style>
</head>
<body>
  <div class="card" role="alert">
    <h1>Auto Complete Settings UI bundle not found</h1>
    <p>The packaged webview assets (<code>dist/webview/index.html</code>) are missing in this installation.</p>
    <p>To protect your existing multi-profile configuration and secrets, this diagnostic screen is read-only. Rebuild the settings UI and extension bundle:</p>
    <pre>npm run build:settings-ui &amp;&amp; npm run build:vscode</pre>
    <p class="note">You can also configure non-secret options in VS Code Settings (<code>autoComplete.*</code>) or run <strong>Auto Complete: Set API Key</strong> from the Command Palette.</p>
  </div>
</body>
</html>`;
}

export class SettingsPanel {
  public static current: SettingsPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private disposed = false;
  private webviewReady = false;
  private pendingTab: PanelTab | null;

  private constructor(
    panel: vscode.WebviewPanel,
    private context: vscode.ExtensionContext,
    private bridge: VsCodeUiBridge,
    initialTab: PanelTab,
  ) {
    this.panel = panel;
    this.pendingTab = initialTab;
    this.panel.webview.html = this.getHtml(this.panel.webview, initialTab);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      async (msg: BridgeMessage) => {
        if (this.disposed) return;
        const isBootstrap =
          !this.webviewReady && (msg?.type === "getPlatform" || msg?.type === "getSnapshot");
        const response = await this.bridge.handle(msg);
        if (this.disposed) return;
        this.postSafe(response);
        if (isBootstrap) {
          this.webviewReady = true;
          this.pushLocale();
          if (this.pendingTab) {
            const target = this.pendingTab;
            this.pendingTab = null;
            this.postSafe({
              v: 1,
              id: "",
              type: "openTab",
              ok: true,
              payload: { tab: target },
            });
          }
        }
      },
      null,
      this.disposables,
    );
    this.disposables.push(
      this.bridge.onLogBatch((entries) => {
        this.postSafe({
          v: 1,
          id: "",
          type: "logBatch",
          ok: true,
          payload: { entries },
        });
      }),
    );
    // Push IDE theme when it changes so settings-ui can follow.
    const vscode = getVscode();
    this.disposables.push(
      vscode.window.onDidChangeActiveColorTheme((theme) => {
        this.postSafe({
          v: 1,
          id: "",
          type: "themeChanged",
          ok: true,
          payload: { theme: mapColorThemeKind(theme.kind) },
        });
      }),
    );
  }

  /** Notify webview of current IDE locale. */
  pushLocale(): void {
    this.postSafe({
      v: 1,
      id: "",
      type: "localeChanged",
      ok: true,
      payload: { locale: getVscode().env.language },
    });
  }

  /** Push updated snapshot when settings or secrets changed outside the panel. */
  pushSettingsChanged(snapshot: unknown): void {
    this.postSafe({
      v: 1,
      id: "",
      type: "settingsChanged",
      ok: true,
      payload: snapshot,
    });
  }

  static pushSettingsChanged(snapshot: unknown): void {
    SettingsPanel.current?.pushSettingsChanged(snapshot);
  }

  static show(
    context: vscode.ExtensionContext,
    bridge: VsCodeUiBridge,
    tab: PanelTabInput = "profile",
  ): SettingsPanel {
    const normalized = normalizePanelTab(tab);
    const vscode = getVscode();
    if (SettingsPanel.current && !SettingsPanel.current.disposed) {
      SettingsPanel.current.panel.reveal(vscode.ViewColumn.Beside);
      SettingsPanel.current.openTab(normalized);
      return SettingsPanel.current;
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
    const instance = new SettingsPanel(panel, context, bridge, normalized);
    SettingsPanel.current = instance;
    return instance;
  }

  openTab(tab: PanelTabInput): void {
    const normalized = normalizePanelTab(tab);
    if (!this.webviewReady) {
      this.pendingTab = normalized;
      return;
    }
    this.pendingTab = null;
    this.postSafe({
      v: 1,
      id: "",
      type: "openTab",
      ok: true,
      payload: { tab: normalized },
    });
  }

  private postSafe(message: unknown): void {
    if (this.disposed) return;
    try {
      const result = this.panel.webview.postMessage(message);
      if (result && typeof (result as PromiseLike<boolean>).then === "function") {
        void Promise.resolve(result).catch(() => {
          /* panel may have been disposed while message was in flight */
        });
      }
    } catch {
      /* ignore postMessage error after disposal */
    }
  }

  private getHtml(webview: vscode.Webview, initialTab: PanelTab): string {
    const mediaDir = path.join(this.context.extensionPath, "media");
    const distDir = path.join(this.context.extensionPath, "dist", "webview");
    const indexDist = path.join(distDir, "index.html");
    const indexMedia = path.join(mediaDir, "index.html");

    if (fs.existsSync(indexDist)) {
      return rewriteWebviewHtml(fs.readFileSync(indexDist, "utf8"), webview, distDir, {
        initialTab,
      });
    }
    if (fs.existsSync(indexMedia)) {
      return rewriteWebviewHtml(fs.readFileSync(indexMedia, "utf8"), webview, mediaDir, {
        initialTab,
      });
    }
    return buildFallbackHtml(webview.cspSource);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.webviewReady = false;
    this.pendingTab = null;
    if (SettingsPanel.current === this) {
      SettingsPanel.current = undefined;
    }
    this.bridge.dispose();
    while (this.disposables.length) {
      try {
        this.disposables.pop()?.dispose();
      } catch {
        /* ignore */
      }
    }
    try {
      this.panel.dispose();
    } catch {
      /* ignore */
    }
  }
}

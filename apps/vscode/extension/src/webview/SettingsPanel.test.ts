import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  buildFallbackHtml,
  mapColorThemeKind,
  normalizePanelTab,
  rewriteWebviewHtml,
  SettingsPanel,
} from "./SettingsPanel.js";
import { VsCodeUiBridge } from "../bridge/VsCodeUiBridge.js";
import { createMockVscodeEnv, type MockVscodeEnv } from "../testHelpers/mockVscode.js";

describe("SettingsPanel", () => {
  let env: MockVscodeEnv;

  beforeEach(() => {
    env = createMockVscodeEnv();
    env.install();
    SettingsPanel.current = undefined;
  });

  afterEach(() => {
    SettingsPanel.current?.dispose();
    SettingsPanel.current = undefined;
    env.restore();
  });

  it("rewriteWebviewHtml injects strict nonce CSP, nonces all scripts, rewrites assets, and sets __acPreferredTab", () => {
    const rawHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="stylesheet" href="./assets/style.css">
  </head>
  <body>
    <div id="root"></div>
    <script src="./assets/index.js"></script>
  </body>
</html>`;

    const webview = {
      cspSource: "vscode-webview://abc",
      asWebviewUri: (u: { path: string }) =>
        `https://file+.vscode-resource.vscode-cdn.net${u.path}` as unknown as import("vscode").Uri,
    };

    const out = rewriteWebviewHtml(rawHtml, webview, "/ext/dist/webview", {
      initialTab: "logs",
      nonce: "TEST_NONCE_123",
    });

    assert.ok(
      out.includes(
        `content="default-src 'none'; img-src vscode-webview://abc data:; style-src vscode-webview://abc 'unsafe-inline'; script-src 'nonce-TEST_NONCE_123'; connect-src 'none'; font-src vscode-webview://abc;"`,
      ),
    );
    assert.ok(out.includes(`<script nonce="TEST_NONCE_123">window.__acPreferredTab = "logs";</script>`));
    assert.ok(
      out.includes(
        `<script nonce="TEST_NONCE_123" src="https://file+.vscode-resource.vscode-cdn.net/ext/dist/webview/assets/index.js"></script>`,
      ),
    );
    assert.ok(
      out.includes(
        `href="https://file+.vscode-resource.vscode-cdn.net/ext/dist/webview/assets/style.css"`,
      ),
    );
    // Must not allow unsafe-inline scripts.
    assert.ok(!/script-src[^;]*unsafe-inline/i.test(out));
  });

  it("supports all 6 canonical tab names and aliases", () => {
    assert.equal(normalizePanelTab("profile"), "profile");
    assert.equal(normalizePanelTab("config"), "profile");
    assert.equal(normalizePanelTab("settings"), "profile");
    assert.equal(normalizePanelTab("behavior"), "behavior");
    assert.equal(normalizePanelTab("performance"), "performance");
    assert.equal(normalizePanelTab("general"), "general");
    assert.equal(normalizePanelTab("logs"), "logs");
    assert.equal(normalizePanelTab("about"), "about");
  });

  it("maps Light, Dark, HighContrast, and HighContrastLight theme kinds accurately", () => {
    assert.equal(mapColorThemeKind(env.vscode.ColorThemeKind.Light), "light");
    assert.equal(mapColorThemeKind(env.vscode.ColorThemeKind.Dark), "dark");
    assert.equal(mapColorThemeKind(env.vscode.ColorThemeKind.HighContrast), "high-contrast-dark");
    assert.equal(
      mapColorThemeKind(env.vscode.ColorThemeKind.HighContrastLight),
      "high-contrast-light",
    );
  });

  it("delivers pending openTab after initial getPlatform so first-time Show Logs never drops", async () => {
    const bridge = new VsCodeUiBridge(env.context, () => [], () => {});
    SettingsPanel.show(env.context, bridge, "logs");
    assert.equal(env.createdPanels.length, 1);
    const handle = env.createdPanels[0]!;

    // Before webview sends getPlatform, openTab has not been blindly dropped.
    assert.equal(handle.postedMessages.length, 0);

    // Webview bootstraps with getPlatform.
    await handle.emitMessage({ v: 1, id: "1", type: "getPlatform" });

    const types = handle.postedMessages.map((m) => (m as { type: string }).type);
    assert.ok(types.includes("platform"));
    assert.ok(types.includes("localeChanged"));
    assert.ok(types.includes("openTab"));
    const openTabMsg = handle.postedMessages.find(
      (m) => (m as { type: string }).type === "openTab",
    ) as { payload: { tab: string } };
    assert.equal(openTabMsg.payload.tab, "logs");

    // Subsequent theme changes push high-contrast-light / high-contrast-dark.
    env.setColorThemeKind(env.vscode.ColorThemeKind.HighContrastLight);
    const themeMsg = handle.postedMessages.at(-1) as { type: string; payload: { theme: string } };
    assert.equal(themeMsg.type, "themeChanged");
    assert.equal(themeMsg.payload.theme, "high-contrast-light");
  });

  it("guards postMessage on disposal during in-flight requests and disposes bridge", async () => {
    let bridgeDisposed = false;
    const bridge = new VsCodeUiBridge(env.context, () => [], () => {});
    const origDispose = bridge.dispose.bind(bridge);
    bridge.dispose = () => {
      bridgeDisposed = true;
      origDispose();
    };

    let releaseHandler!: () => void;
    bridge.handle = async (msg) => {
      await new Promise<void>((r) => {
        releaseHandler = r;
      });
      return { v: 1, id: msg.id, type: "probeResult", ok: true, payload: {} };
    };

    SettingsPanel.show(env.context, bridge, "profile");
    const handle = env.createdPanels[0]!;
    handle.setPostMessageError(new Error("Webview is disposed"));

    const inFlight = handle.emitMessage({ v: 1, id: "9", type: "testConnection" });
    handle.triggerDispose();
    releaseHandler();
    await inFlight; // Must not throw unhandled rejection.

    assert.equal(bridgeDisposed, true);
    assert.equal(SettingsPanel.current, undefined);
  });

  it("fallback HTML uses strict nonce CSP (no unsafe-inline script) and never overwrites profiles", () => {
    const html = buildFallbackHtml("vscode-webview://origin", "FALLBACK_NONCE");
    assert.ok(html.includes(`script-src 'nonce-FALLBACK_NONCE'`));
    assert.ok(html.includes(`connect-src 'none'`));
    assert.ok(!/script-src[^;]*unsafe-inline/i.test(html));
    assert.ok(!html.includes("applySettings"));
    assert.ok(!html.includes("id: 'default'"));
    assert.ok(html.includes("npm run build:settings-ui"));
  });
});

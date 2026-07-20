# Auto Complete (VS Code)

[English](README.md) · [中文](README.zh.md) · [Documentation](../../docs/README.en.md)

The VS Code host uses the TypeScript completion engine in `packages/core-ts` and embeds shared `packages/settings-ui` in a Webview. It runs independently from JetBrains and does not use a JetBrains plugin, an Extension Host bridge, or `kilo serve`.

## Requirements and installation

- VS Code: `^1.85.0`
- Development/packaging: Node.js 18+ and npm

Package from the repository root:

```bash
npm install
npm run test:core-ts
npm run test:settings-ui
npm run build:js
npm run package:vscode
```

The artifact is `hosts/vscode/dist-vsix/auto-complete-*.vsix`. Install it with **Extensions → … → Install from VSIX…**, then reload the window.

To package a JetBrains ZIP and VSIX together:

```bash
./scripts/package-local.sh
```

For local development, open `hosts/vscode/` and press F5. The extension build entry is `npm run build -w auto-complete`.

## Configure and use

1. Run **Auto Complete: Open Settings Panel**.
2. Create/select a profile and enter Base URL, model, and optional API key.
3. Use **Fetch models**, **Test connection**, and **Test template** to verify the endpoint.
4. Run **Auto Complete: Trigger Inline Completion** for a manual suggestion; default binding is Ctrl+Shift+Space (Cmd+Shift+Space on macOS).
5. **Auto Complete: Toggle Enabled** controls completion. **Auto Complete: Set API Key** writes SecretStorage. **Auto Complete: Show Logs** opens both the Logs tab and OutputChannel.

Keys live only in VS Code **SecretStorage**, not `settings.json`, global-state export, or UiBridge snapshots. Common fields mirror into native `autoComplete.*` settings; profiles and remaining global preferences live in extension `globalState`. Use the panel to manage profiles rather than editing internal storage.

## Current host differences

- The provider currently fixes `inComment` and `inString` to `false`, so the matching settings do not yet receive syntax-aware enforcement in VS Code.
- Workspace `.gitignore` is not currently injected into the TypeScript engine. Extra ignore globs are the reliable path filter.
- The VS Code host does not currently provide recent-file snippets to the engine.

These differences affect privacy and trigger scope. Do not assume full JetBrains parity; see [implementation status](../../docs/IMPLEMENTATION_STATUS.en.md).

## Logs and security

Logs are batched into the Settings panel Logs tab and mirrored to the **Auto Complete** OutputChannel. Prompt-body logging is off by default. Never put API keys or authorization headers into logs, issues, or exports. Provider request/path rules are in [providers documentation](../../docs/PROVIDERS.en.md).
# Auto Complete (VS Code)

[中文](README.zh.md) · [Docs](../../docs/README.en.md)

VS Code host: TypeScript completion engine + shared Webview settings UI. Runs **independently** from JetBrains.

JetBrains users should install the sibling plugin from the [Marketplace](https://plugins.jetbrains.com/plugin/33040-auto-complete).

## Install

- VS Code **1.85+**
- Build: Node 18+

From repo root:

```bash
npm install
npm run package:vscode
# or both hosts: ./scripts/package-local.sh
```

Artifact: `apps/vscode/extension/dist-vsix/auto-complete-*.vsix`  
Install via **Extensions → … → Install from VSIX…**, then reload.

Local debug: F5 in the extension folder, or `npm run build -w auto-complete`.

## Use

1. **Auto Complete: Open Settings Panel**
2. Create a profile (Base URL, model, optional API key)
3. Fetch models / test connection / test template
4. **Trigger Inline Completion** (default Ctrl/Cmd+Shift+Space)
5. Toggle, Set API Key, Show Logs as needed

Keys live in **SecretStorage** only. Some fields mirror to native `autoComplete.*` settings; manage profiles in the panel.

## vs JetBrains

Behaviour aims to match (comment/string probe, gitignore, recent files, …). Platform-only gaps (UI chrome, secret APIs, snooze) are listed in [implementation status](../../docs/IMPLEMENTATION_STATUS.en.md).

## Logs & security

Logs appear in the panel **Logs** tab and the **Auto Complete** Output channel. Prompt-body logging is off by default. Never paste keys into issues or exports. Providers: [PROVIDERS.en.md](../../docs/PROVIDERS.en.md).

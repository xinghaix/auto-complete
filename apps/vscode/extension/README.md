# Auto Complete (VS Code)

[中文](README.zh.md) · [User guide](../../../docs/GUIDE.en.md)

VS Code host: TypeScript completion engine + shared Webview settings. Independent of JetBrains.

JetBrains users: prefer [Marketplace](https://plugins.jetbrains.com/plugin/33040-auto-complete).

## Install

- VS Code **1.85+**
- Dev/package: Node 18+

```bash
# repo root
npm install
npm run package:vscode
```

Artifact: `apps/vscode/extension/dist-vsix/auto-complete-*.vsix`  
Install: **Extensions → … → Install from VSIX…** → reload.

## Use

1. Command: **Auto Complete: Open Settings Panel**  
2. Create a profile → Base URL, model, optional API key  
3. **Fetch models / Test connection / Test template**  
4. Manual trigger defaults to `Ctrl/Cmd+Shift+Space`  

Keys stay in **SecretStorage**. Full guide: [GUIDE.en.md](../../../docs/GUIDE.en.md).

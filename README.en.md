# Auto Complete

[中文](README.md) · [English](README.en.md) · [Docs index](docs/README.en.md)

<p align="center"><img src="docs/assets/logo.svg" width="96" height="96" alt="Auto Complete logo"/></p>

**Bring-your-own model endpoint** AI inline completion (ghost text) for **JetBrains** and **VS Code**. The two hosts run independently — no cross-host bridge.

| Host | Preferred install |
|---|---|
| JetBrains (IntelliJ, etc.) | **[JetBrains Marketplace](https://plugins.jetbrains.com/plugin/33040-auto-complete)** |
| VS Code | GitHub Release / local **VSIX** |
| Settings UI | Shared Web panel (JCEF / Webview) |

**License:** Apache-2.0 · **Stage:** open-source preview

<p align="center">
  <a href="https://plugins.jetbrains.com/plugin/33040-auto-complete">
    <img alt="Get from JetBrains Marketplace" src="https://img.shields.io/jetbrains/plugin/v/33040-auto-complete.svg?label=JetBrains%20Marketplace&style=for-the-badge" />
  </a>
</p>

> GitHub README **cannot** run the Marketplace JS card widget; the badge above links to the store page. For the official embed on **your own site**, see [docs/MARKETPLACE.en.md](docs/MARKETPLACE.en.md).

## Features

- OpenAI-compatible HTTP (Ollama, vLLM, DeepSeek / Mistral FIM, gateways, …)
- FIM / chat templates with auto-detect from model name
- Multiple saved profiles (endpoint, model, timeouts, …)
- Debounce, cancel stale requests, cache, error backoff
- Only a limited prefix/suffix around the cursor by default
- Secrets in IDE secure storage; exports never include keys
- Settings UI: English, Chinese, Japanese, Korean

Host differences: [implementation status](docs/IMPLEMENTATION_STATUS.en.md).

## Install

### JetBrains (Marketplace first)

Requires **IntelliJ Platform 2024.2+**. Settings need **JCEF** (on newer IDEs enable *Web Browser (JCEF)*).

1. **Settings → Plugins → Marketplace**, search **Auto Complete**, or open  
   [plugins.jetbrains.com/plugin/33040-auto-complete](https://plugins.jetbrains.com/plugin/33040-auto-complete)  
2. Install and restart.  
3. Open the **Auto Complete** tool window.  
4. Create a profile: Base URL, model, optional API key → **Test connection**.

Fallback (review pending / offline / custom build): download **`*-signed.zip`** from [GitHub Releases](https://github.com/xinghaix/auto-complete/releases) → **Install Plugin from Disk**. Published ZIPs are **signed**.

Details: [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)

### VS Code

Requires VS Code **1.85+**.

1. Download `auto-complete-*.vsix` from [Releases](https://github.com/xinghaix/auto-complete/releases), or package locally.  
2. Extensions → **… → Install from VSIX…** → reload.  
3. Command: **Auto Complete: Open Settings Panel**.  
4. Configure a profile and test the connection.

See [VS Code README](apps/vscode/extension/README.md).

## Build locally

Needs **JDK 21** and **Node.js 18+**.

```bash
npm install
./gradlew :core:test :plugin:test
npm run test:js
npm run build:js
./scripts/package-local.sh
```

| Artifact | Path |
|---|---|
| JetBrains signed ZIP | `apps/jetbrains/plugin/build/distributions/*-signed.zip` (needs signing env) |
| VS Code VSIX | `apps/vscode/extension/dist-vsix/auto-complete-*.vsix` |

JetBrains release ZIPs require signing secrets — see [Marketplace signing](docs/MARKETPLACE.en.md). One host only: `SKIP_JB=1` or `SKIP_VSCODE=1`.

Sandbox: `./gradlew :plugin:runIde`

## Recommended services & local example

Prefer real **FIM** endpoints for inline completion:

| Service | Example Base URL | Template | Docs |
|---|---|---|---|
| DeepSeek cloud FIM | `https://api.deepseek.com/beta` | `CODESTRAL_API` | [EN](https://api-docs.deepseek.com/guides/fim_completion/) · [中文](https://api-docs.deepseek.com/zh-cn/guides/fim_completion/) |
| Mistral Codestral FIM | `https://api.mistral.ai/v1` | `CODESTRAL_API` | [FIM API](https://docs.mistral.ai/api/endpoint/fim) |
| Local Ollama | `http://127.0.0.1:11434/v1` | `AUTO` / `QWEN`… | Local server docs |

Full notes: [Providers](docs/PROVIDERS.en.md).

```text
# Ollama example
Base URL:  http://127.0.0.1:11434/v1
Model:     qwen2.5-coder:7b
API key:   leave empty if no auth
Template:  AUTO
```

Use **Fetch models / Test connection / Test template** instead of guessing formats.

## Privacy

- Keys stay in IDE secure storage — not in normal settings, exports, or logs.
- By default only trimmed code around the cursor is sent; path is optional.
- Prompt-body logging and recent-file context are off by default.
- Remote endpoints are your responsibility; check the provider’s data policy.

Security: [SECURITY.md](SECURITY.md)

## Docs

- [Index](docs/README.en.md) · [Architecture](docs/ARCHITECTURE.en.md) · [Settings](docs/SETTINGS.en.md)
- [Providers](docs/PROVIDERS.en.md) · [Performance](docs/PERFORMANCE.en.md) · [Release](docs/RELEASE.en.md)
- [Marketplace signing](docs/MARKETPLACE.en.md) · [Status](docs/IMPLEMENTATION_STATUS.en.md) · [Sources](docs/SOURCES.en.md)
- [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

Inspired by classic Kilo Code completion behaviour; this tree is an independent implementation — see [NOTICE](NOTICE).

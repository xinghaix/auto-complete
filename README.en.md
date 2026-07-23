# Auto Complete

[中文](README.md) · [English](README.en.md) · [User guide](docs/GUIDE.en.md)

<p align="center"><img src="docs/assets/logo.svg" width="96" height="96" alt="Auto Complete logo"/></p>

**Bring-your-own model endpoint** AI inline completion (ghost text) for **JetBrains** and **VS Code**. Hosts run independently.

| Host | Preferred install |
|---|---|
| JetBrains | **[Marketplace](https://plugins.jetbrains.com/plugin/33040-auto-complete)** |
| VS Code | GitHub Release / local **VSIX** |

**License:** Apache-2.0 · **Stage:** open-source preview

<p align="center">
  <a href="https://plugins.jetbrains.com/plugin/33040-auto-complete">
    <img alt="Get from JetBrains Marketplace" src="https://img.shields.io/jetbrains/plugin/v/33040-auto-complete.svg?label=JetBrains%20Marketplace&style=for-the-badge" />
  </a>
</p>

## Quick start

1. Install the plugin / extension (table above)  
2. Open settings (JetBrains: **Auto Complete** tool window; VS Code: **Open Settings Panel**)  
3. Create a profile → Base URL, model, optional API key → **Test connection**  
4. Type for ghost text; manual trigger defaults to `Ctrl/Cmd+Shift+Space`  

```text
# Local Ollama example
Base URL:  http://127.0.0.1:11434/v1
Model:     qwen2.5-coder:7b
API key:   leave empty if no auth
Template:  AUTO
```

Recommended FIM providers, full settings, troubleshooting → **[User guide](docs/GUIDE.en.md)**.

## How to use it

- With auto trigger enabled, type normally to show ghost text after the cursor; use the IDE's normal **Tab** acceptance behaviour.
- Continuing to type or moving the cursor cancels stale suggestions. Manual trigger defaults to `Ctrl/Cmd+Shift+Space` and can be rebound in the IDE Keymap.
- The Settings panel tests connections, models, and templates; VS Code also mirrors logs to the **Auto Complete** OutputChannel.

## Features

- OpenAI-compatible HTTP (Ollama, vLLM, cloud FIM, gateways, …)
- FIM / chat templates; multiple saved profiles
- Debounce, cancel stale requests, local cache
- Nearby code only by default; secrets in IDE secure storage

## Privacy

Keys never go into ordinary settings, exports, or logs. No whole-repo upload by default. Security: [SECURITY.md](SECURITY.md).

## Docs

| Audience | Link |
|---|---|
| Users | [User guide](docs/GUIDE.en.md) |
| Maintainers (build / sign / release) | [DEV.en.md](docs/DEV.en.md) |
| Contributors | [CONTRIBUTING.md](CONTRIBUTING.md) · [CHANGELOG](CHANGELOG.md) |

Behaviour informed by classic Kilo Code completion; this tree is an independent implementation — see [NOTICE](NOTICE).

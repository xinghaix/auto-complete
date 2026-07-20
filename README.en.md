# Auto Complete

[中文](README.md) · [English](README.en.md)

<p align="center">
  <img src="docs/assets/logo.svg" width="96" height="96" alt="Auto Complete logo"/>
</p>

Lightweight **AI inline code completion**: **JetBrains** plugin ships today; **VS Code** extension is the TypeScript dual (`hosts/vscode` + `packages/core-ts`).

- Bring your own endpoint: `baseUrl` / API key / model
- OpenAI-compatible APIs (Ollama, vLLM, gateways, Mistral, …)
- Adaptive debounce, cache, skip, and error backoff
- Prompt templates, dual timeouts, secure secret storage
- Status bar + logs (JB tool window / VS Code Output + settings panel)
- **Dual engines** (Kotlin + TypeScript) + `packages/shared-spec` — no Extension Host bridge into JetBrains

**License:** Apache-2.0 · **Stage:** open-source preview (Install from Disk / VSIX / GitHub Releases).

---

## Origin

The **core completion behavior and design** of this plugin are extracted and reimplemented from open-source **[Kilo Code (kilocode)](https://github.com/Kilo-Org/kilocode)** and related classic autocomplete work (including [kilocode-legacy](https://github.com/Kilo-Org/kilocode-legacy) as a behavioral reference).

After kilocode moved to **v7**, the product became heavier and the inline-completion path harder to use and maintain in isolation. This project **spins completion out** as a focused, self-hosted-friendly tool:

| Host | Engine | Status |
|------|--------|--------|
| JetBrains (`plugin/`) | Kotlin `core/` | Ready (Install from Disk) |
| VS Code (`hosts/vscode/`) | TypeScript `packages/core-ts/` | Multi-profile + Webview settings/logs + native Settings |
| Shared Web | `packages/settings-ui/` | VS Code Webview + JetBrains **JCEF only** (no Swing settings) |

This repository is an **independent implementation**, not a wrapper around the VS Code extension host or `kilo serve`. See [NOTICE](NOTICE) and [docs/SOURCES.md](docs/SOURCES.md).

### JetBrains compatibility

| | |
|--|--|
| **Minimum IDE** | **IntelliJ Platform 2024.2+** (`since-build` **242**) |
| Settings UI | **JCEF Web only** (no Swing settings). 2024.2 uses platform JCEF; on 2025.3+/2026 enable **Web Browser (JCEF)** (optional `com.intellij.modules.jcef`) |
| Maximum | No `until-build` cap |

2024.2 **does** include JCEF; this plugin uses an **optional** jcef dependency plus **reflective** host loading. See **[docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)**.

Examples: IntelliJ IDEA **2024.2**, **2025.x**, **2026.x**.

---

## Install (from Disk)

1. Use **2024.2+**. On 2026.x, enable **Web Browser (JCEF)** if needed.
2. Download `auto-complete-*.zip` from [Releases](../../releases) (or build locally).
3. IDE → **Settings → Plugins → ⚙ → Install Plugin from Disk…**
4. Restart the IDE.
5. **Settings → Tools → Auto Complete**, or the **Auto Complete** tool window.
6. Configure Base URL, model, API key (optional) → **Test Connection**.

Local example (Ollama):

| Field | Example |
|-------|---------|
| Base URL | `http://127.0.0.1:11434/v1` |
| Model | `qwen2.5-coder:7b` |
| API key | empty if unauthenticated |

Manual trigger: **Ctrl+Shift+Space** (IDE Keymap action `AutoComplete.Trigger`).

---

## Build from source

### JetBrains

Requires **JDK 21** and network access for IntelliJ Platform dependencies.

```bash
# Optional on macOS Homebrew:
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home

./gradlew :core:test :plugin:test
./gradlew :plugin:buildPlugin
# or: ./scripts/package-local.sh
```

Artifact: `plugin/build/distributions/auto-complete-<version>.zip`

```bash
./gradlew :plugin:runIde
```

### VS Code + shared JS

Requires **Node 18+**.

```bash
npm install
npm run test:core-ts
npm run build:js
# Extension: hosts/vscode/dist/extension.js
# Optional VSIX: cd hosts/vscode && npm run package
```

---

## Modules

| Module | Role |
|--------|------|
| `core/` | Pure Kotlin engine, HTTP client, cache / skip / filter / backoff |
| `plugin/` | IntelliJ Platform: InlineCompletion, Settings, StatusBar, Logs |
| `packages/shared-spec/` | Schema, templates, bridge protocol, golden fixtures |
| `packages/core-ts/` | TypeScript completion engine (dual of `core/`) |
| `packages/settings-ui/` | Shared Web settings + logs UI |
| `hosts/vscode/` | VS Code extension host |

---

## Features (high level)

- Ghost-text inline completion with cancel-on-type
- Saved **profiles** (switch / rename / delete; keys in PasswordSafe)
- Prompt templates: Auto / OpenAI FIM / Qwen / DeepSeek / StarCoder / Chat pseudo-FIM
- Template **Test** / **Try all** on the settings page
- Separate completion vs settings-probe timeouts
- Privacy-minded defaults: no full-repo context by default
- UI locales: English, 中文, 日本語, 한국어

Design docs: see [docs/README.en.md](docs/README.en.md) (Chinese index: [docs/README.md](docs/README.md)).

---

## Documentation

| Doc | Content |
|-----|---------|
| [docs/README.en.md](docs/README.en.md) | Doc index ([中文](docs/README.md)) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture (ZH) |
| [docs/SETTINGS.md](docs/SETTINGS.md) | Settings (ZH) |
| [docs/PROVIDERS.md](docs/PROVIDERS.md) | Providers (ZH) |
| [docs/PERFORMANCE.md](docs/PERFORMANCE.md) | Performance (ZH) |
| [docs/RELEASE.md](docs/RELEASE.md) | Release (ZH) |
| [docs/OPEN_SOURCE.md](docs/OPEN_SOURCE.md) | Open-source checklist (EN) |
| [docs/SOURCES.md](docs/SOURCES.md) | Relation to kilocode (ZH) |
| [CHANGELOG.md](CHANGELOG.md) | Changelog |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contributing ([中文](CONTRIBUTING.zh.md)) |
| [SECURITY.md](SECURITY.md) | Security |

Deep design docs under `docs/` are primarily Chinese today; English README + index cover product onboarding.

---

## Privacy & security

- API keys live in the IDE **PasswordSafe**, not plain settings XML
- Full prompt logging is **off** by default
- Completions use prefix/suffix budgets, not the whole repository by default
- HTTP follows the IDE **HTTP Proxy** settings

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please open an issue before large design changes.

## License

Apache License 2.0 — [LICENSE](LICENSE), [NOTICE](NOTICE).

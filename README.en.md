# Auto Complete

[中文](README.md) · [English](README.en.md) · [Documentation](docs/README.en.md)

<p align="center"><img src="docs/assets/logo.svg" width="96" height="96" alt="Auto Complete logo"/></p>

Lightweight, bring-your-own-endpoint **AI inline code completion**. The project contains two independent hosts:

| Host | Runtime engine | Current delivery |
|---|---|---|
| JetBrains | Kotlin/JVM `core/` + `plugin/` | Install-from-Disk ZIP |
| VS Code | TypeScript `packages/core-ts/` + `hosts/vscode/` | Install-from-VSIX package |
| Shared UI/spec | Vue `packages/settings-ui/` + `packages/shared-spec/` | Embedded by both hosts; shared templates, settings contract, fixtures |

JetBrains and VS Code do not call one another through an Extension Host, RPC, or `kilo serve`. Configure your own `baseUrl`, model, and optional API key; the host renders completion as ghost text.

**License:** Apache-2.0 · **Stage:** open-source preview.

## Features

- OpenAI-compatible HTTP endpoints with advanced header/path/template overrides; supports Ollama, vLLM, compatible gateways, and similar services
- OpenAI FIM, Qwen, DeepSeek, StarCoder, and pseudo-FIM Chat templates with model-name detection
- Saved profiles, model listing, connection tests, and one/all-template probes
- Adaptive debounce, cancellation, generation stale drop, cache, skip, filtering, and error backoff
- Prefix/suffix budgets; no repository or recent-file context by default
- JetBrains PasswordSafe / VS Code SecretStorage; exports contain no secret
- Shared Settings + Logs Web UI (JetBrains JCEF / VS Code Webview) plus host-native log entry points
- Settings UI localisation for English, Chinese, Japanese, and Korean

Known host differences—VS Code has not yet matched JetBrains for `.gitignore`, recent-file context, and comment/string detection—are explicit in [implementation status](docs/IMPLEMENTATION_STATUS.en.md).

## Quick install

### JetBrains

Requires **IntelliJ Platform 2024.2+ (build 242+)**. JCEF is required for the Web settings panel; newer IDEs may need **Web Browser (JCEF)** enabled.

1. Download `auto-complete-*.zip` from GitHub Releases, or build it below.
2. IDE → **Settings/Preferences → Plugins → ⚙ → Install Plugin from Disk…**.
3. Select the ZIP and restart.
4. Open the right-side **Auto Complete** tool window, or use the **Auto Complete** actions in the Tools menu.
5. Create a profile, enter Base URL, model, and optional API key, then run **Test connection** first.

Full compatibility notes: [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md).

### VS Code

Requires VS Code `^1.85.0`.

1. Obtain `auto-complete-*.vsix`, or run local packaging.
2. Extensions → … → **Install from VSIX…**, then reload the window.
3. Run **Auto Complete: Open Settings Panel**, create a profile, and test the connection.
4. **Auto Complete: Show Logs** opens the Logs tab and OutputChannel.

More: [hosts/vscode/README.md](hosts/vscode/README.md).

## Build and verify locally

Requires **JDK 21**, **Node.js 18+**, and npm. From the repository root:

```bash
npm install
./gradlew :core:test :plugin:test
npm run test:js
npm run build:js
./gradlew :plugin:buildPlugin
```

JetBrains development sandbox:

```bash
./gradlew :plugin:runIde
```

Package both hosts:

```bash
./scripts/package-local.sh
# or npm run package:local
```

| Artifact | Path |
|---|---|
| JetBrains ZIP | `plugin/build/distributions/auto-complete-*.zip` |
| VS Code VSIX | `hosts/vscode/dist-vsix/auto-complete-*.vsix` |

For one host: `SKIP_JB=1 ./scripts/package-local.sh` or `SKIP_VSCODE=1 ./scripts/package-local.sh`.

> The packaging script explicitly runs only `:core:test`; run the full JVM and JS tests above before release.

## Local endpoint example

```text
Base URL: http://127.0.0.1:11434/v1
Model:    qwen2.5-coder:7b
API key:  empty only when the service has no auth
Template: AUTO (or QWEN / CHAT etc. for the service)
```

Model and endpoint support for templates varies. Use **Fetch models**, **Test connection**, and **Test template** instead of guessing a request format from the model name.

## Privacy and security

- API keys stay in the IDE secure store, never ordinary configuration, exports, or logs.
- The default request contains budget-trimmed prefix/suffix from the current file; file path is on by default and can be disabled.
- Prompt bodies, recent files, and repository-wide context are off by default.
- Users configure remote endpoints themselves; review the provider's data policy.

For reports, see [SECURITY.md](SECURITY.md).

## Documentation and contributing

- [Documentation index](docs/README.en.md) / [中文](docs/README.md)
- [Architecture](docs/ARCHITECTURE.en.md) · [Settings](docs/SETTINGS.en.md) · [Providers](docs/PROVIDERS.en.md) · [Performance](docs/PERFORMANCE.en.md)
- [Build/release](docs/RELEASE.en.md) · [Implementation status](docs/IMPLEMENTATION_STATUS.en.md) · [Sources and attribution](docs/SOURCES.en.md)
- [Contributing](CONTRIBUTING.md) / [中文](CONTRIBUTING.zh.md)
- [Changelog](CHANGELOG.md)

The project is independently implemented while informed by classic Kilo Code completion behaviour. See [NOTICE](NOTICE) and [sources](docs/SOURCES.en.md).
# Auto Complete

[中文](README.md) · [English](README.en.md) · [Documentation](docs/README.en.md)

<p align="center"><img src="docs/assets/logo.svg" width="96" height="96" alt="Auto Complete logo"/></p>

> Lightweight, bring-your-own-endpoint AI inline completion for JetBrains and VS Code.

Auto Complete renders the next piece of code as ghost text in your editor. You choose the OpenAI-compatible service, model, and optional API key; the product requires no account system and no hosted gateway.

## Why Auto Complete

- **Your endpoint**: works with Ollama, vLLM, OpenAI-compatible services, and enterprise gateways.
- **Two independent hosts**: native JetBrains and VS Code integrations with no Extension Host bridge, RPC, or `kilo serve` dependency.
- **Conservative privacy defaults**: requests contain only budget-trimmed prefix/suffix from the current file; repository context, recent files, and prompt-body logs are off by default.
- **A practical completion pipeline**: template selection, cache, debounce, cancellation, backoff, and post-processing run in the local host/engine.
- **Observable and configurable**: profiles, model probes, connection tests, template tests, and a Settings + Logs panel are available now.

## Install now

### JetBrains

Requires **IntelliJ Platform 2024.2+ (build 242+)**.

1. Download `auto-complete-*.zip` from GitHub Releases.
2. IDE → **Settings/Preferences → Plugins → ⚙ → Install Plugin from Disk…**.
3. Select the ZIP and restart the IDE.
4. Open the **Auto Complete** tool window; create a profile with Base URL, model, and optional API key.
5. Run **Test connection** before coding.

[JCEF compatibility and troubleshooting →](docs/COMPATIBILITY.md)

### VS Code

Requires VS Code `^1.85.0`.

1. Obtain `auto-complete-*.vsix`.
2. Extensions → … → **Install from VSIX…**, then reload the window.
3. Run **Auto Complete: Open Settings Panel**, create a profile, and test the connection.

[VS Code guide →](apps/vscode/extension/README.md)

## First configuration

```text
Base URL: http://127.0.0.1:11434/v1
Model:    qwen2.5-coder:7b
API key:  empty when the service has no authentication
Template: AUTO
```

A model name is not a request protocol. After configuration, use **Fetch models**, **Test connection**, and **Test template** to confirm what the endpoint actually supports.

[Endpoint, model, and template configuration →](docs/PROVIDERS.en.md)

## How to use it

1. Select a profile in the Settings panel, then run **Test connection** and **Test template** first.
2. Type normally in a supported code file. With auto trigger enabled, a candidate appears after the cursor as ghost text.
3. Use the IDE's normal **Tab** acceptance behaviour; continuing to type or moving the cursor cancels an obsolete suggestion.
4. For a manual request: in JetBrains use the trigger action under **Tools → Auto Complete** (bind a shortcut in Keymap if wanted); in VS Code run **Auto Complete: Trigger Inline Completion**, default `Ctrl+Shift+Space` (`Cmd+Shift+Space` on macOS).
5. Use the Settings + Logs panel to diagnose model, template, connection, or request failures. VS Code also mirrors logs to the **Auto Complete** OutputChannel.

Before using a real project, validate automatic suggestions, manual triggering, cancellation while typing, and Tab acceptance in an ordinary text or code file.

## Security and data boundary

- Dedicated API keys live only in JetBrains PasswordSafe or VS Code SecretStorage.
- Endpoint URLs cannot contain user credentials; common credential-style extra headers are rejected.
- Exported settings omit API keys, auth-header templates, and extra headers.
- File paths are on by default but can be disabled; recent-file context and prompt-body logs are off by default.

[Settings, storage, and privacy →](docs/SETTINGS.en.md) · [Security reports →](SECURITY.md)

## Host differences

JetBrains and VS Code are not wrappers around one another. They share behavioural contracts while each implements its own editor adapter. VS Code has not yet fully matched JetBrains for `.gitignore`, recent-file context, or comment/string detection.

[Implementation status and known differences →](docs/IMPLEMENTATION_STATUS.en.md)

## Documentation and contributing

- **Use the product**: [documentation index](docs/README.en.md) · [settings](docs/SETTINGS.en.md) · [providers](docs/PROVIDERS.en.md) · [compatibility/troubleshooting](docs/COMPATIBILITY.md)
- **Understand the implementation**: [architecture](docs/ARCHITECTURE.en.md) · [performance](docs/PERFORMANCE.en.md) · [UiBridge protocol](packages/completion/contracts/bridge-protocol.md)
- **Build, test, and package**: [development and release guide](docs/RELEASE.en.md)
- **Contribute**: [contributing guide](CONTRIBUTING.md) · [changelog](CHANGELOG.md)

**License:** Apache-2.0. This is an independent implementation informed by classic Kilo Code completion behaviour; see [NOTICE](NOTICE) and [sources and attribution](docs/SOURCES.en.md).

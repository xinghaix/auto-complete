# Architecture

[中文](ARCHITECTURE.md) · [Documentation index](README.en.md) · [Project overview](../README.en.md)

> This document describes the code currently in this repository. JetBrains and VS Code are both implemented hosts. They share behavioural specifications, but neither host calls the other's extension host or uses RPC between hosts.

## Scope and product boundary

Auto Complete is bring-your-own-endpoint AI inline code completion. The user configures a `baseUrl`, model, and optional API key; the host renders ghost text and cancels stale requests as editing continues.

It deliberately does **not**:

- use a VS Code Extension Host, `kilo serve`, or an external bridge process for JetBrains;
- send a repository by default or enable multi-file context by default;
- let the Web settings UI call a user endpoint directly;
- run network work on the JetBrains EDT;
- add Agent, Next Edit, or an account system to the completion hot path.

The project independently reimplements completion behaviour inspired by Kilo Code. See [SOURCES.en.md](SOURCES.en.md) and [NOTICE](../NOTICE) for provenance and attribution.

## Repository layout

```text
auto-complete/
├── apps/
│   ├── jetbrains/plugin/                   JetBrains host: inline completion, JCEF, PasswordSafe, IDE HTTP support
│   └── vscode/extension/                   VS Code host: provider, SecretStorage, Webview, OutputChannel
├── packages/
│   ├── completion/
│   │   ├── contracts/        npm `@auto-complete/shared-spec`: settings, templates, language map, UiBridge protocol, golden fixtures
│   │   ├── engine-jvm/       Kotlin/JVM completion engine without IntelliJ UI (Gradle `:core`)
│   │   └── engine-ts/        TypeScript completion engine (npm `@auto-complete/core-ts`)
│   └── settings/ui/          Vue 3 Settings + Logs UI embedded by both hosts
├── docs/                     user and contributor documentation
└── scripts/package-local.sh  local JetBrains ZIP + VSIX packaging script
```

Gradle contains only `core` and `plugin` (`settings.gradle.kts`). The root `package.json` owns the Node workspaces. The two build chains coexist; the JetBrains plugin does not depend on the VS Code extension.

## Host responsibilities

| Layer | JetBrains | VS Code |
|---|---|---|
| Inline entry | `apps/jetbrains/plugin/.../ide/AutoCompleteInlineProvider.kt` | `apps/vscode/extension/src/inline/provider.ts` |
| Engine | `packages/completion/engine-jvm/.../engine/CompletionEngine.kt` | `packages/completion/engine-ts/src/engine.ts` |
| Secret store | PasswordSafe | SecretStorage |
| Settings/logs UI | `settings-ui` in a single **Auto Complete** tool window via JCEF `JbUiBridge` | `settings-ui` in a Webview through `VsCodeUiBridge`; raw logs also go to OutputChannel |
| Regular settings | PersistentStateComponent | `globalState` plus VS Code configuration mirrors |
| Networking | IDE proxy and trust-store adapter (`IdeHttpSupport`) | TypeScript `fetch` client |

JetBrains requires **2024.2 / build 242** or later. Its Web/JCEF panel is the only settings UI: JCEF is available from the platform on 2024.2, while `com.intellij.modules.jcef` is an **optional** dependency on newer IDEs and is loaded reflectively. See [COMPATIBILITY.md](COMPATIBILITY.md). The VS Code extension declares VS Code `^1.85.0`.

## Completion flow

```text
editor event / manual command
  → host captures document state, language, cursor, path, and trigger type
  → CompletionEngine
      1. gate: enabled, snooze, language, comment/string, file size, ignore rules, validation
      2. suggestion-history and prompt-LRU caches
      3. contextual skip
      4. adaptive debounce; cancel previous job for the file scope
      5. PromptBuilder trims prefix/suffix and optionally adds path/recent snippets
      6. HTTP client creates FIM or chat request from the selected template
      7. filter empty, duplicate, and inappropriate multiline output
      8. generation check drops stale output
  → host renders InlineCompletionItem / InlineCompletionGrayTextElement
  → logs, status bar, and UI Bridge update
```

The JetBrains entry reads a document to build prefix and suffix, but `PromptBuilder` trims outgoing data; this is not a default whole-file upload. In the current VS Code provider, comment and string hints are always `false` (`apps/vscode/extension/src/inline/provider.ts`), so those settings do not yet have syntax-aware enforcement on that host. Documentation must not promise full host parity here.

## Engine behaviour

Both engines implement and test:

- generation IDs and cancellable jobs to prevent stale suggestions;
- adaptive automatic-trigger debounce, defaulting to `150 / 300 / 1000 ms` (min / initial / max);
- per-scope suggestion history and an LRU keyed by language, model, and trimmed prompt;
- `.gitignore` (JetBrains) plus extra globs, disabled languages, and file-size gating; VS Code currently injects only extra globs into its engine;
- prefix/suffix prompt budgets, default `8000 / 2000` characters;
- FIM and chat templates, hard timeouts, HTTP error classification, and backoff;
- experimental SSE first-token streaming, redacted logging, and fatal-auth notifications.

The default global `maxInFlight` is 1. A new request cancels one in the same file; at global capacity the engine cancels an in-flight request from another scope instead of building an unbounded queue.

## Providers and templates

The JVM `HttpCompletionClient` and `packages/completion/engine-ts/src/httpClient.ts` resolve a template from the selected value or model name:

| Template | Default relative path | Wire format |
|---|---|---|
| OpenAI FIM / Codestral | `/fim/completions` | `prompt` + `suffix` |
| Qwen, DeepSeek, StarCoder FIM | `/completions` | `prompt` with model-specific FIM tokens |
| Pseudo-FIM Chat | `/chat/completions` | OpenAI-style `messages` |

`AUTO` infers a template from the model name and falls back to chat. The UI can fetch `/models`, test a connection, test a template, or probe all templates. Every probe goes **UI Bridge → host → engine client**; JCEF/Webview code never sends provider HTTP directly. See [PROVIDERS.en.md](PROVIDERS.en.md).

## Settings, privacy, and logs

Global behaviour/performance/log preferences are separate from named provider profiles. Profiles hold endpoint, model, template, timeouts, and optional context-budget overrides. Dedicated API keys always live in PasswordSafe or SecretStorage. Internal UiBridge snapshots expose only `hasApiKey` for that dedicated secret, but retain editable plaintext header fields for local configuration. Portable exports remove API keys, `hasApiKey`, `authHeaderTemplate`, and `extraHeadersJson`; use the dedicated API key plus auth-header template for credentials, never a literal credential in a header field.

Defaults favour responsiveness and privacy: recent-file context is disabled, prompt-body logging is disabled, JetBrains honours `.gitignore` (VS Code currently reliably applies only extra globs), the file limit is 512 KB, and the completion hard timeout is 3000 ms. Enabling `logPromptBodies` writes truncated prompts and is a sensitive option.

The UiBridge envelope, log batching, locale/theme events, and security rules are specified in [packages/completion/contracts/bridge-protocol.md](../packages/completion/contracts/bridge-protocol.md).

## Verification boundary

- Kotlin tests under `packages/completion/engine-jvm/src/test` cover engine, cache, skip, templates, HTTP fixtures, and validation; `apps/jetbrains/plugin/src/test` covers profiles, i18n, and UI state.
- TypeScript fixtures in `packages/completion/engine-ts/test/fixtures.test.ts` use shared-spec golden data; the settings UI tests i18n, mounting, and HTML entries; the VS Code host tests export redaction and type-checks its source-bound engine import.
- CI's JVM job builds the settings UI in its own workspace before `:core:test :plugin:test`, then verifies the ZIP embeds `settings-ui/index.html` and assets before upload. The Node 22 job also builds the settings UI before `npm run test:js`, `npm run build:js`, VSIX packaging, and VSIX upload. A pushed `v*` tag attaches both artifacts to the matching GitHub Release.

For build, installation, and packaging instructions, see [RELEASE.en.md](RELEASE.en.md).
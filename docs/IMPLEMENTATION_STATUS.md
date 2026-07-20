# Implementation Status

Last update: 2026-07-20 (compatibility: since-build 242, optional jcef)

## Current phase

**Open-source preview + dual-host MVP.** JetBrains remains the primary ship path.  
VS Code host + `core-ts` + `shared-spec` + `settings-ui` are in-tree for dual-end work.  
Marketplace publish remains optional / disabled by default.

**JetBrains floor:** Platform **2024.2+** (`since-build` **242**). Settings: Web/JCEF only via optional `com.intellij.modules.jcef` + reflective `SettingsJcefHost`. See `docs/COMPATIBILITY.md`.

## Done

### Architecture
- Single-process Kotlin plugin
- `core` pure engine + `plugin` IDE layer
- No VS Code Extension Host / `kilo serve` bridge

### Engine
- Adaptive debounce
- Generation-based stale drop
- Real async cancel (`completeAsync` + token + HTTP `sendAsync`)
- Suggestion history cache (exact / partial / backspace)
- Prompt LRU
- Contextual skip
- Prompt budget
- Suggestion filter + first-line-only
- Error backoff + fatal notify hook
- Comment/string gates
- maxInFlight
- Optional stream first-token
- Optional prompt body logging
- Optional token usage log
- Structured level-filtered logs for HTTP, settings probes, engine gates, project context, and accepts

### IDE
- InlineCompletionProvider ghost text
- Manual trigger prefers DirectCall ghost text
- Settings 4 tabs
- Provider tab interaction aligned to common AI-completion settings: readable providers, help tooltips, Base URL presets, Test Connection + inline status + collapsible details, auto model load, model warning
- Prompt templates: Auto / Codestral API / Qwen / DeepSeek / StarCoder / Chat Pseudo-FIM; model-name detection; test current + try-all probe loop
- Dual timeouts: completion `timeoutMs` (default 3000) vs settings probes `settingsTimeoutMs` (default 15000); hard outer cancel so UI never hangs on “Working…”
- IDE HTTP Proxy + CertificateManager trust store for outbound HTTP (parity with built-in AI features)
- Settings probe diagnostics: immediate INFO (no HTTP dependency), ModalityState.any() UI updates, UI watchdog, DumbAware log tool window, dual-write to idea.log
- PasswordSafe key
- Status bar
- Logs tool window
- Project `.gitignore` load
- Recent open-file snippets listener
- Notification group for fatal errors
- IDE locale-based UI localization: English, Chinese, Japanese, Korean; English fallback
- Editable model selector with OpenAI-compatible `/models` discovery

### Verification
- `./gradlew :core:test` green
- `./gradlew :plugin:buildPlugin` green
- Local zip produced under `plugin/build/distributions/`

### Dual-end (VS Code + shared Web)

- `packages/shared-spec`: settings schema, templates, language-map, UiBridge protocol (profile CRUD + export/import), golden fixtures
- `packages/core-ts`: TypeScript port of gate/cache/skip/debounce/prompt/HTTP/filter/engine + fixture tests
- `hosts/vscode`: InlineCompletion, multi-profile `globalState` + per-profile SecretStorage, Webview UiBridge, OutputChannel
- `packages/settings-ui`: React **Settings | Logs** (en/zh/ja/ko): follows IDE locale via `getPlatform` / `localeChanged`; profiles CRUD, advanced, probes, log filter, export/import
- JetBrains: **single tool window** Web UI (Settings | Logs); **no** separate Logs tool window; **no** IDE Settings Configurable; optional jcef + reflective host; `copySettingsUi` packages dist
- settings-ui: property-row layout (Provider / Behavior / Advanced), sticky Apply bar, host open-tab (JB + VS Code)
- CI: JDK job + Node job (`test:core-ts`, `build:js`)

## Intentionally deferred / optional

- JetBrains Marketplace submission (optional)
- Plugin signing automation
- Store listing screenshots / marketing copy
- Agent / Next Edit product
- Metrics dashboard UI
- Richer language-specific templates
- Customizable keymap editor for manual shortcut
- Streaming default / richer SSE productization
- Full i18n ja/ko inside settings-ui (en/zh done; JB Swing still four locales)

## Next for self-use

1. Install JB zip and/or VS Code extension from disk
2. Open **Auto Complete** tool window / settings panel; point at Ollama
3. Dogfood both hosts; keep shared-spec fixtures green when changing engine behavior
4. Only then consider version bump + optional public packaging

# Implementation status

[中文](IMPLEMENTATION_STATUS.md) · [Documentation index](README.en.md)

> This page records what the current source implements and explicit host differences. Treat CI or local command output—not this page—as evidence of a particular build/test result.

## Implemented in this tree

| Area | JetBrains | VS Code / shared |
|---|---|---|
| Host | `InlineCompletionProvider`, manual trigger, cancel, toggle, snooze, status bar, one Settings/Logs tool window | `InlineCompletionItemProvider`, Trigger/Toggle/Settings/Logs/Set API Key commands, status bar, OutputChannel |
| Engine | Kotlin `CompletionEngine`, cancellable async HTTP, cache, skip, filter, backoff, prompt budget | TypeScript dual engine with the same main pipeline and shared fixtures |
| Providers | OpenAI FIM, Qwen/DeepSeek/StarCoder token FIM, pseudo-FIM chat, template/connection/model probes | Equivalent template categories and HTTP-client semantics |
| Settings | Multi-profile, PasswordSafe, PersistentState, JCEF UiBridge, IDE proxy/trust-store support | Multi-profile, SecretStorage, globalState/config mirror, Webview UiBridge |
| Shared UI/spec | — | Vue 3 `settings-ui` (en/zh/ja/ko), `shared-spec` schema/templates/language map/bridge/fixtures |
| CI | JDK 21 tests + `buildPlugin` + ZIP artifact | Node 22 builds settings UI, runs JS tests/build, then packages and uploads VSIX |

JetBrains support is **IntelliJ Platform 2024.2+ / build 242+**. JCEF is required for the Web settings panel, but `com.intellij.modules.jcef` is optional on newer IDEs; older platforms discover available JCEF reflectively. See [COMPATIBILITY.md](COMPATIBILITY.md). The VS Code extension declares `^1.85.0`.

## Implemented engine semantics

- enablement, auto/manual trigger, path/language/size gates;
- adaptive debounce, per-scope cancellation, generation stale drop, global `maxInFlight`;
- suggestion history and prompt LRU;
- FIM/chat prompts, model-name template detection, path override, `/models` fallback;
- separate `timeoutMs` and `settingsTimeoutMs`; experimental SSE first-token streaming;
- fatal 401/403 and retriable 429/5xx/network backoff;
- logs, output filtering, optional path/recent-file context;
- profile CRUD, isolated secrets, secret-free export/import.

## Known differences and incomplete parity

| Item | Current fact |
|---|---|
| Comment/string detection | JetBrains supplies `ContextProbe` hints. The VS Code provider currently fixes `inComment=false` and `inString=false`, so those switches are not syntax-enforced there yet. |
| `.gitignore` | JetBrains loads it during project attachment. VS Code currently does not inject workspace `.gitignore` into the TS engine, so its extra globs are the reliable path filter. |
| Recent-file context | JetBrains collects open-file snippets and omits their paths when `sendFilePath=false`, but does not yet apply ignore/size/language eligibility to every related file. VS Code currently supplies no recent-file snippets to the TS engine. |
| Settings entry | JetBrains has only the JCEF tool-window entry, no Swing Configurable. VS Code has a Webview and mirrors selected common settings to native Settings. |
| Secret/config naming | Both hosts provide equivalent concepts but internal persistence keys/names differ; do not manually copy storage files. |
| Publishing automation | CI builds/tests; a pushed `v*` tag creates a same-tag GitHub Release only when one does not already exist, then uploads ZIP/VSIX. Signing and Marketplace remain manual. |
| Agent / Next Edit | Out of scope. |

README, release notes, and Marketplace copy must not hide these gaps. Any claim of full host parity requires implementation and tests.

## Verification commands

```bash
npm install
npm run build:settings-ui
./gradlew :core:test :plugin:test
npm run test:js
npm run build:js
./gradlew :plugin:buildPlugin
./scripts/package-local.sh
```

`package-local.sh` creates ZIP and VSIX but explicitly runs only `:core:test`; run the full tests separately. See [RELEASE.en.md](RELEASE.en.md).
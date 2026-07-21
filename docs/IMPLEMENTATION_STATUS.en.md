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
| Shared UI/spec | — | `packages/settings/ui` (Vue 3, en/zh/ja/ko; npm: `@auto-complete/settings-ui`), `packages/completion/contracts` schema/templates/language map/bridge/fixtures (npm: `@auto-complete/shared-spec`) |
| CI | JDK 21 tests + `buildPlugin` + ZIP artifact | Node 22 JS tests + JS build |

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

## Cross-host strategy

**Converge by default:** same schema, same settings-ui, same engine gate semantics (enable, debounce, ignore, comment/string, recent files, logging, fatal notify).  
**Allow differences only where the platform forces them:** storage medium, settings entry chrome, secret APIs, command/keymap registration, VS Code native Settings mirror.

## Known differences (allowed platform gaps)

| Item | Current fact |
|---|---|
| Comment/string detection | Both hosts use a cheap heuristic `ContextProbe` (JB Kotlin / VS Code TS `inspectContext`). |
| `.gitignore` | Both inject workspace/project-root `.gitignore` (JB on attach; VS Code via `VsCodeProjectContext` refresh). |
| Recent-file context | Both support it; JB uses open files, VS Code open/visible editors (limit / maxChars). |
| Settings entry | JetBrains: JCEF tool window (no Swing Configurable). VS Code: Webview + partial native Settings mirror. |
| Secret/config storage | Conceptually equivalent; internal keys differ — do not hand-copy storage; use export/import. |
| Action surface | JetBrains has snooze (status bar / action). VS Code uses Toggle/commands; no equivalent snooze field. |
| Publishing automation | CI builds/tests; `v*` tags may upload ZIP/VSIX. Signing and Marketplace stay manual. |
| Agent / Next Edit | Out of scope. |

Do not describe storage-path differences as feature differences. Full behavioural parity claims require implementation and tests.

## Verification commands

```bash
npm install
./gradlew :core:test :plugin:test
npm run test:js
npm run build:js
./gradlew :plugin:buildPlugin
./scripts/package-local.sh
```

`package-local.sh` creates ZIP and VSIX but explicitly runs only `:core:test`; run the full tests separately. See [RELEASE.en.md](RELEASE.en.md).
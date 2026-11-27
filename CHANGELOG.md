# Changelog

## [Unreleased]

## [0.2.5] - 2026-11-27

### Security

- `[both]` Prevent plaintext credential leakage through `authHeaderTemplate`: fix the UI placeholder to `Authorization: Bearer ${apiKey}`, require `${apiKey}` in server/UI validation, stop mirroring `authHeaderTemplate` and `extraHeadersJson` to VS Code `settings.json` (Settings Sync), and disable cloud roaming (`RoamingType.DISABLED`) on JetBrains `autoCompleteSettings.xml`.
- `[both]` Harden `importSettings`: validate top-level JSON structure, regenerate fresh profile UUIDs (remapping `activeProfileId`), never inherit local secrets or stripped header fields, and remove orphaned secrets for deleted profiles.
- `[both]` Enforce server-side `applySettings` validation, block sensitive credential headers in `extraHeadersJson` (preventing `Authorization` override), and redact URL query tokens and echoed credentials from logs and error messages.
- `[both]` Filter optional recent-file context snippets through `.gitignore`, `ignoreGlobs`, `maxFileSizeKb`, current-file exclusion, workspace bounds, and `sendFilePath=false`.
- `[jetbrains]` Delete the legacy PasswordSafe `"apiKey"` entry immediately after profile migration and disallow legacy fallback whenever multi-profile state exists.
- `[vscode]` Inject strict nonce-based `Content-Security-Policy` (`connect-src 'none'`) into Settings Webview HTML and fallback HTML.
- `[jetbrains]` Inject `Content-Security-Policy` (`connect-src 'none'`) into JCEF Settings HTML.

### Added

- `[settings-ui]` Quick Service Presets (Ollama Local, DeepSeek Beta FIM, Mistral Codestral, vLLM / LM Studio), explicit **Save key** button, **Test connection** button, and 1-click **Apply recommended template** after **Try all templates**.
- `[settings-ui]` Local Session Stats card (requests, cache hits, accepted, cancelled, failed, P50/P95 latency, debounce, backoff status — local-only, zero upload) and **Clear cache & reset backoff** button.
- `[settings-ui]` Logs search filter, auto-scroll toggle, structured diagnostic fields, and host-bridged clipboard copy (`copyToClipboard`) with in-panel fallback modal.
- `[both]` `CODELLAMA` FIM prompt template (`<PRE>/<SUF>/<MID>`), native `RESPONSES` template for OpenAI `/v1/responses` (`instructions`, `input`, `max_output_tokens`, `store: false`, nested `extraBodyJson` such as `{"reasoning":{"effort":"none"}}`), per-profile `extraBodyJson` / `stopSequences` / `responsesPath`, and mid-line streaming early-stop.
- `[both]` Status bar quick menus: JetBrains `JBPopupFactory` popup (profile switch, toggle, snooze presets, current-language toggle, Settings/Logs, clear cache & reset backoff) and VS Code `QuickPick` menu + force-refresh trigger.
- `[vscode]` Enterprise HTTP proxy and `http.proxyStrictSSL` TLS support via built-in Node networking (`proxyFetch`).
- `[ci]` Weekly `schedule` CI runs, `npm run typecheck:js` (`tsc` + `vue-tsc`), `:plugin:verifyPlugin` compatibility matrix job, ZIP integrity gates (`settings-ui`, zero `kotlin-stdlib`/`annotations`, non-placeholder `<change-notes>`), and cross-manifest release version alignment test.

### Fixed

- `[jetbrains]` Exclude `kotlin-stdlib` and JetBrains `annotations` JARs from the JetBrains plugin distribution ZIP to prevent `LinkageError` on IntelliJ IDEA 2025/2026+.
- `[jetbrains]` Preserve request correlation `id` in `JbUiBridge` error envelopes (preventing 120s UI hangs), move JCEF bridge handling off the CEF/OOP thread, eliminate duplicate `subscribeLogs`/`openTab` dispatches, and clean up temporary JCEF asset directories on dispose.
- `[jetbrains]` Fix `SettingsWebPanel` recovery button empty-arguments dialog bug and `JcefEnvironment` baseline-version diagnostics for 2026.2+ bundled *Web Browser (JCEF)*.
- `[jetbrains]` Run manual fallback insertion on EDT inside `WriteCommandAction` with disposed/offset guards, pass request IDs on `cancelScope`, share a single pooled `HttpClient`, move `PasswordSafe` lookups off EDT, and fix dynamic unload / Disposer / listener leaks.
- `[jetbrains]` Fix `extractLatestNotes()` in Gradle build to skip `## [Unreleased]` instead of emitting placeholder `<change-notes>`, and fail `copySettingsUi` when `packages/settings/ui/dist` is missing.
- `[both]` Reset fatal `401/402/403` error backoff on settings/key updates or cache clear and allow manual/probe recovery so completion is never permanently stuck.
- `[both]` Auto-resolve `/completions` for `https://api.deepseek.com/beta` with `CODESTRAL_API`, preserve query parameters in `joinUrl`, fix streaming whitespace token stripping / stream reader cleanup / TS timeout classification, and fix concurrency and debounce bounds (`coerceIn`).
- `[both]` Fix `SuggestionFilter` 1-char operator stripping & unintended whitespace trimming, `ContextualSkip` newline skipping, `IgnoreRules` glob anchoring & `dir/` matching, `ContextProbe` Rust lifetime & multiline string handling, LRU cache keying/TTL, and JSON/IPv6 URL validation.
- `[settings-ui]` Resolve 26 `vue-tsc` errors, auto-save debounce races on snapshot load / probe / profile switch, cross-profile API key bleed, blank profile blocking global settings, numeric input backspace coercion, dropdown keyboard navigation & upward flip positioning, light/high-contrast theme flashing, and import modal error layering.
- `[vscode]` Eliminate 33× cascading `settings.json` writes via diff-only mirroring and re-entrancy guard, unify `globalState` as single source of truth, fix empty `profiles: []` import/apply, wire `onLog` across all probes/model listing, fix initial `Show Logs` tab delivery, and guard `postMessage` on disposed Webviews.
- `[jetbrains]` Format status bar `snoozeUntil` as human-readable local time instead of raw epoch milliseconds and sync IDE theme changes via `LafManagerListener`.

### Changed

- `[jetbrains]` Adopt Plan A IntelliJ IDEA 2024.2–2026.2+ single-package compatibility: keep `sinceBuild=242` with JDK 21 bytecode, replace internal `EditKeymapsDialog` with public `ShowSettingsUtil`, remove Kotlin `$default` / `DefaultConstructorMarker` Inline Completion signatures, use suspending `readAction` with windowed slicing, migrate `AutoCompleteBundle` to modern `DynamicBundle`, and remove dead legacy classes.
- `[both]` Raise Node.js baseline to Node 20+ (CI uses Node 22), make `npm run test:js` self-contained from a clean checkout, and add JetBrains ZIP integrity verification to `scripts/package-local.sh`.

## [0.2.4] - 2026-08-21

### Fixed

- `[jetbrains]` Replace the internal plugin descriptor lookup with the public plugin installation check API for IntelliJ IDEA 2026.2 compatibility.

## [0.2.3] - 2026-07-27

### Fixed

- `[settings-ui]` Opaque floating dropdowns in dark theme (Windows JCEF “see-through” / stacking bleed over page content)

### Changed

- `[jetbrains]` Keep `com.intellij.modules.jcef` optional for 2024.2+ compatibility; show a Swing recovery panel with install steps when JCEF is unavailable (settings UI remains JCEF-only when the browser works)

## [0.2.2] - 2026-07-27

### Changed

- `[jetbrains]` Migrate project lifecycle initialization to the public `ProjectActivity` API, removing internal and scheduled-for-removal listener methods

## [0.2.1] - 2026-07-24

### Added

- Settings UI: **Configure in Keymap…** jumps to host keyboard shortcuts for manual trigger (`openKeymap` bridge; JB `AutoComplete.Trigger`, VS Code `autoComplete.trigger`)

### Changed

- Docs restructured for end users: **`docs/GUIDE`** (install/config/providers) + **`docs/DEV`** (build/sign/release); removed fragmented SETTINGS/PROVIDERS/PERFORMANCE/ARCHITECTURE/… pages
- JetBrains install docs prioritize [Marketplace plugin 33040](https://plugins.jetbrains.com/plugin/33040-auto-complete); signed ZIP is the fallback
- CI ships **signed** JetBrains ZIP only (`*-signed.zip`); unsigned ZIPs are no longer release artifacts
- Marketplace widget id `33040` documented for site embeds

### Fixed

- `[jetbrains]` Preserve and surface the real JCEF initialization cause instead of showing only the reflection wrapper `InvocationTargetException`

## [0.2.0] - 2026-07-21

### Added

- Open-source packaging: public README, CONTRIBUTING, SECURITY, CI, issue templates
- Saved configuration profiles (create / switch / rename / delete; PasswordSafe per profile)
- Prompt templates: Auto / OpenAI FIM / Qwen / DeepSeek / StarCoder / Chat; test current + try all
- Dual timeouts (completion vs settings probes); IDE HTTP Proxy
- Per-profile optional override of Performance context window; Keymap-linked manual trigger
- UI localization: English, Chinese, Japanese, Korean
- `[both]` `packages/completion/contracts`: settings schema, templates, language-map, UiBridge protocol, golden fixtures
- `[vscode]` `packages/completion/engine-ts` TypeScript completion engine + fixture tests
- `[vscode]` `apps/vscode/extension` multi-profile globalState + per-profile SecretStorage, Webview, OutputChannel
- `[settings-ui]` full Settings|Logs UI: profile CRUD, advanced, probes, log filter, export/import
- `[settings-ui]` full i18n en/zh/ja/ko; auto-follow IDE language (VS Code `env.language`, JB `DynamicBundle`)
- `[jetbrains]` JCEF-only Settings + Logs tool window; Swing settings UI removed; `com.intellij.modules.jcef` is optional on newer IDEs
- CI Node job for `core-ts` tests and JS package build

### Changed

- Settings layout: property rows, help tooltips, Chinese copy polish
- Plugin description prepared for public zip / GitHub Releases (Marketplace still optional)
- README / ARCHITECTURE document dual-host layout (JetBrains + VS Code)
- `[jetbrains]` Settings are **Web-only** (no Swing settings form); JCEF via optional module + reflection
- `[jetbrains]` JCEF host loaded reflectively; `com.intellij.modules.jcef` is **optional** (2024.2 platform JCEF + 2026 jcef plugin)
- `[jetbrains]` Minimum IDE **2024.2** (`since-build` **242**); see `docs/GUIDE.md`
- `[settings-ui]` full-width tool-window layout; drop redundant title/host top bar (keep tabs only)
- `[settings-ui]` fuse saved-profile select + rename into one toolbar row

### Fixed

- `[settings-ui]` native `<select>` menus unusable under JCEF (card `overflow:hidden` clipped popups; force menulist appearance)
- `[settings-ui]` profile control is a single editable combo (type to rename, dropdown to switch)

## [0.1.1] - 2026-07-13

Preview build (Install from Disk).

### Fixed

- Real async cancel path for in-flight HTTP completion requests
- Settings that previously had fields but no behavior: comments/strings gates, maxInFlight, stream, logPromptBodies, logLevel, notifyOnFatalError, showCostApprox
- Project `.gitignore` is loaded into ignore rules
- Recent open-file snippets listener for optional multi-file context
- Manual trigger prefers native ghost text instead of always inserting text

### Changed

- Local distribution artifact named `auto-complete-<version>.zip`
- Packaging script and private-release docs for Install from Disk workflow

## [0.1.0] - 2026-07-13

Initial preview build (Install from Disk).

### Added

- Native JetBrains inline ghost-text completion (no VS Code Extension Host / CLI bridge)
- Core engine: adaptive debounce, generation cancel, suggestion cache, contextual skip, prompt budget, filter, error backoff
- Providers: OpenAI-compatible chat, Mistral/Codestral FIM, custom path/headers
- Settings pages: Provider / Behavior / Performance / Privacy & Logs
- PasswordSafe API key storage
- Status bar widget and Logs tool window
- Test Connection
- Project `.gitignore` loading and optional recent-file context
- Manual trigger via `Ctrl+Shift+Space` (prefers ghost text)
- Fatal auth notification
- Stream first-token support (experimental)

### Notes

- Target IDE: 2024.2+
- Default local endpoint: `http://127.0.0.1:11434/v1`

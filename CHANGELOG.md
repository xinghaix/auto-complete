# Changelog

## [Unreleased]

### Added

- Settings UI: **Configure in Keymap…** jumps to host keyboard shortcuts for manual trigger (`openKeymap` bridge; JB `AutoComplete.Trigger`, VS Code `autoComplete.trigger`)

### Changed

- JetBrains install docs prioritize [Marketplace plugin 33040](https://plugins.jetbrains.com/plugin/33040-auto-complete); signed ZIP is the fallback
- CI ships **signed** JetBrains ZIP only (`*-signed.zip`); unsigned ZIPs are no longer release artifacts
- Marketplace widget id `33040` documented for site embeds

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
- `[jetbrains]` Minimum IDE **2024.2** (`since-build` **242**); see `docs/COMPATIBILITY.md`
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

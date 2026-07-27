# AGENTS.md

Guidance for agents and contributors working in `auto-complete`.

## Product and current topology

Auto Complete is a dual-host, bring-your-own-endpoint AI inline completion product:

- **JetBrains:** `apps/jetbrains/plugin/` host (Gradle `:plugin`) + Kotlin/JVM `packages/completion/engine-jvm/` engine (Gradle `:core`).
- **VS Code:** `apps/vscode/extension/` host (npm `auto-complete`) + TypeScript `packages/completion/engine-ts/` engine (npm `@auto-complete/core-ts`).
- **Shared:** `packages/completion/contracts/` contracts/fixtures (npm `@auto-complete/shared-spec`) and Vue `packages/settings/ui/` (npm `@auto-complete/settings-ui`) embedded through each host bridge.

The hosts run independently. JetBrains must never use a VS Code Extension Host, `kilo serve`, or an RPC bridge to obtain completion. The project is an independent implementation informed by Kilo Code behaviour; see `NOTICE`.

User-facing docs (Chinese/English pairs): root `README.md` / `README.en.md`, then **`docs/GUIDE.md` / `docs/GUIDE.en.md`**. Maintainer build/sign/release: **`docs/DEV.md` / `docs/DEV.en.md`**. Index: `docs/README.md`.

## Stage and distribution

Open-source preview:

- **JetBrains (preferred):** [Marketplace plugin 33040](https://plugins.jetbrains.com/plugin/33040-auto-complete). Fallback: GitHub Release **`*-signed.zip`** (Install from Disk).
- **VS Code:** GitHub Release / local VSIX.
- CI builds **signed** JetBrains ZIPs only when `CERTIFICATE_CHAIN` + `PRIVATE_KEY` secrets are set; unsigned ZIPs are not release artifacts. `v*` tags create GitHub Releases; optional `publishPlugin` with `PUBLISH_TOKEN`.
- Do not commit Marketplace/signing tokens, private keys, API keys, or private endpoints.

## Required reading before meaningful changes

1. `docs/GUIDE.md` (user-facing behaviour, settings, providers)
2. `docs/DEV.md` (layout, build, sign, release, allowed host gaps)
3. `CONTRIBUTING.md`
4. `packages/completion/contracts/bridge-protocol.md` when changing UiBridge

## Hard constraints

- No VS Code host/RPC bridge or `kilo serve` runtime dependency for JetBrains.
- Do not store API keys in plain XML, settings JSON, snapshots, exports, fixtures, or logs.
- **Do not commit personal privacy or machine environment:** home directories (`/Users/…`, `C:\Users\…`), private emails, phone numbers, real API keys/tokens, LAN IPs, private/corporate endpoints, local absolute paths to this clone, or machine hostnames. Use localhost examples (`http://127.0.0.1:11434/v1`) and public project URLs only. Docs may show generic tool paths (e.g. Homebrew JDK) as install examples, never a contributor’s username path.
- Do not perform HTTP or large text work on the JetBrains EDT.
- Do not default to whole-file, whole-repository, or recent-file context.
- Settings UI must not directly call user provider HTTP: use UI Bridge → host → engine client.
- Preserve cancellation and generation checks; cancellation is a normal path.
- Keep `com.intellij.modules.jcef` **optional** (2024.2 platform/JBR JCEF vs 2026 Web Browser plugin). Load JCEF through `SettingsJcefHost` reflection; do not place `JBCefBrowser` types on `SettingsWebPanel`. When JCEF is missing, show a **Swing** recovery panel with steps (never depend on JCEF for that UI).
- JetBrains minimum remains 2024.2 / `pluginSinceBuild=242` unless `docs/GUIDE.md` / `docs/DEV.md` and tests are deliberately updated.
- No Agent/Next Edit product scope in the completion path.
- Prefer cross-host **behavioural** parity (schema, settings-ui, engine gates). Allow only platform-forced differences (storage, chrome, secret APIs, commands). Document intentional gaps in `docs/DEV.md` (allowed host gaps) and user-visible notes in `docs/GUIDE.md`.
- **Settings UI changes must be dual-host checked** (JetBrains JCEF + VS Code Webview). See “Dual-host UI checklist” below.

## Dual-host UI checklist

`packages/settings/ui` is shared, but the two embeds behave differently. For any user-visible UI work (layout, controls, dialogs, menus, i18n, bridge messages, CSS):

1. **Do not assume browser/Webview APIs work under JCEF** — avoid or replace:
   - `window.prompt` / `window.confirm` / `window.alert` (JCEF shows ugly native chrome with `file://` titles)
   - Relying solely on `window.open` for http(s) links — use bridge `openExternal` (host system browser)
   - Native `<select>` popups under overflow ancestors — use custom floating menus (`Teleport` + fixed)
2. **Prefer in-panel UI** for modals, text paste, multi-line import, confirmations.
3. **Bridge both hosts** for new UI → host actions (`openExternal`, file pickers, clipboard if restricted, etc.).
4. **i18n:** add keys to all catalogs (en / zh / ja / ko); never leave a locale empty.
5. **Verify both embeds** before merge when practical:
   - JetBrains: `./gradlew :plugin:runIde` or install ZIP from `package-local.sh`
   - VS Code: F5 / Install from VSIX
   - Smoke: open each tab, open dropdowns/modals, import/export, theme light/dark, language switch
6. If a behaviour cannot be equal, document the intentional gap in `docs/DEV.md` — do not ship a “works only on one host” control silently.

## After every fix: local repackage

When a fix or UI change is done (especially settings-ui, plugin, or VS Code extension), **repackage locally** so installable artifacts match the tree:

```bash
./scripts/package-local.sh
```

Do this by default after bugfixes the user will install from Disk/VSIX — do not leave only `src/` updated. Artifacts:

- JetBrains: `apps/jetbrains/plugin/build/distributions/auto-complete-*.zip`
- VS Code: `apps/vscode/extension/dist-vsix/auto-complete-*.vsix`

Host-only: `SKIP_JB=1` or `SKIP_VSCODE=1`. Packaging is not a substitute for full tests.

## Local verification

```bash
npm install
./gradlew :core:test :plugin:test
npm run test:js
npm run build:js
./gradlew :plugin:buildPlugin
./scripts/package-local.sh
```

`package-local.sh` builds JCEF/Webview assets, ZIP, and VSIX but explicitly tests only `:core:test`; it does not replace the full test set. For host-only packages, set `SKIP_JB=1` or `SKIP_VSCODE=1`.

## Git

- Use conventional commit prefixes where practical: `feat:`, `fix:`, `docs:`, `chore:`, `test:`.
- Release commits use `chore(release): X.Y.Z`; annotated tags use `vX.Y.Z`.
- Do not push, tag, publish, or force-push without explicit user direction.

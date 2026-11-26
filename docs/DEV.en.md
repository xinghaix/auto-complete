# Build & release (maintainers)

[中文](DEV.md) · [User guide](GUIDE.en.md) · [Contributing](../CONTRIBUTING.md)

End users should install from [Marketplace](https://plugins.jetbrains.com/plugin/33040-auto-complete) or GitHub Releases — this page is for maintainers.

## Environment

| Goal | Need |
|---|---|
| JetBrains plugin | **JDK 21** (not Homebrew default openjdk 26; targets Java 21 bytecode) |
| Settings UI / VS Code | **Node 20+** (CI runs Node 22), npm |
| Signing / CI artifacts | Secrets: `CERTIFICATE_CHAIN`, `PRIVATE_KEY` (optional `PRIVATE_KEY_PASSWORD`, `PUBLISH_TOKEN`) |

```bash
# macOS example
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
```

## Test, typecheck & local package

```bash
npm install
./gradlew :core:test :plugin:test
npm run typecheck:js
npm run test:js
npm run build:js
./gradlew :plugin:verifyPlugin
./scripts/package-local.sh   # or SKIP_JB=1 / SKIP_VSCODE=1
```

- `npm run typecheck:js` builds `@auto-complete/core-ts` declarations and runs typechecks across all JS/TS workspaces (including `vue-tsc` for `settings-ui`).
- `npm run test:js` works cleanly from a fresh checkout: it runs `test:core-ts` → `build:core-ts` → `build:settings-ui` → `test:settings-ui` (including cross-manifest version alignment in `releaseVersion.test.ts`) → `test:vscode`.
- `scripts/package-local.sh` verifies JetBrains ZIP integrity after packaging (`settings-ui/index.html` + `settings-ui/assets/*` embedded, non-placeholder `<change-notes>`, and **zero** bundled `kotlin-stdlib*.jar` or `annotations-*.jar`).

| Artifact | Path |
|---|---|
| JetBrains ZIP | `apps/jetbrains/plugin/build/distributions/` (`*-signed.zip` when signing env is set) |
| VS Code VSIX | `apps/vscode/extension/dist-vsix/auto-complete-*.vsix` |

Sandbox: `./gradlew :plugin:runIde`. `package-local.sh` runs `:core:test` and ZIP integrity checks, and is not a substitute for the full test suite above.

## IntelliJ IDEA 2024.2–2026.2+ compatibility policy (Plan A)

This repository follows **Plan A (single-package multi-version compatibility)** across IntelliJ Platform 2024.2 through 2026.2+:

- **Single package & bytecode:** keep `pluginSinceBuild=242` with open `untilBuild` (`null`), compiled with **JDK 21** toolchain (classfile 65), which runs forward-compatibly on IntelliJ IDEA 2026.2's JBR 25 runtime.
- **Optional JCEF isolation:** `com.intellij.modules.jcef` stays `<depends optional="true">` and loads via `SettingsJcefHost` reflection; when JCEF is missing or the 2026.2+ bundled *Web Browser (JCEF)* plugin is disabled, the tool window falls back to a pure **Swing** recovery page with `baselineVersion`-aware steps.
- **Zero `kotlin-stdlib` / `annotations` bundling:** `:plugin` excludes `org.jetbrains.kotlin` and `org.jetbrains:annotations` when depending on `:core` to prevent `LinkageError` against IDEA 2025/2026 bundled Kotlin runtimes. Both CI and `scripts/package-local.sh` fail the build if any forbidden JAR is present.
- **Binary-safe public APIs:** Inline Completion and action call sites pass explicit arguments / explicit implementations (eliminating Kotlin `$default` and `DefaultConstructorMarker` synthetic fragility), open Keymap/Plugins via public `ShowSettingsUtil` configurable IDs instead of internal dialogs, and keep `PasswordSafe` off EDT.
- **CI compatibility matrix gate:** the `verify-plugin` job runs `./gradlew :plugin:verifyPlugin` (`pluginVerification { ides { recommended() } }`) on every PR, `main` push, release tag, and weekly schedule to catch platform API changes early.

## Signing & Marketplace

Plugin page: https://plugins.jetbrains.com/plugin/33040-auto-complete · numeric id `33040` · code id `io.autocomplete`

```bash
# Generate materials outside the repo
mkdir -p ~/.jb-plugin-signing && cd ~/.jb-plugin-signing
openssl genrsa -out private.pem 4096
openssl req -new -x509 -key private.pem -out chain.crt -days 3650

export CERTIFICATE_CHAIN="$(cat ~/.jb-plugin-signing/chain.crt)"
export PRIVATE_KEY="$(cat ~/.jb-plugin-signing/private.pem)"
npm run build:settings-ui
./gradlew :plugin:buildPlugin :plugin:signPlugin
# → apps/jetbrains/plugin/build/distributions/auto-complete-*-signed.zip
```

| Secret | Use |
|---|---|
| `CERTIFICATE_CHAIN` / `PRIVATE_KEY` | Signing (CI uploads **signed ZIP only** when set) |
| `PRIVATE_KEY_PASSWORD` | Optional |
| `PUBLISH_TOKEN` | Optional `publishPlugin` |

Site embed card (GitHub README **cannot** run the script — use a badge):

```html
<script src="https://plugins.jetbrains.com/assets/scripts/mp-widget.js"></script>
<script>
  MarketplaceWidget.setupMarketplaceWidget('card', 33040, "#yourelement");
</script>
```

Official: [Plugin Signing](https://plugins.jetbrains.com/docs/intellij/plugin-signing.html) · [Publishing](https://plugins.jetbrains.com/docs/intellij/publishing-plugin.html)

## CI & release

| Scenario | Behaviour |
|---|---|
| PR / main push | `jvm` (tests + unsigned ZIP integrity gate, no release artifacts uploaded), `js` (`typecheck:js` + `test:js` + `build:js`), `verify-plugin` (`:plugin:verifyPlugin`) |
| Weekly `schedule` | Runs full checks + `:plugin:verifyPlugin` continuously against recommended IDEA releases/EAPs |
| Annotated `v*` tag targeting `main` history | Waits for `jvm` and `verify-plugin`, runs `buildPlugin` + `signPlugin` + signed ZIP integrity verification, uploads **signed ZIP only**, packages VSIX, and creates a GitHub Release |
| Valid `v*` tag + `PUBLISH_TOKEN` | Optional Marketplace API publish (Node 22 + identical ZIP integrity checks before `publishPlugin`) |
| Side-branch, lightweight, or not-yet-merged `v*` tag | CI fails; no package, GitHub Release, or Marketplace publish |

Checklist: align all manifest versions (verified by `packages/settings/ui/src/releaseVersion.test.ts` across root `package.json`, `gradle.properties`, workspace manifests, `App.vue`, and `CHANGELOG.md`) → update `CHANGELOG.md` → run full tests & typechecks → merge and verify the release commit on `main` → smoke (Marketplace or signed ZIP) → create annotated tag `vX.Y.Z` from that commit. CI verifies that the tag target is in `main` history. Keys/tokens only in Secrets.

## Architecture (short)

Two independent hosts + two engines + one Web settings UI. **No** JB↔VS Code RPC / `kilo serve` / Agent / Next Edit.

```text
apps/jetbrains/plugin/     JB host (Gradle :plugin)
apps/vscode/extension/     VS Code host
packages/completion/
  engine-jvm/              Kotlin engine (:core)
  engine-ts/               TypeScript engine
  contracts/               schema, templates, UiBridge, fixtures
packages/settings/ui/      Vue settings panel
```

| | JetBrains | VS Code |
|---|---|---|
| Engine | Kotlin | TypeScript |
| Secrets | PasswordSafe | SecretStorage |
| Settings UI | JCEF tool window | Webview |
| Storage | `autoCompleteSettings.xml` (`RoamingType.DISABLED`) | `globalState` |
| Status bar menu | `JBPopupFactory` popup (with snooze) | `QuickPick` menu (with toggle / force-refresh) |
| Proxy / TLS | IDE `HttpConfigurable` / `CertificateManager` | `http.proxy` / `http.proxyStrictSSL` (`proxyFetch`) |

Hot path: trigger → gates / cache / debounce / cancel → trim context → HTTP (with mid-line streaming early-stop) → drop stale results → ghost text. Nearby code only by default.

**Allowed host gaps:** storage format, chrome, secret APIs, HTTP proxy/TLS host integration (JB `HttpConfigurable`/`CertificateManager` vs VS Code `http.proxy`/`http.proxyStrictSSL`), and status bar quick menu UX (JB `JBPopupFactory` + snooze vs VS Code `QuickPick` + toggle/force-refresh commands). Dual-host UI checklist: `AGENTS.md`.

Behaviour informed by classic [Kilo Code](https://github.com/Kilo-Org/kilocode) completion; reimplemented here — see [NOTICE](../NOTICE). Protocol: `packages/completion/contracts/bridge-protocol.md`.

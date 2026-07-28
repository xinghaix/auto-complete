# Build & release (maintainers)

[中文](DEV.md) · [User guide](GUIDE.en.md) · [Contributing](../CONTRIBUTING.md)

End users should install from [Marketplace](https://plugins.jetbrains.com/plugin/33040-auto-complete) or GitHub Releases — this page is for maintainers.

## Environment

| Goal | Need |
|---|---|
| JetBrains plugin | **JDK 21** (not Homebrew default openjdk 26) |
| Settings UI / VS Code | Node 18+, npm |
| Signing / CI artifacts | Secrets: `CERTIFICATE_CHAIN`, `PRIVATE_KEY` (optional `PRIVATE_KEY_PASSWORD`, `PUBLISH_TOKEN`) |

```bash
# macOS example
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
```

## Test & local package

```bash
npm install
./gradlew :core:test :plugin:test
npm run test:js
npm run build:js
./scripts/package-local.sh   # or SKIP_JB=1 / SKIP_VSCODE=1
```

| Artifact | Path |
|---|---|
| JetBrains ZIP | `apps/jetbrains/plugin/build/distributions/` (`*-signed.zip` when signing env is set) |
| VS Code VSIX | `apps/vscode/extension/dist-vsix/auto-complete-*.vsix` |

Sandbox: `./gradlew :plugin:runIde`. `package-local.sh` is not a full test suite.

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
| PR / main push | Tests and build checks; no distribution artifacts |
| Annotated `v*` tag targeting `main` history | `buildPlugin` + `signPlugin`; upload **signed ZIP only**, package VSIX, and create a GitHub Release |
| Valid `v*` tag + `PUBLISH_TOKEN` | Optional Marketplace API publish |
| Side-branch, lightweight, or not-yet-merged `v*` tag | CI fails; no package, GitHub Release, or Marketplace publish |

Checklist: bump versions → `CHANGELOG.md` → full tests → merge and verify the release commit on `main` → smoke (Marketplace or signed ZIP) → create annotated tag `vX.Y.Z` from that commit. CI verifies that the tag target is in `main` history. Keys/tokens only in Secrets.

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
| Storage | `autoCompleteSettings.xml` | `globalState` |

Hot path: trigger → gates / cache / debounce / cancel → trim context → HTTP → drop stale results → ghost text. Nearby code only by default.

**Allowed host gaps:** storage format, chrome, secret APIs, JB snooze vs VS Code toggle commands. Dual-host UI checklist: `AGENTS.md`.

Behaviour informed by classic [Kilo Code](https://github.com/Kilo-Org/kilocode) completion; reimplemented here — see [NOTICE](../NOTICE). Protocol: `packages/completion/contracts/bridge-protocol.md`.

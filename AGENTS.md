# AGENTS.md

Guidance for agents and contributors working in `auto-complete`.

## Product and current topology

Auto Complete is a dual-host, bring-your-own-endpoint AI inline completion product:

- **JetBrains:** `plugin/` host + Kotlin/JVM `core/` engine.
- **VS Code:** `hosts/vscode/` host + TypeScript `packages/core-ts/` engine.
- **Shared:** `packages/shared-spec/` contracts/fixtures and Vue `packages/settings-ui/` embedded through each host bridge.

The hosts run independently. JetBrains must never use a VS Code Extension Host, `kilo serve`, or an RPC bridge to obtain completion. The project is an independent implementation informed by Kilo Code behaviour; see `docs/SOURCES.md` and `NOTICE`.

User-facing documentation is paired Chinese/English: root `README.md` / `README.en.md`, then `docs/README.md` / `docs/README.en.md`.

## Stage and distribution

Open-source preview:

- JetBrains: Install from Disk / GitHub Release ZIP.
- VS Code: Install from VSIX / GitHub Release VSIX.
- CI tests and builds; it does not sign, publish Marketplace, create releases, or upload VSIX.
- Do not commit Marketplace/signing tokens, API keys, or private endpoints.

## Required reading before meaningful changes

1. `docs/ARCHITECTURE.md`
2. `docs/SETTINGS.md`
3. `docs/PROVIDERS.md`
4. `docs/PERFORMANCE.md`
5. `docs/RELEASE.md`
6. `docs/COMPATIBILITY.md`
7. `docs/SOURCES.md`
8. `docs/IMPLEMENTATION_STATUS.md`
9. `CONTRIBUTING.md`

## Hard constraints

- No VS Code host/RPC bridge or `kilo serve` runtime dependency for JetBrains.
- Do not store API keys in plain XML, settings JSON, snapshots, exports, fixtures, or logs.
- Do not perform HTTP or large text work on the JetBrains EDT.
- Do not default to whole-file, whole-repository, or recent-file context.
- Settings UI must not directly call user provider HTTP: use UI Bridge → host → engine client.
- Preserve cancellation and generation checks; cancellation is a normal path.
- Keep `com.intellij.modules.jcef` optional. Load JCEF through `SettingsJcefHost` reflection; do not place `JBCefBrowser` types on `SettingsWebPanel`.
- JetBrains minimum remains 2024.2 / `pluginSinceBuild=242` unless compatibility docs and tests are deliberately updated.
- No Agent/Next Edit product scope in the completion path.
- Do not claim cross-host parity where the code differs. Current gaps are documented in `docs/IMPLEMENTATION_STATUS.md`.

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

# Contributing

[中文](CONTRIBUTING.zh.md) · [English](CONTRIBUTING.md)

Auto Complete is a dual-host, bring-your-own-endpoint inline-completion project: JetBrains uses Kotlin `packages/completion/engine-jvm` (Gradle `:core`) + `apps/jetbrains/plugin` (Gradle `:plugin`); VS Code uses `packages/completion/engine-ts` + `apps/vscode/extension`; both embed `packages/settings/ui` and align through `packages/completion/contracts`.

It is an independent implementation informed by Kilo Code behaviour. Keep contributions within the lightweight completion boundary: no JetBrains-to-VS-Code bridge, `kilo serve` runtime, account system, Agent, or Next Edit product.

## Development setup

Requirements: **JDK 21**, **Node.js 18+**, and npm.

```bash
npm install
./gradlew :core:test :plugin:test
npm run test:js
npm run build:js
./gradlew :plugin:buildPlugin
```

Run an isolated JetBrains IDE:

```bash
./gradlew :plugin:runIde
```

Create local installable packages:

```bash
./scripts/package-local.sh
# JetBrains ZIP: apps/jetbrains/plugin/build/distributions/auto-complete-*.zip
# VS Code VSIX: apps/vscode/extension/dist-vsix/auto-complete-*.vsix
```

For one host, use `SKIP_JB=1` or `SKIP_VSCODE=1`. The package script does not replace full tests: it explicitly runs only `:core:test`.

## Code layout

| Path | Module / package name | Responsibility |
|---|---|---|
| `packages/completion/engine-jvm/src/main/kotlin` | Gradle `:core` | Pure Kotlin completion pipeline, HTTP client, prompt/cache/skip/filter/backoff |
| `apps/jetbrains/plugin/src/main/kotlin` | Gradle `:plugin` | JetBrains inline provider, JCEF bridge, PasswordSafe settings, IDE HTTP integration |
| `packages/completion/engine-ts/src` | npm `@auto-complete/core-ts` | TypeScript dual completion pipeline |
| `packages/settings/ui/src` | npm `@auto-complete/settings-ui` | Vue 3 shared Settings + Logs UI and i18n |
| `packages/completion/contracts` | npm `@auto-complete/shared-spec` | Schema, templates, language map, bridge protocol, golden fixtures |
| `apps/vscode/extension/src` | npm `auto-complete` | VS Code provider, settings persistence, SecretStorage, Webview bridge |

## Rules for changes

1. Read `AGENTS.md` and the relevant `docs/` page before changing a subsystem.
2. Keep core algorithms host-neutral; do not add IntelliJ APIs to `packages/completion/engine-jvm` (`:core`) or VS Code APIs to `packages/completion/engine-ts` (`@auto-complete/core-ts`).
3. Preserve cancellable requests and generation checks; do not run provider HTTP from JCEF/Webview.
4. Keep API keys in PasswordSafe/SecretStorage. Never add keys, personal endpoints, or raw prompt samples to source, docs, tests, or fixtures. Never commit home paths, private emails, LAN IPs, machine hostnames, or absolute paths to a local clone (see `AGENTS.md` privacy rules).
5. Update both host implementations and shared fixtures when changing a shared engine behaviour, template, or settings key—or document an intentional host difference in `docs/IMPLEMENTATION_STATUS.md`.
6. Update Chinese and English documentation for user-visible architecture, settings, provider, compatibility, or distribution changes.
7. Add focused tests for engine/client/settings changes. Run affected JVM and/or JS tests before opening a PR.
8. **Settings / Web UI (`packages/settings/ui`):** treat JetBrains JCEF and VS Code Webview as two target platforms. Check both (or document why not). Do not use `window.prompt` / `confirm` / `alert` for product flows; use in-panel modals. Prefer bridge `openExternal` for http(s) links. Follow the dual-host UI checklist in `AGENTS.md`.

## Pull requests

- Keep the change focused and explain user impact and host scope.
- Add user-visible changes under `[Unreleased]` in `CHANGELOG.md`.
- Use conventional prefixes when practical: `feat:`, `fix:`, `docs:`, `chore:`, `test:`.
- For larger design changes, open an issue before implementation.

Do not push, publish, sign, or tag releases as part of a contribution unless maintainers explicitly request it.
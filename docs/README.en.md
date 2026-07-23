# Documentation index

[中文](README.md) · [English](README.en.md) · [Project overview](../README.en.md)

Auto Complete is a dual-host AI inline-completion project: JetBrains uses the Kotlin/JVM engine at `packages/completion/engine-jvm` (Gradle logical module `core`), VS Code uses the TypeScript engine at `packages/completion/engine-ts` (npm package `core-ts`), and both share settings/template/language-map/fixture contracts in `packages/completion/contracts` plus the Vue UI at `packages/settings/ui`. Hosts run independently; JetBrains does not depend on a VS Code Extension Host or `kilo serve`.

## Start here

- Installation and local dual-host packaging: [project overview](../README.en.md)
- JetBrains compatibility and JCEF: [COMPATIBILITY.md](COMPATIBILITY.md)
- Endpoints, model templates, and probes: [PROVIDERS.en.md](PROVIDERS.en.md)
- Settings, storage, and privacy: [SETTINGS.en.md](SETTINGS.en.md)
- Build, test, distribution, and release: [RELEASE.en.md](RELEASE.en.md)

## Paired documentation

| Topic | 中文 | English |
|---|---|---|
| Architecture and dual-host boundary | [ARCHITECTURE.md](ARCHITECTURE.md) | [ARCHITECTURE.en.md](ARCHITECTURE.en.md) |
| Settings, profiles, privacy, and logs | [SETTINGS.md](SETTINGS.md) | [SETTINGS.en.md](SETTINGS.en.md) |
| Providers, FIM/chat templates, and probes | [PROVIDERS.md](PROVIDERS.md) | [PROVIDERS.en.md](PROVIDERS.en.md) |
| Hot path, budgets, and performance verification | [PERFORMANCE.md](PERFORMANCE.md) | [PERFORMANCE.en.md](PERFORMANCE.en.md) |
| Build, install, packages, and release | [RELEASE.md](RELEASE.md) | [RELEASE.en.md](RELEASE.en.md) |
| JetBrains platform and JCEF | [COMPATIBILITY.md](COMPATIBILITY.md) | same bilingual document |
| Open-source publishing readiness | [OPEN_SOURCE.zh.md](OPEN_SOURCE.zh.md) | [OPEN_SOURCE.md](OPEN_SOURCE.md) |
| Sources, attribution, and boundary | [SOURCES.md](SOURCES.md) | [SOURCES.en.md](SOURCES.en.md) |
| Implementation state and known host differences | [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) | [IMPLEMENTATION_STATUS.en.md](IMPLEMENTATION_STATUS.en.md) |
| Contributing | [../CONTRIBUTING.zh.md](../CONTRIBUTING.zh.md) | [../CONTRIBUTING.md](../CONTRIBUTING.md) |
| Security reporting | [../SECURITY.zh.md](../SECURITY.zh.md) | [../SECURITY.md](../SECURITY.md) |
| Changelog | [../CHANGELOG.md](../CHANGELOG.md) | [../CHANGELOG.md](../CHANGELOG.md) |

## Specifications and host-specific documents

- [Shared-spec README](../packages/completion/contracts/README.md) / [中文](../packages/completion/contracts/README.zh.md)
- [UiBridge protocol](../packages/completion/contracts/bridge-protocol.md) / [中文](../packages/completion/contracts/bridge-protocol.zh.md)
- [VS Code extension README](../apps/vscode/extension/README.md) / [中文](../apps/vscode/extension/README.zh.md)

## Sources of truth

Documentation is grounded in executable configuration and source: `settings.gradle.kts`, the root `package.json`, `apps/jetbrains/plugin/src/main/resources/META-INF/plugin.xml`, `apps/vscode/extension/package.json`, both `CompletionEngine` implementations, and `.github/workflows/ci.yml`. If text conflicts with code, correct the text: the current tree is dual-host, not single-host with VS Code deferred.
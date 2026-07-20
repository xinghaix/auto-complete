# Documentation index

[中文](README.md) · [English](README.en.md) · [Project overview](../README.en.md)

Auto Complete is a dual-host AI inline-completion project: JetBrains uses Kotlin/JVM `core`, VS Code uses TypeScript `core-ts`, and both share settings/template/language-map/fixture specifications and a Vue settings UI. Hosts run independently; JetBrains does not depend on a VS Code Extension Host or `kilo serve`.

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

- [Shared-spec README](../packages/shared-spec/README.md) / [中文](../packages/shared-spec/README.zh.md)
- [UiBridge protocol](../packages/shared-spec/bridge-protocol.md) / [中文](../packages/shared-spec/bridge-protocol.zh.md)
- [VS Code extension README](../hosts/vscode/README.md) / [中文](../hosts/vscode/README.zh.md)

## Sources of truth

Documentation is grounded in executable configuration and source: `settings.gradle.kts`, the root `package.json`, `plugin/src/main/resources/META-INF/plugin.xml`, `hosts/vscode/package.json`, both `CompletionEngine` implementations, and `.github/workflows/ci.yml`. If text conflicts with code, correct the text: the current tree is dual-host, not single-host with VS Code deferred.
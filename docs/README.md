# 文档索引

[中文](README.md) · [English](README.en.md) · [项目主页](../README.md)

Auto Complete 是面向 **JetBrains 与 VS Code** 的双宿主 AI 内联代码补全项目：JetBrains 使用 Kotlin/JVM `packages/completion/engine-jvm`（Gradle `:core`），VS Code 使用 TypeScript `packages/completion/engine-ts`（npm：`@auto-complete/core-ts`），共享 `packages/completion/contracts` 与 Vue `packages/settings/ui`。两个宿主独立运行；JetBrains 不依赖 VS Code Extension Host 或 `kilo serve`。

## 快速入口

- 安装与本地双端打包：[项目主页](../README.md)
- JetBrains 兼容性与 JCEF：[COMPATIBILITY.md](COMPATIBILITY.md)
- 端点、模型模板、连接探测：[PROVIDERS.md](PROVIDERS.md)
- 设置项、存储位置和隐私：[SETTINGS.md](SETTINGS.md)
- 构建、测试、分发和发布：[RELEASE.md](RELEASE.md)

## 文档对照

| 主题 | 中文 | English |
|---|---|---|
| 系统架构与双宿主边界 | [ARCHITECTURE.md](ARCHITECTURE.md) | [ARCHITECTURE.en.md](ARCHITECTURE.en.md) |
| 设置、profile、隐私与日志 | [SETTINGS.md](SETTINGS.md) | [SETTINGS.en.md](SETTINGS.en.md) |
| Provider、FIM/chat 模板和探测 | [PROVIDERS.md](PROVIDERS.md) | [PROVIDERS.en.md](PROVIDERS.en.md) |
| 热路径、预算和性能验证 | [PERFORMANCE.md](PERFORMANCE.md) | [PERFORMANCE.en.md](PERFORMANCE.en.md) |
| 构建、安装、包和发布 | [RELEASE.md](RELEASE.md) | [RELEASE.en.md](RELEASE.en.md) |
| JetBrains 平台和 JCEF | [COMPATIBILITY.md](COMPATIBILITY.md) | 同一份双语文档 |
| 开源发布准备 | [OPEN_SOURCE.zh.md](OPEN_SOURCE.zh.md) | [OPEN_SOURCE.md](OPEN_SOURCE.md) |
| 上游参考、归属和边界 | [SOURCES.md](SOURCES.md) | [SOURCES.en.md](SOURCES.en.md) |
| 实现状态和已知宿主差异 | [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) | [IMPLEMENTATION_STATUS.en.md](IMPLEMENTATION_STATUS.en.md) |
| 贡献 | [../CONTRIBUTING.zh.md](../CONTRIBUTING.zh.md) | [../CONTRIBUTING.md](../CONTRIBUTING.md) |
| 安全披露 | [../SECURITY.zh.md](../SECURITY.zh.md) | [../SECURITY.md](../SECURITY.md) |
| 变更记录 | [../CHANGELOG.md](../CHANGELOG.md) | [../CHANGELOG.md](../CHANGELOG.md) |

## 规格与宿主专用文档

- [共享规格 README](../packages/completion/contracts/README.md) / [中文](../packages/completion/contracts/README.zh.md)
- [UiBridge 协议](../packages/completion/contracts/bridge-protocol.md) / [中文](../packages/completion/contracts/bridge-protocol.zh.md)
- [VS Code 扩展 README](../apps/vscode/extension/README.md) / [中文](../apps/vscode/extension/README.zh.md)

## 事实来源

文档以可执行配置和代码为准：`settings.gradle.kts`、根 `package.json`、`apps/jetbrains/plugin/src/main/resources/META-INF/plugin.xml`、`apps/vscode/extension/package.json`、两个 `CompletionEngine` 实现及 `.github/workflows/ci.yml`。若文字和代码冲突，应先修正文档；当前树是双宿主实现，不能写成单宿主或把 VS Code 归为未来功能。
# 文档目录

[中文](README.md) · [English](README.en.md) · [项目主页](../README.md)

Auto Complete：自备模型服务的 AI **行内补全**，支持 JetBrains 与 VS Code。两端共用设置页与规则，但各自独立运行。

## 从哪读起

| 你想… | 看 |
|---|---|
| 安装 / 本地打包 | [项目主页](../README.md) |
| JetBrains 版本与 JCEF | [COMPATIBILITY.md](COMPATIBILITY.md) |
| 填 endpoint / 选模板 / **推荐 FIM 服务** | [PROVIDERS.md](PROVIDERS.md) |
| 每个设置是什么意思 | [SETTINGS.md](SETTINGS.md) |
| 构建、测试、发版 | [RELEASE.md](RELEASE.md) |
| 两端差在哪 | [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) |

## 全部文档

| 主题 | 中文 | English |
|---|---|---|
| 架构（怎么分层） | [ARCHITECTURE.md](ARCHITECTURE.md) | [ARCHITECTURE.en.md](ARCHITECTURE.en.md) |
| 设置与隐私 | [SETTINGS.md](SETTINGS.md) | [SETTINGS.en.md](SETTINGS.en.md) |
| 连接与模板 | [PROVIDERS.md](PROVIDERS.md) | [PROVIDERS.en.md](PROVIDERS.en.md) |
| 性能与热路径 | [PERFORMANCE.md](PERFORMANCE.md) | [PERFORMANCE.en.md](PERFORMANCE.en.md) |
| 构建与发布 | [RELEASE.md](RELEASE.md) | [RELEASE.en.md](RELEASE.en.md) |
| JetBrains 兼容 | [COMPATIBILITY.md](COMPATIBILITY.md) | 中英合订 |
| 实现状态 | [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) | [IMPLEMENTATION_STATUS.en.md](IMPLEMENTATION_STATUS.en.md) |
| 上游参考与归属 | [SOURCES.md](SOURCES.md) | [SOURCES.en.md](SOURCES.en.md) |
| 贡献 | [../CONTRIBUTING.zh.md](../CONTRIBUTING.zh.md) | [../CONTRIBUTING.md](../CONTRIBUTING.md) |
| 安全披露 | [../SECURITY.zh.md](../SECURITY.zh.md) | [../SECURITY.md](../SECURITY.md) |
| 变更记录 | [../CHANGELOG.md](../CHANGELOG.md) | 同左 |

## 开发规格

- [共享契约](../packages/completion/contracts/README.zh.md) · [UiBridge 协议](../packages/completion/contracts/bridge-protocol.zh.md)
- [VS Code 扩展说明](../apps/vscode/extension/README.zh.md)

## 说明

文档以**当前代码**为准。若文字与实现不一致，应先改文档。两端都已实现，不要再写成「仅 JetBrains」或「VS Code 计划中」。

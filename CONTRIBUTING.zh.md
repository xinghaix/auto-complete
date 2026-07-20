# 贡献指南

[中文](CONTRIBUTING.zh.md) · [English](CONTRIBUTING.md)

Auto Complete 是双宿主、自备端点的内联代码补全项目：JetBrains 使用 Kotlin `core` + `plugin`；VS Code 使用 `packages/core-ts` + `hosts/vscode`；两个宿主共同嵌入 `packages/settings-ui`，通过 `packages/shared-spec` 对齐行为。

项目独立实现、参考 Kilo Code 的补全行为。请保持轻量补全边界：不引入 JetBrains→VS Code 桥接、`kilo serve` 运行时、账号体系、Agent 或 Next Edit 产品。

## 开发环境

需要 **JDK 21**、**Node.js 18+** 和 npm。

```bash
npm install
./gradlew :core:test :plugin:test
npm run test:js
npm run build:js
./gradlew :plugin:buildPlugin
```

启动隔离 JetBrains IDE：

```bash
./gradlew :plugin:runIde
```

本地创建安装包：

```bash
./scripts/package-local.sh
# JetBrains ZIP: plugin/build/distributions/auto-complete-*.zip
# VS Code VSIX: hosts/vscode/dist-vsix/auto-complete-*.vsix
```

只构建一个宿主时使用 `SKIP_JB=1` 或 `SKIP_VSCODE=1`。打包脚本不等于完整测试：它只显式执行 `:core:test`。

## 代码目录

| 路径 | 职责 |
|---|---|
| `core/src/main/kotlin` | 纯 Kotlin 补全流水线、HTTP、prompt/cache/skip/filter/backoff |
| `plugin/src/main/kotlin` | JetBrains 内联入口、JCEF bridge、PasswordSafe 设置、IDE HTTP 集成 |
| `packages/core-ts/src` | TypeScript 双实现补全流水线 |
| `packages/settings-ui/src` | Vue 3 共用设置/日志 UI 与 i18n |
| `packages/shared-spec` | schema、模板、语言映射、bridge 协议、golden fixtures |
| `hosts/vscode/src` | VS Code provider、设置持久化、SecretStorage、Webview bridge |

## 变更规则

1. 修改子系统前阅读 `AGENTS.md` 和相关 `docs/` 文档。
2. 核心算法保持宿主无关；不要向 `core` 加 IntelliJ API，也不要向 `core-ts` 加 VS Code API。
3. 保留可取消请求与 generation 校验；JCEF/Webview 不得直接发送 provider HTTP。
4. API key 只进 PasswordSafe/SecretStorage。不得把 key、个人 endpoint 或原始 prompt 样例写入源码、文档、测试或 fixture。
5. 修改共享引擎行为、模板或设置 key 时，同时更新两端实现和 shared fixtures；若故意不一致，必须在 `docs/IMPLEMENTATION_STATUS.md` 说明。
6. 用户可见的架构、设置、Provider、兼容性或分发变动必须同步中英文文档。
7. 引擎/客户端/设置变更要补聚焦测试，并在 PR 前运行受影响的 JVM/JS 测试。

## Pull Request

- 变更聚焦，说明用户影响和宿主范围。
- 用户可见变动写入 `CHANGELOG.md` 的 `[Unreleased]`。
- 提交信息建议使用 `feat:`、`fix:`、`docs:`、`chore:`、`test:`。
- 较大设计变更先开 Issue 讨论。

除非维护者明确要求，贡献过程中不要 push、发布、签名或创建 release tag。
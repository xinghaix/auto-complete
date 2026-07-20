# 上游参考、归属与边界

[English](SOURCES.en.md) · [文档索引](README.md)

## 项目关系

Auto Complete 是独立的双宿主内联补全项目。它参考开源 [Kilo Code / kilocode](https://github.com/Kilo-Org/kilocode) 与 [kilocode-legacy](https://github.com/Kilo-Org/kilocode-legacy) 的经典补全行为和设计思路，并在本仓库中以 Kotlin/JVM 与 TypeScript 重新实现。

当前交付不再是“JetBrains 已交付、VS Code 计划中”：仓库已包含 JetBrains `plugin` + Kotlin `core`、VS Code `apps/vscode/extension` + `packages/completion/engine-ts`、共享 `packages/settings/ui` 与 `packages/completion/contracts`。两个宿主不通过 Extension Host、RPC 或 `kilo serve` 互相调用。

## 参考用途

| 参考 | 用途 | 本项目处理 |
|---|---|---|
| `kilocode-legacy` v5.16.2 | 经典 autocomplete 的 cache、skip、FIM、过滤和生命周期行为 | 以测试/规格锁定预期后重写；不移植 JetBrains→VS Code RPC |
| 当前 `kilocode` monorepo | error backoff、现代 FIM 路由和产品演进的参考 | 只借鉴行为；不引入 agent 运行时、gateway 账号体系或 CLI 服务 |
| Continue 等上游的公开补全思想 | 仅在需要时作为算法/协议参考 | 先确认来源许可和归属，再写独立实现 |

历史 v5 JetBrains 壳曾把文档全文经 RPC 送往 VS Code extension host。该拓扑是本项目明确放弃的反例：当前两个引擎各自在本进程发 HTTP，并由 `PromptBuilder` 预算裁剪前后缀。

## 当前实现映射

| 行为域 | Kotlin/JVM | TypeScript |
|---|---|---|
| 主流水线 | `packages/completion/engine-jvm/.../engine/CompletionEngine.kt` | `packages/completion/engine-ts/src/engine.ts` |
| HTTP 与模板 | `packages/completion/engine-jvm/.../client/HttpCompletionClient.kt` | `packages/completion/engine-ts/src/httpClient.ts` |
| cache / skip / filter | `packages/completion/engine-jvm/.../{cache,skip,filter}/` | `packages/completion/engine-ts/src/{cache,contextualSkip,suggestionFilter}.ts` |
| prompt 与语言映射 | `packages/completion/engine-jvm/.../prompt/`、`util/LanguageMap.kt` | `packages/completion/engine-ts/src/prompt*`、`languageMap.ts` |
| JetBrains 宿主 | `apps/jetbrains/plugin/.../ide`、`bridge`、`config`、`ui` | — |
| VS Code 宿主 | — | `apps/vscode/extension/src/` |
| 共用契约 | `packages/completion/contracts/`：schema、templates、language map、UiBridge、fixtures | 同左 |

`shared-spec` 是跨端对齐的文档/fixture 契约。改动补全行为、模板或设置字段时，应同时检查两端实现和 fixture 测试；不要假设宿主在运行时自动读取每一份 JSON。

## 不移植的能力

以下不属于当前产品边界：

- VS Code Extension Host 为 JetBrains 提供补全；
- `kilo serve` 或 Kilo Gateway 作为运行时依赖；
- Kilo 登录、余额、设备流或 OAuth 账号体系；
- Agent、Next Edit、仓库级检索或默认多文件重上下文；
- 上游私有路径、密钥、品牌资产或未确认许可的代码块。

## 许可与贡献要求

本仓库使用 Apache-2.0（见 [LICENSE](../LICENSE)）并保留 [NOTICE](../NOTICE)。参考上游不等于可直接复制：贡献者应确认每段拟复用代码、测试 fixture、文案或资产的许可证和归属；需要保留的声明必须写入 NOTICE 或相应第三方声明。

贡献新功能时：

1. 把行为描述为本仓库的可测试需求，而不是“照搬上游实现”。
2. 优先独立编写最小实现和测试；不要复制 agent/extension-host 基础设施。
3. 若新代码受第三方许可约束，先完成许可审查和归属记录。
4. 保持 API key、个人 endpoint 与机器路径不进入源码、文档、fixtures 或日志样本。
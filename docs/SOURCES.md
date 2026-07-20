# Sources and Extraction Map

[中文文档索引](README.md) · [English index](README.en.md)

## 0. 产品叙事（为何独立）

本项目的**代码补全核心功能与行为**，来自开源 [Kilo Code / kilocode](https://github.com/Kilo-Org/kilocode) 体系中补全相关能力的抽离与重实现（经典算法与规格亦对照 [kilocode-legacy](https://github.com/Kilo-Org/kilocode-legacy)）。

kilocode 进入 **v7** 后整体更重，内联补全不再容易作为「轻量自托管补全」单独使用与演进，因此新建本仓库：

- **当前交付**：仅 JetBrains IDE 插件  
- **后续计划**：VS Code 插件（补全 core 能力对齐 / 复用思路）  

本仓库**不**再依赖 VS Code Extension Host 或 `kilo serve` 作为运行时。

## 1. 权威参考快照

| 来源 | 版本 / 提交 | 公开仓库 |
|---|---|---|
| Kilo monorepo | `main` / 产品线演进 | https://github.com/Kilo-Org/kilocode |
| Kilo legacy | tag `v5.16.2`（经典补全） | https://github.com/Kilo-Org/kilocode-legacy |

说明：monorepo 与 legacy 职责不同；实现映射以行为规格为准，本地克隆路径勿写进仓库。

## 2. v5 JetBrains 内联壳（可参考，不可当完整引擎）

目录：

`kilocode-legacy/jetbrains/plugin/src/main/kotlin/ai/kilocode/jetbrains/inline/`

| 文件 | 作用 | 新项目怎么用 |
|---|---|---|
| `KiloCodeInlineCompletionProvider.kt` | IDE provider，渲染 gray text | 重写为本地 engine 调用 |
| `InlineCompletionService.kt` | RPC 调 VS Code 命令 | **不移植 RPC**；改 HTTP/engine |
| `InlineCompletionManager.kt` | provider 注册注销 | 可参考生命周期 |
| `KiloCodeInlineCompletionInsertHandler.kt` | accept 后 telemetry RPC | 改本地 log/metrics |
| `InlineCompletionConstants.kt` | 命令 ID、10s 超时 | 只留概念；超时改 2500ms |

协议（仅作历史记录）：

```
command: kilo-code.jetbrains.getInlineCompletions
args: [uri, {line, character}, fullFileContent, languageId, requestId]
result: { requestId, items: [{insertText, range}], error }
```

## 3. v5 VS Code 引擎（算法主来源）

目录：

`kilocode-legacy/src/services/autocomplete/`

| 路径 | 作用 | 新项目落点 |
|---|---|---|
| `AutocompleteServiceManager.ts` | 开关、注册、snooze、status | `config` + `ide` + `ui` |
| `AutocompleteModel.ts` | FIM/stream via ApiHandler | `client` 重写，不搬 ApiHandler 大盘 |
| `AutocompleteJetbrainsBridge.ts` | JB RPC 入口 | **不保留** |
| `classic-auto-complete/AutocompleteInlineCompletionProvider.ts` | 主流水线 | `engine` |
| `classic-auto-complete/FillInTheMiddle.ts` | FIM prompt | `prompt` |
| `classic-auto-complete/inline-utils.ts`（若存在/同类） | cache/debounce 辅助 | `cache` / `engine` |
| `classic-auto-complete/contextualSkip.ts` | 跳过策略 | `skip` |
| `classic-auto-complete/uselessSuggestionFilter.ts` | 结果过滤 | `filter` |
| `classic-auto-complete/HoleFiller.ts` | chat-style fallback | P1 可选 |
| `continuedev/core/autocomplete/**` | 重 context / templates | 精简取用，默认不深依赖 |
| `AutocompleteStatusBar.ts` | 状态栏 | `ui` |
| settings: `ghostServiceSettings` | 旧配置键 | 映射到新 settings 名 |

## 4. monorepo v7 可借鉴点

路径：`kilocode/packages/kilo-vscode/src/services/autocomplete/`

| 点 | 说明 |
|---|---|
| `ErrorBackoff.ts` | 比 v5 更完整的熔断，建议并入 |
| classic cache/skip/filter | 与 v5 同源演进 |
| `fim.ts` + gateway | 了解现代 FIM 路由，但新项目不依赖 CLI |
| next-edit/* | **不进 v1** |

v7 JetBrains：

- 仅 `KiloAutocompleteSettingsService` 等迁移残留
- 不能作为补全实现来源

## 5. 移植级别定义

| 级别 | 含义 | 例子 |
|---|---|---|
| S0 不移植 | 架构废弃 | RPC bridge、extension host、kilo serve 依赖 |
| S1 行为移植 | 用测试锁定行为后重写 | cache match、skip、filter |
| S2 参考重写 | 看思路，API 全新建 | provider settings、status bar |
| S3 有限代码参考 | 小纯函数可对照 | backoff 分类、first-line policy |

原则：**少搬多写**。开源项目要干净，不把 Kilo agent 运行时拖进来。

## 6. 许可与归属

实施代码前必须处理：

1. 确认 Kilo legacy / monorepo 许可证（legacy 根目录 `LICENSE` / `NOTICE`）
2. Continue 抽取部分的上游许可
3. 本仓库 `NOTICE` / `THIRD_PARTY_NOTICES.md` 记录来源
4. 若存在 Weibo/Apache 头（v5 insert handler 可见 SPDX），按原许可证保留必要声明

建议本项目主许可：Apache-2.0 或 MIT（选定后写进根 LICENSE）。

## 7. 抽离检查表

开始写实现前：

- [ ] 只读参考 v5.16.2，不改 legacy 仓库
- [ ] 新代码落在 `auto-complete`，不往 monorepo 塞独立产品
- [ ] 每个从 TS 移植的行为都有 Kotlin 测试
- [ ] 无 extension host 启动逻辑
- [ ] 无 Kilo token 登录硬依赖
- [ ] 默认不会把 prompt 全文写日志

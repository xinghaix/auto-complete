# 来源与归属

[English](SOURCES.en.md) · [文档目录](README.md)

## 和 Kilo 的关系

Auto Complete 是**独立**项目。它参考了开源 [Kilo Code](https://github.com/Kilo-Org/kilocode) / [kilocode-legacy](https://github.com/Kilo-Org/kilocode-legacy) 的**经典行内补全行为**，在本仓库用 Kotlin 与 TypeScript **重写**实现。

当前仓库**已经包含** JetBrains 插件、VS Code 扩展、两套引擎和共用设置页。两端不通过 Extension Host 或 `kilo serve` 互相调用。

## 参考了什么

| 参考 | 用途 | 本项目怎么做 |
|---|---|---|
| kilocode-legacy 经典补全 | 缓存、跳过、FIM、过滤等行为 | 用测试锁规格后重写；不搬 JB→VS Code RPC |
| 当前 kilocode monorepo | 退避、FIM 路由等思路 | 只借鉴行为，不引入 agent/gateway 账号 |
| 其它公开补全资料 | 偶尔作协议/思路参考 | 先确认许可再独立实现 |

旧拓扑「整文件经 RPC 丢给 VS Code」是明确**不采用**的反例。

## 代码大致对应

| 能力 | Kotlin | TypeScript |
|---|---|---|
| 主流水线 | `engine-jvm/.../CompletionEngine.kt` | `engine-ts/src/engine.ts` |
| HTTP / 模板 | `HttpCompletionClient.kt` | `httpClient.ts` |
| 缓存 / 跳过 / 过滤 | 对应包目录 | `cache` / `contextualSkip` / `suggestionFilter` |
| 宿主 | `apps/jetbrains/plugin` | `apps/vscode/extension` |
| 契约 | `packages/completion/contracts` | 同左 |

改共享行为时两端实现和 fixture 一起看。

## 明确不移植

- 用 VS Code 给 JetBrains 提供补全  
- `kilo serve` / Kilo Gateway 运行时依赖  
- Kilo 登录、余额、OAuth  
- Agent、Next Edit、默认全仓检索  
- 上游私有路径、密钥、未确认许可的代码  

## 许可

本仓库 Apache-2.0（[LICENSE](../LICENSE)）+ [NOTICE](../NOTICE)。参考上游 ≠ 可直接复制。贡献时：

1. 写成**本仓库可测需求**，不要“照搬上游”  
2. 优先最小独立实现 + 测试  
3. 第三方代码先做许可审查  
4. 密钥、私人 endpoint、本机路径不进源码/文档/样例  

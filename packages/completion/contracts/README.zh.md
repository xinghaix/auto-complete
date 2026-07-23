# @auto-complete/shared-spec

[English](README.md) · [中文](README.zh.md)

`shared-spec` 保存 JetBrains Kotlin 引擎、VS Code TypeScript 引擎和共用 Web 设置界面之间的**行为契约与测试数据**。它不代表两个引擎在运行时动态加载所有 JSON；实现变更仍需同时检查两端代码。

| 文件/目录 | 作用 |
|---|---|
| `settings.schema.json` | 跨宿主可移植设置/profile 的 JSON Schema；专用 secret 不得出现于 snapshot/export |
| `defaults.json` | 对应 schema 的默认设置样例 |
| `templates.json` | FIM/chat 模板、wire format、停止 token、模型名检测规则 |
| `language-map.json` | 扩展名/别名到 language ID 的映射 |
| `bridge-protocol.md` | settings UI 与宿主的 UiBridge 消息和安全规则 |
| `testdata/**` | HTTP 解析、prompt budget、cache 的 golden fixtures |

修改设置 key、模板、语言规则或共享行为时：

1. 更新此处的契约/fixture（若该项属于共享语义）；
2. 更新 Kotlin `core` 与 TypeScript `core-ts` 的实现或明确记录有意差异；
3. 运行两端相关测试；
4. 更新用户文档，尤其是 `docs/SETTINGS*`、`docs/PROVIDERS*`、`docs/IMPLEMENTATION_STATUS*`。

安全红线：fixture、默认值、schema 示例和可移植导出均不得包含 API key、Authorization header 明文、真实 endpoint 或用户代码。本地 UI snapshot 仅暴露 `hasApiKey`；其中可编辑的 `extraHeadersJson` 是明文非敏感路由元数据，绝不能承载凭据。
# @auto-complete/shared-spec

[English](README.md)

路径：`packages/completion/contracts` · npm：`@auto-complete/shared-spec`

这里放 **两端引擎 + 设置页** 共用的规则和测试数据。不是运行时动态加载每一份 JSON 的意思——改行为仍要改两边代码。

| 内容 | 作用 |
|---|---|
| `settings.schema.json` | 设置字段约定（导出/快照无密钥） |
| `defaults.json` | 默认样例 |
| `templates.json` | 模板与模型名识别 |
| `language-map.json` | 语言 ID 映射 |
| `bridge-protocol.md` | 设置页 ↔ 宿主消息 |
| `testdata/**` | HTTP / prompt / cache 样例 |

改共享语义时：更新这里 → 更新 Kotlin + TS 实现（或写明有意差异）→ 跑测试 → 更新 `docs/GUIDE`（用户可见时）。

**禁止**：样例里出现真实密钥、鉴权头明文、私人 endpoint、用户代码。

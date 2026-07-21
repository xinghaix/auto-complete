# 连接与补全模板

[English](PROVIDERS.en.md) · [文档目录](README.md)

本插件**不绑定账号**。它把裁剪后的代码发给你配置的 HTTP 服务，再把返回内容显示成行内补全。

## 你要配什么

每个 profile 大致是：

- **Base URL**（服务根，常带 `/v1`）
- **模型 ID**
- **可选 API Key**（存在 IDE 安全存储）
- 鉴权头模板、额外 Headers、模板、超时、路径覆盖

请求走 OpenAI 兼容风格；可用自定义头/路径适配网关。

## 模板一览

| 模板 | 常见用途 | 默认路径 | 请求形态 |
|---|---|---|---|
| CODESTRAL_API | Codestral / Mistral code | `/fim/completions` | `prompt` + `suffix` |
| QWEN | Qwen 等 | `/completions` | 带 FIM token 的 prompt |
| DEEPSEEK | DeepSeek Coder | `/completions` | 同上（DeepSeek token） |
| STARCODER | StarCoder 等 | `/completions` | 同上（StarCoder token） |
| CHAT | 只支持 chat 的服务 | `/chat/completions` | `messages` |
| AUTO | 默认 | 自动 | 按模型名猜；猜不到用 CHAT |

路径相对 Base URL 拼接。可用 `fimPath` / `chatPath` / `completionsPath` 覆盖。**先测服务真实接口**，不要只看模型名字。

默认：输出约 128 token、温度 0、补全超时 3 秒。

## 本地示例（Ollama）

```text
baseUrl: http://127.0.0.1:11434/v1
model:   qwen2.5-coder:7b
API key: 留空
模板:     AUTO 或 QWEN
```

CHAT 与 FIM 的 JSON 不通用，请用面板「测试模板」。

## 鉴权

- 默认：`Authorization: Bearer <key>`
- 密钥为空 → 不发这颗鉴权头
- `extraHeadersJson` 必须是 JSON **对象**
- 不要把密钥写进 URL、示例、Issue 或导出文件

## 面板探测

一律：**设置页 → 宿主 → 引擎**（页面自己不 `fetch` 你的服务）。

| 操作 | 做什么 |
|---|---|
| 拉取模型 | 请求 `/models`（必要时试 `/v1/models`） |
| 测试连接 | 发一小段补全 |
| 测试模板 | 用当前/指定模板发同样请求 |
| 尝试全部 | 依次试各 FIM/Chat 模板 |

`SUCCESS` = 通了且有文本；`EMPTY` = 通了但没建议；`FAILED` = 网络/鉴权/HTTP 失败。探测用更长的 `settingsTimeoutMs`（默认 15 秒）。

## 错误时

| 情况 | 行为 |
|---|---|
| 继续输入 / 取消 | 正常取消，不打扰 |
| 401 / 403 | 严重错误，可通知并暂缓请求 |
| 429 / 5xx / 超时 | 退避重试，记日志 |
| 空结果 | 不显示建议 |

网络细节（代理、TLS）跟 IDE 环境有关，看日志里的 URL 和状态码。

## 隐私

默认只发光标附近代码 + 可选路径；不默认发全仓库或最近文件。见 [SETTINGS.md](SETTINGS.md)。

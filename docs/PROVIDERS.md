# Provider 与提示模板

[English](PROVIDERS.en.md) · [文档索引](README.md)

Auto Complete 不绑定账号体系。它向用户配置的 HTTP endpoint 发送已裁剪的 prefix/suffix，并把响应解析为内联补全文本。主实现位于 `core/.../client/HttpCompletionClient.kt` 与 `packages/core-ts/src/httpClient.ts`。

## 连接模型

每个 profile 包含：服务根地址 `baseUrl`、模型、可选 API key、鉴权头模板、额外 headers JSON、模板和路径覆盖。API key 保存在 PasswordSafe（JetBrains）或 SecretStorage（VS Code）；设置快照、导出与日志不会返回明文。

当前宿主 profile 走 OpenAI-compatible 请求管线，并支持自定义头、路径和模板覆盖。核心客户端保留 `CUSTOM` / `MISTRAL_FIM` 兼容枚举，但现有设置 UI 不提供完整的独立 custom-provider 产品流程；历史 `mistral-fim` 读入后会归一为 OpenAI-compatible + FIM 模板。

## 模板、路径与传输

| 模板 ID | 适合模型 | 默认路径 | 请求正文 |
|---|---|---|---|
| `CODESTRAL_API` | Codestral / Mistral code / Devstral | `/fim/completions` | `prompt` + `suffix` 字段 |
| `QWEN` | Qwen、CodeGemma、泛 coder 名 | `/completions` | 单个 FIM token `prompt` |
| `DEEPSEEK` | DeepSeek Coder | `/completions` | DeepSeek FIM token `prompt` |
| `STARCODER` | StarCoder、SantaCoder、CodeLlama 等 | `/completions` | StarCoder FIM token `prompt` |
| `CHAT` | chat/completions 服务 | `/chat/completions` | system + user `messages`，含 `<prefix>` / `<suffix>` |
| `AUTO` | 默认 | 按检测结果 | 从模型名选择；未匹配时为 `CHAT` |

路径相对于 `baseUrl` 组合。对 OpenAI FIM，裸 host 会得到 `/v1/fim/completions`，已经以 `/v1` 结尾的 baseUrl 则得到 `/fim/completions`。`fimPath`、`completionsPath` 和 `chatPath` 可覆盖默认值；先确认服务端的实际 API，而不要盲目套用某个模型名称。

所有请求均包含模型、`max_tokens`/等价字段、温度和可选 `stream=true`。FIM 模板还写入对应停止 token。默认输出限制 128、温度 0、补全超时 3000 ms。

## OpenAI-compatible 示例

常见本地服务的基本 profile：

```text
baseUrl: http://127.0.0.1:11434/v1
model: qwen2.5-coder:7b
API key: 留空（仅当服务无需鉴权）
promptTemplate: AUTO 或 QWEN
```

`CHAT` 模板要求 endpoint 接受 OpenAI 风格的 `messages`。`CODESTRAL_API` 要求 endpoint 接受 `prompt` 与 `suffix`。两者不是可随意互换的 JSON；请使用设置面板的模板测试决定。

## 鉴权和额外头

- 默认头模板为 `Authorization: Bearer ***`；`***` 由 API key 替换。
- 空 API key 时不会发送默认鉴权头。
- `extraHeadersJson` 必须是 JSON object，用于不兼容 `Authorization` 的网关或额外路由头。
- 日志对鉴权材料脱敏；不要把 key 放进 baseUrl、headers 示例、issue 或导出的配置。

## 连接、模型与模板探测

面板操作始终经过 **Web UI → UiBridge → 宿主 → HTTP client**。Webview/JCEF 不直接 `fetch` 用户端点。

- **拉取模型**：请求 `/models`；遇到 404/405 会尝试兼容的 `/v1/models`。
- **测试连接**：发送短 Python prefix/suffix，`maxTokens` 最多 16。
- **测试模板**：用当前或指定模板发同一最小请求。
- **尝试全部模板**：对所有具体模板依次探测，结果保留路径、耗时、状态和截断预览。

`SUCCESS` 表示 2xx 且获得非空补全文本；`EMPTY` 表示 endpoint 可达但模板/模型可能不匹配；`FAILED` 表示网络、超时、鉴权或非 2xx。设置探测使用独立的 `settingsTimeoutMs`（默认 15000 ms），不会占用 ghost-text 的 3000 ms 超时预算。

## 错误、取消与网络

| 情况 | 引擎行为 |
|---|---|
| 用户继续输入或宿主取消 | 取消 HTTP/任务；静默处理 |
| 401/403 | fatal backoff；状态栏/通知（取决于设置） |
| 429、5xx、传输失败、超时 | retriable backoff；写日志、不阻断编辑 |
| 2xx 空文本或过滤后为空 | 不展示建议，记录诊断 |

JetBrains HTTP 使用 IDE 的代理与信任库支持；VS Code 使用扩展的 TypeScript 网络客户端。两端对在途请求都支持取消。服务端重定向、TLS 和公司代理差异由宿主运行环境决定，先看日志中的最终 URL、错误和状态码。

## 隐私

请求会发送裁剪后的当前文件前后缀，默认还会包含文件路径；不会默认附带整个仓库或最近文件。关闭 `sendFilePath` 可避免发送路径；保持 `enableRecentFileContext=false` 可避免附带其它已打开文件片段。详见 [SETTINGS.md](SETTINGS.md) 与 [PERFORMANCE.md](PERFORMANCE.md)。
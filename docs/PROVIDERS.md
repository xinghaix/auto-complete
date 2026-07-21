# 连接与补全模板

[English](PROVIDERS.en.md) · [文档目录](README.md)

本插件**不绑定账号**。它把裁剪后的代码发给你配置的 HTTP 服务，再把返回内容显示成行内补全。

行内补全效果最好时，服务端支持 **FIM（Fill-In-the-Middle，中间填充）**：同时接收光标**前**与**后**的代码。若只有 Chat 接口，可用模板 `CHAT` 做伪 FIM，质量通常弱于真 FIM。

## 推荐：支持 FIM / 行内补全的服务

下列为官方提供 **FIM 或代码补全** 能力、与本插件较匹配的选项。**密钥请只填在设置页**，不要写进文档或导出文件。具体路径与字段以各厂最新文档为准；配好后请用面板 **测试连接 / 测试模板**。

| 服务 | 适合场景 | 建议 Base URL | 建议模板 | 官方说明 |
|---|---|---|---|---|
| **[DeepSeek](https://www.deepseek.com/)** 云 API | 官方 FIM（Beta） | `https://api.deepseek.com/beta` | `CODESTRAL_API`（`prompt` + `suffix`） | [FIM Completion（英文）](https://api-docs.deepseek.com/guides/fim_completion/) · [中文](https://api-docs.deepseek.com/zh-cn/guides/fim_completion/) |
| **[Mistral AI](https://mistral.ai/)** | Codestral 等代码模型 FIM | `https://api.mistral.ai/v1` | `CODESTRAL_API` | [FIM API](https://docs.mistral.ai/api/endpoint/fim) |
| **Ollama** 等本地 OpenAI 兼容 | 本机 / 内网 coder 模型 | `http://127.0.0.1:11434/v1` | `AUTO` 或按模型选 `QWEN` / `DEEPSEEK` / `CHAT` | 以本地服务文档为准 |
| **vLLM / 其它 OpenAI 兼容网关** | 自建 FIM 或 chat 服务 | 你的网关根地址（常带 `/v1`） | 先 `AUTO`，不通再 **尝试全部模板** | 以网关与模型卡为准 |

### DeepSeek 云（官方 FIM）

官方 FIM 说明：用户可提供 **prefix（前缀）与 suffix（后缀）**，模型补中间，适合代码补全。

文档写明 base 为 **`https://api.deepseek.com/beta`**（与普通 Chat 的 `/v1` 不同）。本插件对应 **`CODESTRAL_API`**（请求体用 `prompt` + `suffix` 字段）。

```text
Base URL:  https://api.deepseek.com/beta
Model:     以控制台 / 官方文档当前可用模型为准
API Key:   平台申请的密钥
模板:      CODESTRAL_API
```

若默认路径不通，可在配置 **高级** 里改 **FIM 路径**（例如官方当前使用的 completions 路径），再点 **测试模板**。  
说明：模板名里的 `DEEPSEEK` 是另一套 **token 式 FIM**（多用于自建 DeepSeek Coder 类 `/completions` 服务），**不等于** DeepSeek 云 Beta 的 `prompt`+`suffix` 接口；云 FIM 请用 `CODESTRAL_API`。

### Mistral AI（Codestral FIM）

官方提供 **FIM 端点**（`prompt` + 可选 `suffix`），完整 URL 形如  
`https://api.mistral.ai/v1/fim/completions`（见 [FIM API](https://docs.mistral.ai/api/endpoint/fim)）。

```text
Base URL:  https://api.mistral.ai/v1
Model:     codestral-…（以 Mistral 控制台当前模型名为准）
API Key:   Mistral API Key
模板:      CODESTRAL_API
```

模板 `CODESTRAL_API` 默认相对路径即为 `/fim/completions`，一般无需再改路径。

### 本地 Ollama（示例）

```text
Base URL:  http://127.0.0.1:11434/v1
Model:     qwen2.5-coder:7b
API Key:   无鉴权时留空
模板:      AUTO 或 QWEN
```

本地模型是否真支持 FIM 取决于模型与 Ollama 版本；用 **测试模板** 确认。

## 你要配什么

每个 profile 大致是：

- **Base URL**（服务根；云服务按上表，本地常带 `/v1`）
- **模型 ID**
- **可选 API Key**（存在 IDE 安全存储）
- 鉴权头模板、额外 Headers、模板、超时、路径覆盖

请求走 OpenAI 兼容风格；可用自定义头/路径适配网关。

## 模板一览

| 模板 | 常见用途 | 默认路径 | 请求形态 |
|---|---|---|---|
| CODESTRAL_API | Mistral / DeepSeek 云 FIM、其它 `prompt`+`suffix` 接口 | `/fim/completions` | `prompt` + `suffix` |
| QWEN | Qwen 等 token FIM | `/completions` | 带 FIM token 的 prompt |
| DEEPSEEK | 自建 DeepSeek Coder 类 token FIM | `/completions` | DeepSeek FIM token |
| STARCODER | StarCoder 等 | `/completions` | StarCoder FIM token |
| CHAT | 只支持 chat 的服务 | `/chat/completions` | `messages` |
| AUTO | 默认 | 自动 | 按模型名猜；猜不到用 CHAT |

路径相对 Base URL 拼接。可用 `fimPath` / `chatPath` / `completionsPath` 覆盖。**先测服务真实接口**，不要只看模型名字。

默认：输出约 128 token、温度 0、补全超时 3 秒。

CHAT 与真 FIM 的 JSON 不通用，请用面板「测试模板」。

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

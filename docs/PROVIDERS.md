# Providers

## 1. 设计目标

- 自定义 `baseUrl` + `apiKey` + `model` 是一等公民
- 先支持最常见本地/兼容端点
- 协议适配与引擎解耦
- 便于抓包级日志（状态码/耗时），默认不记录密钥与全文 prompt

## 2. Provider 预设

### 2.1 `openai-compatible`（默认）

适用：Ollama、LM Studio、vLLM、多数 OpenAI 兼容网关。

默认：

- baseUrl: `http://127.0.0.1:11434/v1`
- path: `/chat/completions`
- auth: `Authorization: Bearer ${apiKey}`（key 为空则省略）

请求示意：

```json
{
  "model": "qwen2.5-coder:7b",
  "temperature": 0,
  "max_tokens": 128,
  "messages": [
    {
      "role": "system",
      "content": "You are a code completion engine. Continue the code. Output only the completion."
    },
    {
      "role": "user",
      "content": "<prefix>...user code before cursor...</prefix>\n<suffix>...after cursor...</suffix>\nReturn only the middle completion."
    }
  ]
}
```

实现可改进为更紧凑的 FIM-in-chat 模板；关键是**只返回补全文本**。

### 2.2 `mistral-fim`（已废弃 UI）

历史选项，与 `openai-compatible` + `(fim) OpenAI FIM` 模板等价。  
设置页已移除；读入旧配置时归一为 `openai-compatible`。Codestral 请用兼容 OpenAI + FIM 模板。

### 2.3 `custom`

用户提供：

- 完整 path
- headers
- 提示词模板（见下）
- 可选 body 模板扩展

### 2.4 提示词模板（Prompt template）

设置页可选手动模板，或 `Auto` 按模型名检测。用户可对**当前模板**探测，或 **Try all** 依次试完全部模板直到成功。

| 模板 | 传输 | 默认 path | 正文要点 |
|---|---|---|---|
| `(fim) OpenAI FIM`（原 Codestral API） | `prompt` + `suffix` 字段 | 始终落到 `{host}/v1/fim/completions`（base 已含 `/v1` 时用 `/fim/completions`） | OpenAI 兼容 FIM（Codestral 等） |
| `(fim) Qwen` | 单字段 `prompt` | `/completions` | `<\|fim_prefix\|>…<\|fim_suffix\|>…<\|fim_middle\|>` |
| `(fim) DeepSeek` | 单字段 `prompt` | `/completions` | `<｜fim▁begin｜>…` 系列 token |
| `(fim) StarCoder` | 单字段 `prompt` | `/completions` | `<fim_prefix>…` 系列 token |
| `(chat) Pseudo-FIM` | `messages` | `/chat/completions` | `<prefix>/<suffix>` 伪 FIM |
| `Auto` | 运行时解析 | 取决于检测结果 | 见模型名启发式 |

探测结果：

- **SUCCESS**：HTTP 2xx 且补全文非空 → 可点 Apply 锁定该模板  
- **EMPTY**：HTTP 2xx 但空补全 → 端点通、模板/模型可能不匹配  
- **FAILED**：网络/4xx/5xx → 看 path 与鉴权

## 3. 统一客户端接口

```kotlin
interface CompletionClient {
    suspend fun complete(
        request: ProviderRequest,
        signal: CancellationToken,
    ): ProviderResponse
}

data class ProviderRequest(
    val model: String,
    val prefix: String,
    val suffix: String,
    val maxTokens: Int,
    val temperature: Double,
    val stream: Boolean,
    val metadata: Map<String, String> = emptyMap(), // language, path?
)

data class ProviderResponse(
    val text: String,
    val usage: Usage? = null,
    val rawStatus: Int? = null,
)
```

Engine 不关心具体 JSON 字段名；Adapter 负责映射。

## 4. 取消与超时

- 使用可取消 HTTP（协程 cancel 关闭连接）
- `timeoutMs` 为补全硬超时；`settingsTimeoutMs` 为设置页探测硬超时
- 插件 HTTP 走 IDE 代理设置（与内置插件一致），避免「同样 URL/Key 只有内置能通」
- 超时与取消都不得抛到 UI 模态框
- 仅写 log + 空补全

## 5. 错误映射

| HTTP / 情况 | ErrorKind | 用户可见 |
|---|---|---|
| 401/403 | fatal | 状态栏 error + 可选通知 |
| 402（若存在） | fatal/retriable 可配 | 默认 fatal |
| 429/5xx | retriable | 日志 |
| 超时 | retriable/transient | 日志 |
| 连接失败 | retriable | 日志 |
| cancel | cancel | 静默 |

## 6. Test Connection

最小探测：

1. 用短 prefix/suffix（如 `def add(a, b):\n    ` + 空 suffix）
2. `maxTokens` 上限 16
3. 显示 latency 与截断响应

禁止：

- 用用户当前打开的大文件做探测
- 在探测日志里打印 apiKey

## 7. 安全

- apiKey 只进 PasswordSafe
- 日志中 redaction：`Authorization`、`api-key`、`token`
- `allowRemote=false` 时拒绝非本地 baseUrl
- 不自动跟随未知重定向到第三方域（实现时明确策略）

## 8. 非目标 Provider（v1）

- 完整 OpenRouter 账户体系
- Kilo Gateway 登录设备流
- 需要浏览器 OAuth 的 provider（可后置）

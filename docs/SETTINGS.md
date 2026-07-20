# 设置参考

[English](SETTINGS.en.md) · [文档索引](README.md)

设置分为**全局偏好**和**已保存配置（Provider profile）**。JetBrains 与 VS Code 均使用同一套概念，但普通设置的持久化位置不同；API 密钥始终不进入普通设置文件。

## 存储与宿主差异

| 数据 | JetBrains | VS Code |
|---|---|---|
| 普通设置与 profile | `PersistentStateComponent` 的 `autoCompleteSettings.xml` | `globalState`；常用项镜像到 `autoComplete.*` configuration |
| API key | `PasswordSafe`，按 profile 隔离 | `SecretStorage`，按 profile 隔离 |
| 设置/日志 UI | JCEF 中的 **Auto Complete** 工具窗口 | Webview 设置面板；日志也写入 OutputChannel |
| 导出 | UiBridge 导出普通设置 | UiBridge 导出普通设置 |

快照和导出只暴露 `hasApiKey`，不会返回 `apiKey`。导入会丢弃任何密钥字段；必须在目标 IDE 重新填写密钥。

## 全局行为

| 设置 | 默认值 | 含义 |
|---|---:|---|
| `enabled` | `true` | 总开关 |
| `autoTrigger` | `true` | 输入时是否自动请求；手动触发不受它限制 |
| `enableInComments` / `enableInStrings` | `true` | 是否允许在注释/字符串中补全 |
| `firstLineOnlyWhenMidLine` | `true` | 光标位于一行中间时只显示首行建议 |
| `sendFilePath` | `true` | 是否把文件路径加入 prompt |
| `respectGitignore` | `true` | JetBrains 将项目 `.gitignore` 纳入跳过规则；VS Code 当前只保存该偏好，尚未把 workspace `.gitignore` 注入引擎 |
| `ignoreGlobs` | 见下 | 额外忽略的路径模式，每行一条 |
| `disabledLanguages` | 空 | 禁用的语言 ID（逗号或换行分隔） |
| `showStatusBar` | `true` | 显示状态栏入口 |
| `uiTheme` | `auto` | 设置面板主题：跟随 IDE、白色或暗黑 |

默认 ignore globs：

```text
**/.git/**
**/node_modules/**
**/dist/**
**/build/**
**/target/**
**/.idea/**
**/.gradle/**
**/vendor/**
```

JetBrains 提供 `AutoComplete.Trigger`（默认 Ctrl+Shift+Space，macOS 为 Cmd+Shift+Space）、开关、取消、30 分钟 snooze、打开设置/日志等动作；快捷键由 IDE Keymap 管理。VS Code 提供同名语义的 Trigger、Toggle Enabled、Open Settings Panel、Show Logs 和 Set API Key 命令。

> 当前 VS Code provider 尚未进行注释/字符串语义探测，传给 TS 引擎的两个 context hint 固定为 `false`。因此这两个全局开关在 VS Code 的实际触发路径尚未生效；JetBrains 会通过 `ContextProbe` 提供提示。

## 已保存配置（profiles）

一个 profile 对应一套端点连接。可创建、切换、改名和删除；允许删除全部 profile。新建 profile 是空白配置，不会复制当前连接。旧版扁平设置在首次读取时迁移成一个 profile。

| Profile 字段 | 默认值 | 说明 |
|---|---:|---|
| `baseUrl` | `http://127.0.0.1:11434/v1` | OpenAI 兼容服务根地址或自定义服务根地址 |
| `model` | `qwen2.5-coder:7b` | 模型 ID |
| `promptTemplate` | `AUTO` | `AUTO`、`CODESTRAL_API`、`QWEN`、`DEEPSEEK`、`STARCODER`、`CHAT` |
| `authHeaderTemplate` | `Authorization: Bearer ***` | 鉴权头模板；空 key 时不发该头 |
| `extraHeadersJson` | `{}` | 额外请求头 JSON object |
| `temperature` | `0` | 代码补全通常保持低值 |
| `maxTokens` | `128` | 单次补全输出上限 |
| `timeoutMs` | `3000` | ghost-text 补全硬超时，范围 `500..30000` |
| `settingsTimeoutMs` | `15000` | 模型列表/连接/模板探测硬超时，范围 `1000..120000` |
| `stream` | `false` | 实验性 SSE 首 token 流式 |
| `fimPath` / `chatPath` / `completionsPath` | 自动 / `/chat/completions` / 自动 | 覆盖模板请求路径 |
| `overrideContextBudget` | `false` | 使用本 profile 的 prefix/suffix 预算，而不是全局预算 |

核心客户端保留 `CUSTOM` / `MISTRAL_FIM` 兼容枚举，但当前宿主 profile 使用 OpenAI-compatible 请求管线，并通过自定义头、路径和模板覆盖处理兼容需求；设置 UI 不提供完整的独立 custom-provider 产品流程。历史 `mistral-fim` 读入后会归一为 OpenAI-compatible + FIM 模板。

### 模型和模板探测

设置界面可：

1. 请求 `GET {baseUrl}/models`；若根路径没有该端点，客户端会尝试兼容的 `/v1/models` 路径。
2. 发送很小的补全请求测试连接。
3. 对当前模板测试，或按固定顺序探测全部 FIM/chat 模板。

结果分为 `SUCCESS`（2xx 且非空）、`EMPTY`（2xx 但无建议）和 `FAILED`（网络、鉴权或 HTTP 失败）。错误详情会带方法、最终 URL、状态码或截断响应，便于检查路径和鉴权。探测请求经宿主 HTTP 客户端发出，遵循 JetBrains IDE 代理或 VS Code 的扩展网络环境。

## 性能与上下文

| 设置 | 默认值 | 说明 |
|---|---:|---|
| `debounceMinMs` / `debounceInitialMs` / `debounceMaxMs` | `150 / 300 / 1000` | 自动触发的自适应防抖边界 |
| `maxPrefixChars` / `maxSuffixChars` | `8000 / 2000` | 默认出站 prompt 的字符预算 |
| `maxInFlight` | `1` | 全局在途任务上限 |
| `cacheSize` / `lruSize` | `20 / 64` | suggestion history 与 prompt LRU 容量 |
| `maxFileSizeKb` | `512` | 超过该大小不请求 |
| `enableRecentFileContext` | `false` | 是否附带最近打开文件的片段 |
| `recentFileLimit` / `recentFileMaxChars` | `3 / 1200` | 最近文件上下文限制 |

最近文件上下文会增加发送给 endpoint 的代码量；保持关闭，除非你确认端点的数据处理策略可接受。引擎最终使用 `PromptBuilder` 的预算裁剪，设置 UI 本身不接触文件内容或 provider HTTP。

## 日志与隐私

| 设置 | 默认值 | 说明 |
|---|---:|---|
| `logLevel` | `info` | `debug`、`info`、`warn`、`error` |
| `logRetention` | `1000` | 内存 ring buffer 条数；旧条目会被丢弃 |
| `logPromptBodies` | `false` | 记录截断后的 prompt 内容；高敏，默认关闭 |
| `notifyOnFatalError` | `true` | 401/403 等 fatal 配置错误时提示 |
| `showCostApprox` | `false` | 在 provider 返回 usage 时显示近似 token 用量 |

日志不会记录 API key 或认证头。JetBrains 同时把接受到的日志写入 `idea.log`；VS Code 同时写入 **Auto Complete** OutputChannel。完整日志字段见 [UiBridge 协议](../packages/completion/contracts/bridge-protocol.md)。

## 校验与远程端点

连接要求有效的 URL、非空模型（存在 profile 时）、合法 JSON headers、正的上下文预算，以及范围内的 timeout/maxTokens。当前产品**始终允许**远程 `baseUrl`；历史 `allowRemote` 字段不再有 UI 开关，也不能作为网络隔离控制。若要限制出站网络，应在 IDE、操作系统或网络层执行。
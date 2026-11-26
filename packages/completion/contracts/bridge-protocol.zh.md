# UiBridge 协议

[English](bridge-protocol.md) · [中文](bridge-protocol.zh.md)

每条消息均使用版本字段 `v: 1`。UiBridge 连接共用 `settings-ui` 与宿主；它不把 provider HTTP 暴露给 Web UI。

> **实现状态：** 当前稳定基线涵盖 snapshot/profile/secret/probe/model/log-batch/platform/export/import/clipboard/session-stats/cache-control。修改 `logLevel` 请通过 `applySettings`。标为**预留**的行描述兼容的未来形状，当前两个宿主不一定都会 dispatch。

## 传输

- **VS Code**：Webview `postMessage` / `onDidReceiveMessage`
- **JetBrains**：JCEF `JBCefJSQuery` 或 `executeJavaScript` + CEF message router
- **浏览器 mock**：本地开发的 `window.__autoCompleteBridge` EventTarget

## Envelope

```ts
type BridgeRequest = {
  v: 1
  id: string           // 关联 ID
  type: string         // 见下表
  payload?: unknown
}

type BridgeResponse = {
  v: 1
  id: string           // 对应请求；push 事件为 ""
  type: string
  ok: boolean
  payload?: unknown
  error?: string
}
```

## UI → 宿主

| type | payload | response type | 说明 |
|---|---|---|---|
| `getSnapshot` | — | `snapshot` | 不含 secret 的设置 |
| `applySettings` | `SettingsState` | `applyResult` | 宿主端强制校验（引擎 `validateSettings`：仅允许无 `userInfo` 的 `http(s)` `baseUrl`、非空 `authHeaderTemplate` 须含 `${apiKey}`、禁止敏感 `extraHeadersJson`、合法对象 `extraBodyJson`、`debounceMin <= debounceInitial <= debounceMax`）并持久化普通设置；返回 `{ ok, errors }` |
| `createProfile` | 可选 `{ name?, preset? }` | `snapshot` | 新建空白或预设填充的 profile（如 Ollama、DeepSeek Beta FIM、Mistral Codestral、vLLM/LM Studio，绝不含密钥）并设为 active |
| `deleteProfile` | `{ profileId }` | `snapshot` | UI 必须先确认 |
| `selectProfile` | `{ profileId }` | `snapshot` | 切换 active profile |
| `renameProfile` | `{ profileId, name }` | `snapshot` | 宿主确保名称唯一 |
| `setSecret` | `{ profileId, secret }` | `secretResult` | 宿主保存密钥并返回 `{ profileId, hasApiKey }`；UI 刷新徽章并清空输入 |
| `clearSecret` | `{ profileId }` | `secretResult` | 清除该 profile 密钥并返回 `{ profileId, hasApiKey: false }` |
| `testConnection` | `{ profileId? }` | `probeResult` | 使用引擎客户端探测（不修改 `activeProfileId`）并记入 `LogBuffer` |
| `probeTemplate` | `{ template, profileId? }` | `probeResult` | 探测单个模板（不修改 `activeProfileId`）并记入 `LogBuffer` |
| `probeAllTemplates` | `{ profileId? }` | `probeAllResult` | 逐个探测候选模板并返回 `{ results: ProbeResult[] }` |
| `listModels` | `{ profileId? }` | `modelsResult` | 拉取模型列表，返回 `{ models: Array<{ id, contextLength? }>, error? }` |
| `subscribeLogs` | 可选 `{ level?, limit? }` | `logSubscribed` | 按 `level` 过滤并按 `limit` 截断返回 `{ ok?, entries: LogEntry[] }`，后续推送 `logBatch` |
| `unsubscribeLogs` | — | `logUnsubscribed` | 离开 Logs 页或关闭面板时停止推送 `logBatch` |
| `clearLogs` | — | `logsCleared` | 清空内存日志 |
| `getLogLevel` | — | `logLevel` | 日志级别 |
| `setLogLevel` | `{ level }` | `logLevel` | **预留**；当前通过 `applySettings` 修改 |
| `getSessionStats` | — | `sessionStats` | 纯本地内存会话统计（`SessionStats`），零远程上传 |
| `clearCaches` | — | `cachesCleared` | `{ ok: true }`；清空历史补全缓存与 Prompt LRU 缓存，并重置错误退避 |
| `copyToClipboard` | `{ text }` | `copyResult` | `{ copied: boolean }`；经由宿主系统剪贴板写入文本（规避 JCEF `navigator.clipboard` 限制） |
| `getPlatform` | — | `platform` | `{ platform, locale, theme }` |
| `exportSettings` | — | `exportResult` | 无 secret 的 JSON（剥离 `apiKey`、`hasApiKey`、`authHeaderTemplate`、`extraHeadersJson`） |
| `importSettings` | `{ json }` | `applyResult` | 校验 JSON 结构、重生成 profile UUID（重映射 `activeProfileId`），绝不继承本地密钥或自定义头 |
| `openExternal` | `{ url }` | `openExternalResult` | 在系统浏览器打开 http(s) 链接（关于页 / 文档）。非 http(s) 会被宿主拒绝。 |
| `openKeymap` | — | `openKeymapResult` | 打开宿主 IDE 快捷键设置，并尽量定位到手动触发（JB action `AutoComplete.Trigger` / VS Code 命令 `autoComplete.trigger`）。 |

`locale` 是 IDE 界面语言（VS Code `env.language`；JetBrains `DynamicBundle.getLocale()` BCP-47 tag）。settings-ui 映射为 en/zh/ja/ko。`theme` 是 IDE 明暗/高对比主题（`light` \| `dark` \| `high-contrast-dark` \| `high-contrast-light`，兼容旧值 `high-contrast`）；`uiTheme` 决定是否跟随。

## 宿主 → UI push

| type | payload |
|---|---|
| `snapshot` | 完整普通设置，不含 key；通常作为请求响应返回 |
| `logEntry` | **预留**；当前宿主按批而非逐条推送日志 |
| `logBatch` | `{ entries: LogEntry[] }`；订阅期间的活跃推送路径，通常每 100–200 ms |
| `themeChanged` | `{ theme }` — IDE 配色变化：`"light"` \| `"dark"` \| `"high-contrast-dark"` \| `"high-contrast-light"`（兼容旧值 `"high-contrast"`）；VS Code 与 JetBrains（`LafManagerListener`）均主动推送 |
| `localeChanged` | `{ locale }` — IDE 界面语言 tag（VS Code 打开时推送；JB 经 `getPlatform`） |
| `openTab` | `{ tab }` — 宿主请求 Settings UI 切换至指定标签页（如 `"profile"`、`"behavior"`、`"performance"`、`"logs"`、`"about"`） |
| `settingsChanged` | 当宿主在面板外（状态栏、命令、密钥变更等）修改配置时推送的完整 snapshot |

## 强制安全规则

1. `snapshot` 绝不返回 API key 明文，只能有每个 profile 的 `hasApiKey`。
2. secret 只通过一次 `setSecret` 传输；宿主写入 SecretStorage/PasswordSafe，UI 必须清空输入。
3. 可移植导出必须移除 `apiKey`、`hasApiKey`、`authHeaderTemplate` 与 `extraHeadersJson`；snapshot 仅可包含本地可编辑的头字段。
4. `importSettings` 必须为每个导入 profile 重生成 ID，绝不自动绑定本地已有密钥或继承本地自定义头。
5. `applySettings` 必须在宿主端执行服务端校验（拒绝非 http(s) URL、带 `userInfo` 的 URL、不含 `${apiKey}` 的 `authHeaderTemplate`、含敏感头的 `extraHeadersJson` 以及非法 `extraBodyJson`）。
6. 补全 HTTP 只能由 `packages/completion/engine-ts` / `packages/completion/engine-jvm` 发起；Web UI 不得 `fetch` 用户 `baseUrl`。
7. 连接/模板探测只能走 **Bridge → 宿主 → 引擎客户端**。
8. VS Code Webview 使用严格 CSP（`connect-src 'none'` 与 nonce 脚本）；JetBrains 使用打包的本地资源。

## `LogEntry` 形状

```ts
type LogEntry = {
  time: string          // ISO-8601
  level: "debug" | "info" | "warn" | "error"
  requestId?: string
  file?: string
  trigger?: string
  cacheHit?: boolean
  latencyMs?: number | null
  status?: number | null
  error?: string
  operation?: string
  method?: string
  url?: string
  model?: string
  requestStyle?: string
  responseChars?: number | null
  message?: string
}
```

## 探测结果

```ts
type ProbeResult = {
  status: "SUCCESS" | "EMPTY" | "FAILED"
  httpStatus?: number | null
  latencyMs: number
  preview?: string
  error?: string
  resolvedPath?: string
  resolvedUrl?: string
  template?: string
}
```

## `SessionStats` 形状

```ts
type SessionStats = {
  totalRequests: number
  cacheHits: number
  cancelled: number
  failed: number
  accepted: number
  p50LatencyMs: number | null
  p95LatencyMs: number | null
  currentDebounceMs: number
  backoffBlocked: boolean
  backoffFatal: boolean
}
```

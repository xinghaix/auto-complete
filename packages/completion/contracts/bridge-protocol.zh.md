# UiBridge 协议

[English](bridge-protocol.md) · [中文](bridge-protocol.zh.md)

每条消息均使用版本字段 `v: 1`。UiBridge 连接共用 `settings-ui` 与宿主；它不把 provider HTTP 暴露给 Web UI。

> **实现状态：** 当前稳定基线是 snapshot/profile/secret/probe/model/log-batch/platform/export/import。修改 `logLevel` 请通过 `applySettings`。标为**预留**的行描述兼容的未来形状，当前两个宿主不一定都会 dispatch。

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
| `applySettings` | `SettingsState` | `applyResult` | 校验并持久化普通设置 |
| `createProfile` | — | `snapshot` | 新建空 profile 并设为 active |
| `deleteProfile` | `{ profileId }` | `snapshot` | UI 必须先确认 |
| `selectProfile` | `{ profileId }` | `snapshot` | 切换 active profile |
| `renameProfile` | `{ profileId, name }` | `snapshot` | 宿主确保名称唯一 |
| `setSecret` | `{ profileId, secret }` | `secretResult` | 宿主保存后 UI 清空输入 |
| `clearSecret` | `{ profileId }` | `secretResult` | 清除该 profile 密钥 |
| `testConnection` | `{ profileId? }` | `probeResult` | 使用引擎客户端 |
| `probeTemplate` | `{ template, profileId? }` | `probeResult` | 探测一个模板 |
| `probeAllTemplates` | `{ profileId? }` | `probeAllResult` | 逐个探测模板 |
| `listModels` | `{ profileId? }` | `modelsResult` | 拉取模型列表 |
| `subscribeLogs` | 可选 `{ level? }` | `logSubscribed` | 后续推送 `logBatch` |
| `unsubscribeLogs` | — | `logUnsubscribed` | **预留**；JetBrains 已处理，当前 VS Code bridge 不 dispatch |
| `clearLogs` | — | `logsCleared` | 清空内存日志 |
| `getLogLevel` | — | `logLevel` | 日志级别 |
| `setLogLevel` | `{ level }` | `logLevel` | **预留**；当前通过 `applySettings` 修改 |
| `getPlatform` | — | `platform` | `{ platform, locale, theme }` |
| `exportSettings` | — | `exportResult` | 无 secret 的 JSON |
| `importSettings` | `{ json }` | `applyResult` | 合并/替换普通设置 |

`locale` 是 IDE 界面语言（VS Code `env.language`；JetBrains `DynamicBundle.getLocale()` BCP-47 tag）。settings-ui 映射为 en/zh/ja/ko。`theme` 是 IDE 明暗/高对比主题；`uiTheme` 决定是否跟随。

## 宿主 → UI push

| type | payload |
|---|---|
| `snapshot` | 完整普通设置，不含 key；通常作为请求响应返回 |
| `logEntry` | **预留**；当前宿主按批而非逐条推送日志 |
| `logBatch` | `{ entries: LogEntry[] }`；当前活跃推送路径，通常每 100–200 ms |
| `themeChanged` | **预留**；宿主通过 `getPlatform` 提供初始主题 |
| `localeChanged` | **预留**；宿主通过 `getPlatform` 提供初始语言 |
| `settingsChanged` | **预留**；当前 UI 从 apply/snapshot 响应刷新 |

## 强制安全规则

1. `snapshot` 绝不返回 API key 明文，只能有每个 profile 的 `hasApiKey`。
2. secret 只通过一次 `setSecret` 传输；宿主写入 SecretStorage/PasswordSafe，UI 必须清空输入。
3. 导出 JSON 必须移除 secret。
4. 补全 HTTP 只能由 `core-ts` / `core-jvm` 发起；Web UI 不得 `fetch` 用户 `baseUrl`。
5. 连接/模板探测只能走 **Bridge → 宿主 → core**。
6. VS Code Webview 使用严格 CSP；JetBrains 使用打包的本地资源。

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
  template?: string
}
```

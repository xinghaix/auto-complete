# UiBridge Protocol

[English](bridge-protocol.md) · [中文](bridge-protocol.zh.md)

Version field on every message: `v: 1`.

> **Implementation status:** the active baseline is snapshot/profile/secret/probe/model/log-batch/platform/export/import support. Use `applySettings` to change `logLevel`. Rows marked **reserved** describe a future-compatible shape and are not dispatched by both current hosts.

Transport:

- **VS Code**: Webview `postMessage` / `onDidReceiveMessage`
- **JetBrains**: JCEF `JBCefJSQuery` or `executeJavaScript` + CEF message router
- **Browser mock**: `window.__autoCompleteBridge` EventTarget for local dev

## Envelope

```ts
type BridgeRequest = {
  v: 1
  id: string           // correlation id
  type: string         // see table
  payload?: unknown
}

type BridgeResponse = {
  v: 1
  id: string           // matches request, or "" for push events
  type: string
  ok: boolean
  payload?: unknown
  error?: string
}
```

## UI → Host

| type | payload | response type | notes |
|------|---------|---------------|-------|
| `getSnapshot` | — | `snapshot` | Settings without secrets |
| `applySettings` | `SettingsState` | `applyResult` | Validate + persist non-secrets |
| `createProfile` | — | `snapshot` | Blank profile; becomes active |
| `deleteProfile` | `{ profileId }` | `snapshot` | Confirm in UI first |
| `selectProfile` | `{ profileId }` | `snapshot` | Switch active |
| `renameProfile` | `{ profileId, name }` | `snapshot` | Unique name enforced by host |
| `setSecret` | `{ profileId, secret }` | `secretResult` | Host stores; UI clears field |
| `clearSecret` | `{ profileId }` | `secretResult` | |
| `testConnection` | `{ profileId? }` | `probeResult` | Uses core client |
| `probeTemplate` | `{ template, profileId? }` | `probeResult` | |
| `probeAllTemplates` | `{ profileId? }` | `probeAllResult` | |
| `listModels` | `{ profileId? }` | `modelsResult` | |
| `subscribeLogs` | `{ level? }` | `logSubscribed` | Then push `logBatch` |
| `unsubscribeLogs` | — | `logUnsubscribed` | **Reserved**; JetBrains handles it, current VS Code bridge does not dispatch it |
| `clearLogs` | — | `logsCleared` | |
| `getLogLevel` | — | `logLevel` | |
| `setLogLevel` | `{ level }` | `logLevel` | **Reserved**; update through `applySettings` today |
| `getPlatform` | — | `platform` | `{ platform, locale, theme }` — **locale is IDE UI language** (VS Code `env.language`, JB `DynamicBundle.getLocale()` BCP-47). settings-ui maps to en/zh/ja/ko. **theme** is IDE color scheme (`light`/`dark`/`high-contrast`); settings-ui `uiTheme` preference (`auto`/`light`/`dark`) decides whether to follow it. |
| `exportSettings` | — | `exportResult` | No secrets |
| `importSettings` | `{ json }` | `applyResult` | Merge / replace |

## Host → UI (push)

| type | payload |
|------|---------|
| `snapshot` | full snapshot (no keys); normally returned in response to a request |
| `logEntry` | **Reserved**; current hosts batch logs rather than push individual entries |
| `logBatch` | `{ entries: LogEntry[] }` — active push path, typically every 100–200ms |
| `themeChanged` | **Reserved**; hosts provide initial theme through `getPlatform` |
| `localeChanged` | **Reserved**; hosts provide initial locale through `getPlatform` |
| `settingsChanged` | **Reserved**; current UI refreshes from apply/snapshot responses |

## Security (locked)

1. **`snapshot` never returns API key plaintext** — only `hasApiKey: boolean` per profile.
2. Secrets travel only via `setSecret` once; host writes to SecretStorage / PasswordSafe; UI must clear the input.
3. Export JSON must strip secrets.
4. Completion HTTP runs only in **core** (core-ts / core-jvm). Web UI must not `fetch` user `baseUrl`.
5. Test connection / template probes go **Bridge → host → core**.
6. CSP: VS Code Webview strict; JB prefers local packaged assets.

## LogEntry shape

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

## Probe result

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

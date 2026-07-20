# UiBridge Protocol

Version field on every message: `v: 1`.

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
| `unsubscribeLogs` | — | `logUnsubscribed` | |
| `clearLogs` | — | `logsCleared` | |
| `getLogLevel` | — | `logLevel` | |
| `setLogLevel` | `{ level }` | `logLevel` | |
| `getPlatform` | — | `platform` | `{ platform, locale, theme }` — **locale is IDE UI language** (VS Code `env.language`, JB `DynamicBundle.getLocale()` BCP-47). settings-ui maps to en/zh/ja/ko. **theme** is IDE color scheme (`light`/`dark`/`high-contrast`); settings-ui `uiTheme` preference (`auto`/`light`/`dark`) decides whether to follow it. |
| `exportSettings` | — | `exportResult` | No secrets |
| `importSettings` | `{ json }` | `applyResult` | Merge / replace |

## Host → UI (push)

| type | payload |
|------|---------|
| `snapshot` | full snapshot (no keys) |
| `logEntry` | single log entry |
| `logBatch` | `{ entries: LogEntry[] }` — preferred, every 100–200ms |
| `themeChanged` | `{ theme: "light"\|"dark"\|"high-contrast" }` |
| `localeChanged` | `{ locale: string }` |
| `settingsChanged` | external change notification |

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

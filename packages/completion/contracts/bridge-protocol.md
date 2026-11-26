# UiBridge Protocol

[English](bridge-protocol.md) · [中文](bridge-protocol.zh.md)

Version field on every message: `v: 1`.

> **Implementation status:** the active baseline covers snapshot/profile/secret/probe/model/log-batch/platform/export/import/clipboard/session-stats/cache-control support. Use `applySettings` to change `logLevel`. Rows marked **reserved** describe a future-compatible shape and are not dispatched by both current hosts.

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
| `applySettings` | `SettingsState` | `applyResult` | Server-side validation (engine `validateSettings`: `http(s)` baseUrl without userInfo, `authHeaderTemplate` must contain `${apiKey}` if non-blank, non-sensitive `extraHeadersJson`, valid object `extraBodyJson`, `debounceMin <= debounceInitial <= debounceMax`) + persist non-secrets; returns `{ ok, errors }` |
| `createProfile` | `{ name?, preset? }` (optional) | `snapshot` | Blank or preset-seeded profile (e.g. Ollama, DeepSeek Beta FIM, Mistral Codestral, vLLM/LM Studio — never secrets); becomes active |
| `deleteProfile` | `{ profileId }` | `snapshot` | Confirm in UI first |
| `selectProfile` | `{ profileId }` | `snapshot` | Switch active |
| `renameProfile` | `{ profileId, name }` | `snapshot` | Unique name enforced by host |
| `setSecret` | `{ profileId, secret }` | `secretResult` | Host stores secret; responds `{ profileId, hasApiKey }`; UI updates badge and clears field |
| `clearSecret` | `{ profileId }` | `secretResult` | Clears stored secret; responds `{ profileId, hasApiKey: false }` |
| `testConnection` | `{ profileId? }` | `probeResult` | Uses core client without mutating `activeProfileId`; logs to `LogBuffer` |
| `probeTemplate` | `{ template, profileId? }` | `probeResult` | Probes one template without mutating `activeProfileId`; logs to `LogBuffer` |
| `probeAllTemplates` | `{ profileId? }` | `probeAllResult` | Probes candidate templates and returns `{ results: ProbeResult[] }` |
| `listModels` | `{ profileId? }` | `modelsResult` | Returns `{ models: Array<{ id, contextLength? }>, error? }` |
| `subscribeLogs` | `{ level?, limit? }` (optional) | `logSubscribed` | Returns `{ ok?, entries: LogEntry[] }` filtered by `level` and capped by `limit`, then pushes `logBatch` |
| `unsubscribeLogs` | — | `logUnsubscribed` | Stop pushing `logBatch` when leaving Logs tab or closing panel |
| `clearLogs` | — | `logsCleared` | Clears in-memory log buffer |
| `getLogLevel` | — | `logLevel` | |
| `setLogLevel` | `{ level }` | `logLevel` | **Reserved**; update through `applySettings` today |
| `getSessionStats` | — | `sessionStats` | Local-only in-memory session telemetry (`SessionStats`); zero remote upload |
| `clearCaches` | — | `cachesCleared` | `{ ok: true }`; clears suggestion history + prompt LRU cache and resets error backoff |
| `copyToClipboard` | `{ text }` | `copyResult` | `{ copied: boolean }`; writes text via host OS clipboard (avoids JCEF `navigator.clipboard` restrictions) |
| `getPlatform` | — | `platform` | `{ platform, locale, theme }` — **locale** is IDE UI language (VS Code `env.language`, JB `DynamicBundle.getLocale()` BCP-47). settings-ui maps to en/zh/ja/ko. **theme** is IDE color scheme (`light` \| `dark` \| `high-contrast-dark` \| `high-contrast-light`, plus legacy `high-contrast`); settings-ui `uiTheme` preference (`auto`/`light`/`dark`) decides whether to follow it. |
| `exportSettings` | — | `exportResult` | No secrets; strips `apiKey`, `hasApiKey`, `authHeaderTemplate`, `extraHeadersJson` |
| `importSettings` | `{ json }` | `applyResult` | Validates JSON structure, regenerates profile UUIDs (remapping `activeProfileId`), never inherits local secrets or stripped header fields |
| `openExternal` | `{ url }` | `openExternalResult` | Open http(s) in system browser (About / docs links). Hosts reject non-http(s). |
| `openKeymap` | — | `openKeymapResult` | Open the host IDE keyboard-shortcut UI focused on manual trigger (JB action `AutoComplete.Trigger` / VS Code command `autoComplete.trigger`). |

## Host → UI (push)

| type | payload |
|------|---------|
| `snapshot` | full snapshot (no keys); normally returned in response to a request |
| `logEntry` | **Reserved**; current hosts batch logs rather than push individual entries |
| `logBatch` | `{ entries: LogEntry[] }` — active push path while subscribed, typically every 100–200ms |
| `themeChanged` | `{ theme }` — IDE color scheme change: `"light"` \| `"dark"` \| `"high-contrast-dark"` \| `"high-contrast-light"` (plus legacy `"high-contrast"`). Pushed by both VS Code and JetBrains (`LafManagerListener`). |
| `localeChanged` | `{ locale }` — IDE UI language tag (VS Code pushes on open; JB via `getPlatform`) |
| `openTab` | `{ tab }` — ask Settings UI to switch to a specific tab (e.g. `"profile"`, `"behavior"`, `"performance"`, `"logs"`, `"about"`) |
| `settingsChanged` | full snapshot pushed when host changes settings/secrets outside the panel (status bar, commands, etc.) |

## Security (locked)

1. **`snapshot` never returns API key plaintext** — only `hasApiKey: boolean` per profile.
2. Secrets travel only via `setSecret` once; host writes to SecretStorage / PasswordSafe; UI must clear the input.
3. Portable exports must strip `apiKey`, `hasApiKey`, `authHeaderTemplate`, and `extraHeadersJson`; snapshots may contain editable local header fields only.
4. `importSettings` must regenerate profile IDs and never bind imported profiles to existing local secrets or inherit local header overrides.
5. `applySettings` must run server-side validation on the host (rejecting non-http(s) URLs, URL `userInfo`, `authHeaderTemplate` without `${apiKey}`, sensitive headers in `extraHeadersJson`, and invalid `extraBodyJson`).
6. Completion HTTP runs only in the engines (`packages/completion/engine-ts` / `packages/completion/engine-jvm`). Web UI must not `fetch` user `baseUrl`.
7. Test connection / template probes go **Bridge → host → engine client**.
8. CSP: strict `Content-Security-Policy` (`connect-src 'none'`, nonce-gated scripts) on VS Code Webview; JB serves local packaged assets.

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
  resolvedUrl?: string
  template?: string
}
```

## SessionStats shape

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

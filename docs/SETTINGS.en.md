# Settings reference

[中文](SETTINGS.md) · [Documentation index](README.en.md)

Settings consist of **global preferences** and saved **provider profiles**. JetBrains and VS Code share these concepts but persist ordinary settings differently. API keys never go into ordinary settings files.

## Storage and host differences

| Data | JetBrains | VS Code |
|---|---|---|
| Regular settings and profiles | `PersistentStateComponent` in `autoCompleteSettings.xml` | `globalState`, with common values mirrored to `autoComplete.*` configuration |
| API key | per-profile PasswordSafe entry | per-profile SecretStorage entry |
| Settings/log UI | **Auto Complete** JCEF tool window | Webview panel; logs also reach OutputChannel |
| Export | UiBridge exports non-secret settings | UiBridge exports non-secret settings |

Snapshots and exports expose only `hasApiKey`, never `apiKey`. Import discards secret fields; enter keys again in the target IDE.

## Global behaviour

| Setting | Default | Meaning |
|---|---:|---|
| `enabled` | `true` | Master switch |
| `autoTrigger` | `true` | Request while typing; manual trigger remains available |
| `enableInComments` / `enableInStrings` | `true` | Allow completion in comments/strings |
| `firstLineOnlyWhenMidLine` | `true` | Show only the first line when the cursor is mid-line |
| `sendFilePath` | `true` | Add the file path to the prompt |
| `respectGitignore` | `true` | JetBrains includes project `.gitignore` patterns in skip rules; VS Code currently stores the preference but does not inject workspace `.gitignore` into its engine |
| `ignoreGlobs` | below | Extra ignored path patterns, one per line |
| `disabledLanguages` | empty | Disabled language IDs, comma/newline separated |
| `showStatusBar` | `true` | Show the status-bar entry |
| `uiTheme` | `auto` | Settings panel theme: follow IDE, light, or dark |

Default ignore globs:

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

JetBrains exposes `AutoComplete.Trigger` (Ctrl+Shift+Space by default, Cmd+Shift+Space on macOS), toggle, cancel, 30-minute snooze, and open-settings/logs actions; key bindings belong to the IDE Keymap. VS Code provides equivalent Trigger, Toggle Enabled, Open Settings Panel, Show Logs, and Set API Key commands.

> The current VS Code provider does not perform syntax-aware comment/string detection: it passes both context hints as `false` to the TS engine. These two settings therefore do not yet enforce that distinction on the VS Code hot path. JetBrains supplies hints through `ContextProbe`.

## Saved profiles

A profile is one endpoint connection. Profiles can be created, selected, renamed, and deleted; deleting all profiles is allowed. A new profile is blank rather than a copy of the current one. Older flat settings migrate into one profile on first use.

| Profile field | Default | Meaning |
|---|---:|---|
| `baseUrl` | `http://127.0.0.1:11434/v1` | OpenAI-compatible or custom service root |
| `model` | `qwen2.5-coder:7b` | Model ID |
| `promptTemplate` | `AUTO` | `AUTO`, `CODESTRAL_API`, `QWEN`, `DEEPSEEK`, `STARCODER`, or `CHAT` |
| `authHeaderTemplate` | `Authorization: Bearer ***` | Auth header template; omitted for an empty key |
| `extraHeadersJson` | `{}` | Extra request-header JSON object |
| `temperature` | `0` | Keep low for code completion |
| `maxTokens` | `128` | Output limit per completion |
| `timeoutMs` | `3000` | Ghost-text hard timeout, `500..30000` |
| `settingsTimeoutMs` | `15000` | Model/connection/template-probe timeout, `1000..120000` |
| `stream` | `false` | Experimental SSE first-token streaming |
| `fimPath` / `chatPath` / `completionsPath` | auto / `/chat/completions` / auto | Template-path overrides |
| `overrideContextBudget` | `false` | Use profile prefix/suffix budgets instead of global budgets |

The core client retains `CUSTOM` / `MISTRAL_FIM` compatibility enums, but current host profiles use the OpenAI-compatible request pipeline with header, path, and template overrides for compatibility needs. The settings UI does not expose a complete standalone custom-provider product flow. Historic `mistral-fim` is normalized on load to OpenAI-compatible plus an FIM template.

### Models and template probes

The panel can:

1. call `GET {baseUrl}/models`; if needed, try a compatible `/v1/models` path;
2. issue a small completion request to test the connection;
3. test the selected template or probe all FIM/chat templates in a stable order.

Results are `SUCCESS` (2xx with text), `EMPTY` (2xx with no suggestion), or `FAILED` (network/auth/HTTP failure). Diagnostics include method, resolved URL, status, or a truncated response. Probes travel through the host HTTP client, following JetBrains proxy support or the VS Code extension environment.

## Performance and context

| Setting | Default | Meaning |
|---|---:|---|
| `debounceMinMs` / `debounceInitialMs` / `debounceMaxMs` | `150 / 300 / 1000` | Adaptive automatic-trigger bounds |
| `maxPrefixChars` / `maxSuffixChars` | `8000 / 2000` | Outgoing prompt character budgets |
| `maxInFlight` | `1` | Global in-flight limit |
| `cacheSize` / `lruSize` | `20 / 64` | Suggestion-history and prompt-LRU capacity |
| `maxFileSizeKb` | `512` | Do not request larger files |
| `enableRecentFileContext` | `false` | Include snippets from recently open files |
| `recentFileLimit` / `recentFileMaxChars` | `3 / 1200` | Recent-context limits |

Recent-file context increases code sent to an endpoint; leave it off unless the endpoint's data handling is acceptable. `PromptBuilder` applies the final budget, and the settings UI never reads file content or calls provider HTTP.

## Logs and privacy

| Setting | Default | Meaning |
|---|---:|---|
| `logLevel` | `info` | `debug`, `info`, `warn`, or `error` |
| `logRetention` | `1000` | In-memory ring-buffer entries; oldest are discarded |
| `logPromptBodies` | `false` | Log truncated prompt bodies; sensitive and off by default |
| `notifyOnFatalError` | `true` | Notify on fatal configuration errors such as 401/403 |
| `showCostApprox` | `false` | Show approximate token usage when returned by the provider |

Logs never contain API keys or authorization headers. JetBrains also writes accepted log entries to `idea.log`; VS Code also writes to the **Auto Complete** OutputChannel. See the [UiBridge protocol](../packages/completion/contracts/bridge-protocol.md) for fields.

## Validation and remote endpoints

A connection requires a valid URL, a non-empty model when a profile exists, valid header JSON, positive context budgets, and values within the documented timeout/token ranges. The product currently **always permits** remote `baseUrl` values. The historical `allowRemote` field has no UI switch and is not a network-security boundary; constrain egress in the IDE, OS, or network instead.
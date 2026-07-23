# Providers and prompt templates

[中文](PROVIDERS.md) · [Documentation index](README.en.md)

Auto Complete has no account system. It sends a trimmed prefix/suffix to a user-configured HTTP endpoint and parses the response as inline completion text. Implementations live in `packages/completion/engine-jvm/.../client/HttpCompletionClient.kt` and `packages/completion/engine-ts/src/httpClient.ts`.

## Connection model

A profile contains a service root `baseUrl`, model, optional API key, auth-header template, extra-header JSON, template, and path overrides. API keys stay in PasswordSafe (JetBrains) or SecretStorage (VS Code); settings snapshots, exports, and logs never return plaintext keys.

Current host profiles use the OpenAI-compatible request pipeline with advanced header, path, and template overrides. The core client retains `CUSTOM` / `MISTRAL_FIM` compatibility enums, but the shipped settings UI does not expose a complete standalone custom-provider product flow. Historic `mistral-fim` is normalized on load to OpenAI-compatible plus an FIM template.

## Templates, paths, and wire formats

| Template ID | Intended models | Default path | Request body |
|---|---|---|---|
| `CODESTRAL_API` | Codestral / Mistral code / Devstral | `/fim/completions` | `prompt` + `suffix` fields |
| `QWEN` | Qwen, CodeGemma, generic coder names | `/completions` | one FIM-token `prompt` |
| `DEEPSEEK` | DeepSeek Coder | `/completions` | DeepSeek FIM-token `prompt` |
| `STARCODER` | StarCoder, SantaCoder, CodeLlama, etc. | `/completions` | StarCoder FIM-token `prompt` |
| `CHAT` | chat/completions services | `/chat/completions` | system/user `messages` with `<prefix>` / `<suffix>` |
| `AUTO` | default | detected | inferred from the model name; falls back to `CHAT` |

Paths are joined to `baseUrl`. For OpenAI FIM, a bare host resolves to `/v1/fim/completions`; a base URL already ending in `/v1` resolves to `/fim/completions`. `fimPath`, `completionsPath`, and `chatPath` override defaults. Verify the server API rather than assuming a model name selects a universally compatible payload.

Requests contain the model, `max_tokens` or an equivalent field, temperature, and optionally `stream=true`. FIM templates add their matching stop tokens. Defaults are 128 output tokens, temperature 0, and a 3000 ms completion timeout.

## OpenAI-compatible example

A typical local-service profile:

```text
baseUrl: http://127.0.0.1:11434/v1
model: qwen2.5-coder:7b
API key: empty only when the service is unauthenticated
promptTemplate: AUTO or QWEN
```

`CHAT` requires an OpenAI-style `messages` endpoint. `CODESTRAL_API` requires `prompt` and `suffix`. They are not interchangeable JSON shapes; use the template probe to decide.

## Authentication and extra headers

- The default header template is `Authorization: Bearer ***`; `***` is replaced with the dedicated API key.
- With an empty key, the default authorization header is omitted.
- `extraHeadersJson` must be a JSON object for non-sensitive routing headers. It is plaintext local configuration and omitted from portable exports; common credential header names (`Authorization`, `Cookie`, `X-API-Key`, and similar) are rejected.
- Logs redact authentication material. Never put keys in a base URL, example headers, issues, or exported config.

`baseUrl` must not contain URL user-info such as `https://user:token@example.test/v1`; both hosts reject it so credentials cannot enter URL diagnostics. Put authentication in the dedicated API-key field instead.

## Connection, model, and template probes

Panel operations always use **Web UI → UiBridge → host → HTTP client**. Webview/JCEF code never `fetch`es a user endpoint directly.

- **Fetch models** calls `/models`; a 404/405 triggers a compatible `/v1/models` attempt.
- **Test connection** sends a short Python prefix/suffix and caps `maxTokens` at 16.
- **Test template** sends the same small request with the selected template.
- **Try all templates** probes each concrete template in order and retains path, latency, status, and truncated preview.

`SUCCESS` means 2xx plus non-empty text. `EMPTY` means the endpoint is reachable but the model/template may not match. `FAILED` means a network, timeout, auth, or non-2xx failure. Settings probes use `settingsTimeoutMs` (15000 ms by default), separate from the 3000 ms ghost-text budget.

## Errors, cancellation, and networking

| Situation | Engine behaviour |
|---|---|
| User keeps typing or host cancels | Cancel the HTTP/job path silently |
| 401/403 | Fatal backoff; status/notification as configured |
| 429, 5xx, transport failure, timeout | Retriable backoff; log without interrupting editing |
| 2xx empty text or filtered text | Do not show a suggestion; log diagnostics |

JetBrains HTTP uses IDE proxy and trust-store support. VS Code uses the extension TypeScript client. Both hosts can cancel in-flight work. Redirect, TLS, and corporate-proxy behaviour depends on the host environment; inspect the final URL, error, and status in logs first.

## Privacy

Requests contain trimmed current-file prefix/suffix and, by default, a file path. They do not include a repository or recent files by default. Disable `sendFilePath` to omit paths and keep `enableRecentFileContext=false` to avoid open-file snippets. See [SETTINGS.en.md](SETTINGS.en.md) and [PERFORMANCE.en.md](PERFORMANCE.en.md).
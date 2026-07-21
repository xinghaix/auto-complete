# Providers and templates

[中文](PROVIDERS.md) · [Docs index](README.en.md)

No accounts. The plugin sends trimmed code to **your** HTTP endpoint and shows the reply as inline completion.

## What you configure

Per profile: Base URL, model, optional API key (IDE secret store), auth header template, extra headers, template, timeouts, path overrides. OpenAI-compatible style with room for custom headers/paths.

## Templates

| ID | Typical use | Default path | Body |
|---|---|---|---|
| CODESTRAL_API | Codestral / Mistral code | `/fim/completions` | `prompt` + `suffix` |
| QWEN | Qwen-like | `/completions` | FIM-token prompt |
| DEEPSEEK | DeepSeek Coder | `/completions` | DeepSeek tokens |
| STARCODER | StarCoder family | `/completions` | StarCoder tokens |
| CHAT | Chat-only servers | `/chat/completions` | `messages` |
| AUTO | default | auto | Infer from model name; else CHAT |

Paths are joined to Base URL. Override with `fimPath` / `chatPath` / `completionsPath`. **Probe the real API** — do not trust the model name alone.

Defaults: ~128 tokens, temperature 0, 3s completion timeout.

## Local example (Ollama)

```text
baseUrl: http://127.0.0.1:11434/v1
model:   qwen2.5-coder:7b
API key: empty
template: AUTO or QWEN
```

CHAT and FIM JSON are not interchangeable — use **Test template**.

## Auth

Default `Authorization: Bearer <key>`; omitted if key empty. `extraHeadersJson` must be a JSON object. Never put keys in URLs, samples, issues, or exports.

## Probes

Always **UI → host → engine** (no direct fetch from the panel).

| Action | Behaviour |
|---|---|
| Fetch models | `/models` (+ `/v1/models` fallback) |
| Test connection | tiny completion |
| Test template | same request with chosen template |
| Try all | walk FIM/chat templates |

`SUCCESS` / `EMPTY` / `FAILED`. Probes use longer `settingsTimeoutMs` (default 15s).

## Errors

Cancel is normal. 401/403 → fatal. 429/5xx/timeout → backoff + log. Empty body → no suggestion. Check logs for final URL and status.

## Privacy

Nearby code (+ optional path) only by default. See [SETTINGS.en.md](SETTINGS.en.md).

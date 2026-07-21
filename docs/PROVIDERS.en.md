# Providers and templates

[中文](PROVIDERS.md) · [Docs index](README.en.md)

No accounts. The plugin sends trimmed code to **your** HTTP endpoint and shows the reply as inline completion.

Inline completion works best when the server supports **FIM (Fill-In-the-Middle)**: both the text **before** and **after** the cursor. If you only have Chat, use template `CHAT` (pseudo-FIM); quality is usually weaker than real FIM.

## Recommended FIM / code-completion services

These options officially expose **FIM or code completion** and map well to this plugin. Put API keys **only in the settings panel**, never in docs or exports. Paths and fields can change — always confirm with the vendor docs and **Test connection / Test template**.

| Service | Best for | Suggested Base URL | Suggested template | Official docs |
|---|---|---|---|---|
| **[DeepSeek](https://www.deepseek.com/)** cloud | Official FIM (Beta) | `https://api.deepseek.com/beta` | `CODESTRAL_API` (`prompt` + `suffix`) | [FIM Completion](https://api-docs.deepseek.com/guides/fim_completion/) · [中文](https://api-docs.deepseek.com/zh-cn/guides/fim_completion/) |
| **[Mistral AI](https://mistral.ai/)** | Codestral FIM | `https://api.mistral.ai/v1` | `CODESTRAL_API` | [FIM API](https://docs.mistral.ai/api/endpoint/fim) |
| **Ollama** (local OpenAI-compatible) | Local coder models | `http://127.0.0.1:11434/v1` | `AUTO` or `QWEN` / `DEEPSEEK` / `CHAT` | Your local server docs |
| **vLLM / other OpenAI-compatible gateways** | Self-hosted FIM or chat | Your gateway root (often `/v1`) | Start with `AUTO`, then **Try all templates** | Gateway + model card |

### DeepSeek cloud (official FIM)

Official FIM: you supply a **prefix and optional suffix**; the model fills the middle — typical for code completion.

Docs set base URL to **`https://api.deepseek.com/beta`** (not the usual Chat `/v1` root). Use template **`CODESTRAL_API`** (`prompt` + `suffix` fields).

```text
Base URL:  https://api.deepseek.com/beta
Model:     as listed in the console / current DeepSeek docs
API key:   from the DeepSeek platform
Template:  CODESTRAL_API
```

If the default path fails, set **FIM path** under Advanced (e.g. the completions path their guide uses) and run **Test template**.  
Note: template id `DEEPSEEK` is a **token-style FIM** for many self-hosted DeepSeek Coder `/completions` servers — **not** the cloud Beta `prompt`+`suffix` API. Prefer `CODESTRAL_API` for DeepSeek cloud FIM.

### Mistral AI (Codestral FIM)

Official FIM endpoint uses `prompt` and optional `suffix`, e.g.  
`https://api.mistral.ai/v1/fim/completions` ([FIM API](https://docs.mistral.ai/api/endpoint/fim)).

```text
Base URL:  https://api.mistral.ai/v1
Model:     codestral-… (current console name)
API key:   Mistral API key
Template:  CODESTRAL_API
```

`CODESTRAL_API` already defaults to `/fim/completions`.

### Local Ollama example

```text
Base URL:  http://127.0.0.1:11434/v1
Model:     qwen2.5-coder:7b
API key:   empty if no auth
Template:  AUTO or QWEN
```

Whether FIM works depends on the model and server — use **Test template**.

## What you configure

Per profile: Base URL, model, optional API key (IDE secret store), auth header template, extra headers, template, timeouts, path overrides. OpenAI-compatible style with room for custom headers/paths.

## Templates

| ID | Typical use | Default path | Body |
|---|---|---|---|
| CODESTRAL_API | Mistral / DeepSeek cloud FIM, other `prompt`+`suffix` APIs | `/fim/completions` | `prompt` + `suffix` |
| QWEN | Qwen-like token FIM | `/completions` | FIM-token prompt |
| DEEPSEEK | Self-hosted DeepSeek Coder token FIM | `/completions` | DeepSeek FIM tokens |
| STARCODER | StarCoder family | `/completions` | StarCoder FIM tokens |
| CHAT | Chat-only servers | `/chat/completions` | `messages` |
| AUTO | default | auto | Infer from model name; else CHAT |

Paths join to Base URL. Override with `fimPath` / `chatPath` / `completionsPath`. **Probe the real API** — do not trust the model name alone.

Defaults: ~128 tokens, temperature 0, 3s completion timeout.

CHAT and real FIM JSON are not interchangeable — use **Test template**.

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

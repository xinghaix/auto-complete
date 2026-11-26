# User guide

[中文](GUIDE.md) · [Project home](../README.en.md)

For **end users**: install, connect a model, tune behaviour. Maintainers: [DEV.en.md](DEV.en.md).

## 1. Install & open settings

| Host | Requires | Install | Open settings |
|---|---|---|---|
| **JetBrains** | Platform **2024.2–2026.2+**; settings need **JCEF** (embedded browser) | [Marketplace](https://plugins.jetbrains.com/plugin/33040-auto-complete) (preferred); or Release **`*-signed.zip`** → Install from Disk | **Auto Complete** tool window |
| **VS Code** | **1.85+** | Release / local **VSIX** | Command **Auto Complete: Open Settings Panel** |

JetBrains settings / logs use a **JCEF web panel**. `com.intellij.modules.jcef` is an **optional** dependency so a single plugin package supports both 2024.2–2025.x (platform/JBR JCEF) and 2026.2+ (bundled standalone *Web Browser (JCEF)* plugin).

- **2024.2–2025.x:** JCEF ships with the official IDE / JetBrains Runtime; no separate plugin. Do not boot the IDE on a plain OpenJDK without JCEF.
- **2026.2+:** *Web Browser (JCEF)* is a separate bundled plugin. If the settings panel fails to open or shows the recovery page, open **Settings → Plugins** (or use the recovery page button), enable *Web Browser (JCEF)*, and **fully restart** the IDE.
- **Any version:** Find Action → Registry… and keep `ide.browser.jcef.enabled` checked.

When JCEF is unavailable, the tool window shows a **Swing recovery page** (no JCEF) with version-aware diagnostics and steps. Inline completion can still run if a profile is already saved.

## 2. First setup (~1 minute)

1. **Create a profile**, or pick a **Quick preset** (Ollama Local, DeepSeek Beta FIM, Mistral Codestral, vLLM / LM Studio) to fill Base URL, template, and default paths (never secrets)  
2. Verify **Base URL** and **model** (fetch and filter models from the dropdown)  
3. If auth is required, enter your **API key** and click **Save key** (or press `Enter`) to write it to IDE secure storage; the badge updates immediately  
4. Pick a **template** (`AUTO` if unsure), click **Test connection**, then **Test template** or **Try all** (includes **1-click apply recommended template**)  

```text
# Local Ollama example
Base URL:  http://127.0.0.1:11434/v1
Model:     qwen2.5-coder:7b
API key:   leave empty if no auth
Template:  AUTO
```

## 3. Recommended services & quick presets (prefer real FIM)

Inline completion works best with **FIM (Fill-In-the-Middle)**: text before *and* after the cursor. Chat-only servers can use `CHAT` (usually weaker).

| Preset / Service | Example Base URL | Template | Notes |
|---|---|---|---|
| **DeepSeek Beta FIM** | `https://api.deepseek.com/beta` | `CODESTRAL_API` | Official FIM uses the **beta** root, not Chat `/v1`; automatically resolves `/completions` when `fimPath` is empty. [Docs](https://api-docs.deepseek.com/guides/fim_completion/) |
| **Mistral Codestral** | `https://codestral.mistral.ai/v1` | `CODESTRAL_API` | Default path `/fim/completions` (`https://api.mistral.ai/v1` also supported). [FIM API](https://docs.mistral.ai/api/endpoint/fim) |
| **Ollama Local** | `http://127.0.0.1:11434/v1` | `AUTO` / `QWEN` / `CODELLAMA`… | Real FIM depends on model — probe it |
| **vLLM / LM Studio** | `http://127.0.0.1:8000/v1` | `AUTO` | Local OpenAI-compatible server; use **Try all** if unsure |

**Note:** template id `DEEPSEEK` is token-style FIM for many self-hosted `/completions` servers — **not** DeepSeek cloud Beta `prompt`+`suffix`. Use `CODESTRAL_API` for cloud FIM (`https://api.deepseek.com/beta` auto-resolves `/completions`).

Put keys **only in the settings panel using Save key**, never in docs, exports, or issues.

Exports remove API-key state, auth-header templates, and extra headers; imports strip those fields too, regenerate fresh profile UUIDs, and never inherit local keys. Non-blank `authHeaderTemplate` must contain `${apiKey}`; extra headers are only for non-sensitive routing metadata and common credential header names are rejected.

## 4. Templates & advanced options

| ID | Typical use | Default path |
|---|---|---|
| `CODESTRAL_API` | Mistral / DeepSeek cloud `prompt`+`suffix` | `/fim/completions` (auto-resolves `/completions` for DeepSeek `/beta`) |
| `QWEN` / `DEEPSEEK` / `STARCODER` | Token-style FIM | `/completions` |
| `CODELLAMA` | Native CodeLlama `<PRE>/<SUF>/<MID>` token FIM | `/completions` |
| `CHAT` | Chat-only | `/chat/completions` |
| `AUTO` | Infer from model name; else CHAT | auto |

- Paths join Base URL (preserving URL query parameters); Advanced can override `fimPath` / `chatPath` / `completionsPath`.
- Advanced also supports **`extraBodyJson`** (JSON object merged into completion request bodies for provider-specific options) and **`stopSequences`** (per-profile custom stop strings).
- Defaults: ~128 tokens, temperature 0, 3s completion timeout; probes use ~15s.
- **Streaming early-stop:** when streaming and `firstLineOnlyWhenMidLine` applies mid-line, the client stops as soon as the first non-empty line finishes (`\n`) to cut latency.
- Probes always go **UI → host → engine** (no direct fetch from the panel). Results: `SUCCESS` / `EMPTY` / `FAILED`. **Try all templates** offers **1-click apply recommended template**.

## 5. Settings, status bar & logs/stats

### Global

| Setting | Default | Meaning |
|---|---:|---|
| Enabled | on | Master switch |
| Auto trigger | on | Request while typing; **manual trigger** still works if off |
| In comments / strings | on | Cheap heuristic |
| First line mid-line | on | Only first line when cursor is mid-line (with streaming early-stop) |
| Send file path | on | Path in prompt |
| Respect .gitignore / ignore globs | on | Skip noise (also filters recent-file context) |
| Disabled languages | empty | e.g. `markdown, json` |
| Status bar | on | Takes effect immediately when toggled |
| Panel theme / language | auto | Settings panel only; follows light/dark/high-contrast and IDE language |

**Manual trigger shortcut** (default `Ctrl/Cmd+Shift+Space`) is owned by the IDE Keymap. **Configure in Keymap…** on the Completion behavior tab jumps to the host shortcut UI.

### Status bar quick menu

Clicking the status bar item opens a quick menu on both hosts:

- **JetBrains:** popup menu to switch saved profiles, toggle enabled, snooze (15m / 30m / 1h / resume), disable or enable the current file language, open Settings or Logs, and **Clear cache & reset backoff**.
- **VS Code:** `QuickPick` menu to switch saved profiles, toggle enabled, disable or enable the current file language, trigger / force-refresh completion, open Settings or Logs, and **Clear cache & reset backoff**.

### Profiles

One connection = one profile (Base URL, model, template, timeouts, path overrides, `extraBodyJson`, `stopSequences`). New profiles start **blank** (or seeded from Quick presets). After import, **re-enter and save keys**.

### Performance defaults

Debounce 150 / 300 / 1000 ms; prefix/suffix 8000 / 2000; max in-flight 1; skip files >512 KB; recent-file context **off** by default (when enabled, respects `.gitignore`, ignore globs, file size limits, and `sendFilePath`).

### Logs & local session stats

- **Logs tab:** level filter, search box, auto-scroll toggle, host-bridged clipboard copy, and clear; full prompt logging off by default; 401/403 can notify. Keys, auth headers, and URL query tokens are redacted.
- **Local session stats:** in-memory local counters (**zero remote upload**) showing total requests, cache hits, accepted, cancelled, failed, P50/P95 latency, current debounce, and backoff status.
- **Clear cache & reset backoff:** clears suggestion history + prompt LRU cache and resets error backoff (401/403 fatal backoff also resets automatically when settings or API keys are updated).

## 6. Privacy

- Keys stay only in IDE secure storage (PasswordSafe / SecretStorage) — never in normal settings, Settings Sync, exports, snapshots, or logs.  
- By default only nearby code around the cursor; path optional; no whole-repo / recent files by default.  
- Remote endpoint data policy is your responsibility.  

Security: [SECURITY.md](../SECURITY.md)

## 7. Troubleshooting

| Symptom | Try |
|---|---|
| No completions | Check Enabled / auto-trigger / snooze / backoff status; language disabled; file too large or ignored |
| Connection failed | Check Base URL & template match (or use Quick presets / Try all); check key & auth header; inspect URL + status in Logs |
| 401 / 403 | Verify key and click **Save key**; confirm cloud base (e.g. DeepSeek `/beta`); saving updated settings/key or clicking **Clear cache & reset backoff** recovers immediately |
| Connected but empty | `EMPTY`: try another template (`CODESTRAL_API` / `QWEN` / `CODELLAMA`) or confirm real FIM support |
| JetBrains blank settings / recovery page | Follow the recovery page: 2026.2+ enable *Web Browser (JCEF)* in **Settings → Plugins** and restart; 2024.2–2025.x use a JBR with JCEF; check Registry `ide.browser.jcef.enabled` |
| Stale ghost text after typing | Should cancel; if not, check logs and open an issue |

Maintainers / architecture summary: [DEV.en.md](DEV.en.md)

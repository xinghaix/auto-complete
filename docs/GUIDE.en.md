# User guide

[中文](GUIDE.md) · [Project home](../README.en.md)

For **end users**: install, connect a model, tune behaviour. Maintainers: [DEV.en.md](DEV.en.md).

## 1. Install & open settings

| Host | Requires | Install | Open settings |
|---|---|---|---|
| **JetBrains** | Platform **2024.2+**; settings need **JCEF** (embedded browser) | [Marketplace](https://plugins.jetbrains.com/plugin/33040-auto-complete) (preferred); or Release **`*-signed.zip`** → Install from Disk | **Auto Complete** tool window |
| **VS Code** | **1.85+** | Release / local **VSIX** | Command **Auto Complete: Open Settings Panel** |

JetBrains settings / logs use a **JCEF web panel**. `com.intellij.modules.jcef` is an **optional** dependency so both 2024.2 (platform/JBR JCEF) and 2026 (standalone *Web Browser (JCEF)* plugin) work.

- **2024.2–2025.x:** JCEF ships with the official IDE / JetBrains Runtime; no separate plugin. Do not boot the IDE on a plain OpenJDK without JCEF.
- **2026+:** If the settings panel fails to open, enable the bundled *Web Browser (JCEF)* under **Settings → Plugins**, then **fully restart** the IDE.
- **Any version:** Find Action → Registry… and keep `ide.browser.jcef.enabled` checked.

When JCEF is unavailable, the tool window shows a **Swing recovery page** (no JCEF) with diagnosis and steps. Inline completion can still run if a profile is already saved.

## 2. First setup (~1 minute)

1. **Create a profile**  
2. Set **Base URL**, **model**, and optional **API key** (IDE secure storage only)  
3. Pick a **template** (`AUTO` if unsure)  
4. **Test connection**; if that fails, **Test template / Try all**  

```text
# Local Ollama example
Base URL:  http://127.0.0.1:11434/v1
Model:     qwen2.5-coder:7b
API key:   leave empty if no auth
Template:  AUTO
```

## 3. Recommended services (prefer real FIM)

Inline completion works best with **FIM (Fill-In-the-Middle)**: text before *and* after the cursor. Chat-only servers can use `CHAT` (usually weaker).

| Service | Example Base URL | Template | Notes |
|---|---|---|---|
| DeepSeek cloud FIM | `https://api.deepseek.com/beta` | `CODESTRAL_API` | Official FIM uses the **beta** root, not Chat `/v1`. [Docs](https://api-docs.deepseek.com/guides/fim_completion/) |
| Mistral Codestral | `https://api.mistral.ai/v1` | `CODESTRAL_API` | Default path `/fim/completions`. [FIM API](https://docs.mistral.ai/api/endpoint/fim) |
| Local Ollama | `http://127.0.0.1:11434/v1` | `AUTO` / `QWEN`… | Real FIM depends on model — probe it |
| Other OpenAI-compatible | Your root (often `/v1`) | Start with `AUTO` | Then **Try all templates** |

**Note:** template id `DEEPSEEK` is token-style FIM for many self-hosted `/completions` servers — **not** DeepSeek cloud Beta `prompt`+`suffix`. Use `CODESTRAL_API` for cloud FIM.

Put keys **only in the settings panel**, never in docs, exports, or issues.

Exports remove API-key state, auth-header templates, and extra headers; legacy imports strip those fields too. Extra headers are only for non-sensitive routing metadata, and common credential header names are rejected.

## 4. Templates

| ID | Typical use | Default path |
|---|---|---|
| `CODESTRAL_API` | Mistral / DeepSeek cloud `prompt`+`suffix` | `/fim/completions` |
| `QWEN` / `DEEPSEEK` / `STARCODER` | Token-style FIM | `/completions` |
| `CHAT` | Chat-only | `/chat/completions` |
| `AUTO` | Infer from model name; else CHAT | auto |

Paths join Base URL; Advanced can override `fimPath` / `chatPath` / `completionsPath`. Defaults: ~128 tokens, temperature 0, 3s completion timeout; probes use ~15s.

Probes always go **UI → host → engine** (no direct fetch from the panel). Results: `SUCCESS` / `EMPTY` / `FAILED`.

## 5. Settings (plain language)

### Global

| Setting | Default | Meaning |
|---|---:|---|
| Enabled | on | Master switch |
| Auto trigger | on | Request while typing; **manual trigger** still works if off |
| In comments / strings | on | Cheap heuristic |
| First line mid-line | on | Only first line when cursor is mid-line |
| Send file path | on | Path in prompt |
| Respect .gitignore / ignore globs | on | Skip noise |
| Disabled languages | empty | e.g. `markdown, json` |
| Status bar | on | — |
| Panel theme / language | auto | Settings panel only |

**Manual trigger shortcut** (default `Ctrl/Cmd+Shift+Space`) is owned by the IDE Keymap. **Configure in Keymap…** on the Completion behavior tab jumps to the host shortcut UI.

JetBrains also has snooze; VS Code mainly uses toggle commands.

### Profiles

One connection = one profile. New profiles are **blank**. After import, **re-enter keys**.

### Performance defaults

Debounce 150 / 300 / 1000 ms; prefix/suffix 8000 / 2000; max in-flight 1; skip files >512 KB; recent-file context **off** (sends more code if enabled).

### Logs

Level and ring size; full prompt logging off by default; 401/403 can notify. Keys never logged.

## 6. Privacy

- Keys only in IDE secure storage — not in normal settings, exports, snapshots, or logs.  
- By default only nearby code around the cursor; path optional; no whole-repo / recent files by default.  
- Remote endpoint data policy is your responsibility.  

Security: [SECURITY.md](../SECURITY.md)

## 7. Troubleshooting

| Symptom | Try |
|---|---|
| No completions | Enabled / auto-trigger / snooze; language disabled; file too large or ignored |
| Connection failed | Base URL prefix; template match; key/auth header; URL + status in logs |
| 401 / 403 | Key and auth; correct cloud base (e.g. DeepSeek beta) |
| Connected but empty | `EMPTY`: try another template or confirm real FIM |
| JetBrains blank settings / recovery page | Follow the panel: 2026+ enable *Web Browser (JCEF)* and restart; 2024.2 use a JBR with JCEF; check Registry `ide.browser.jcef.enabled`; reinstall a fresh ZIP if needed |
| Stale ghost text after typing | Should cancel; if not, check logs and open an issue |

Maintainers / architecture summary: [DEV.en.md](DEV.en.md)

# Settings

[中文](SETTINGS.md) · [Docs index](README.en.md)

Two kinds of settings:

1. **Global** — enable, debounce, logs, …  
2. **Profiles** — one saved endpoint / model / timeout set  

Both hosts share the **same keys and settings UI**; only storage differs. **Keys never go into ordinary settings files.**

## Cross-host rules

| Same | May differ |
|---|---|
| Field names, defaults, panel | Storage format |
| Completion gates | Secret store APIs |
| Secret-free export/import | Tool window vs Webview |
| Panel theme / language | VS Code native Settings mirror |

Do not copy internal IDE storage files; use export/import.

## Where data lives

| | JetBrains | VS Code |
|---|---|---|
| Settings + profiles | `autoCompleteSettings.xml` | `globalState` (+ some `autoComplete.*`) |
| API key | PasswordSafe | SecretStorage |
| UI | Auto Complete tool window | Webview panel |

Snapshots/exports expose `hasApiKey` only. Re-enter keys after import.

## Global (common)

| Setting | Default | Meaning |
|---|---:|---|
| Enabled | on | Master switch |
| Auto trigger | on | Request while typing; manual still works if off |
| In comments / strings | on | Cheap heuristic, not a full parser |
| First line mid-line | on | Show only first line when cursor is mid-line |
| Send file path | on | Put path in the prompt |
| Respect .gitignore | on | Skip ignored paths |
| Ignore globs | see defaults | Extra patterns, one per line |
| Disabled languages | empty | IDs like `markdown, json` |
| Status bar | on | Status-bar entry |
| Panel theme / language | auto | Settings panel only |

Default ignores cover `.git`, `node_modules`, `dist`, `build`, `target`, `.idea`, `.gradle`, `vendor`, etc.

JetBrains has snooze; VS Code mainly uses toggle commands. Shortcuts are owned by the IDE Keymap; **Configure in Keymap…** on the Completion behavior tab opens the host shortcut UI (JB action `AutoComplete.Trigger`; VS Code command `autoComplete.trigger`).

## Profiles

One connection = one profile. New profile is **blank**.

| Field | Default | Meaning |
|---|---:|---|
| Base URL | `http://127.0.0.1:11434/v1` | Service root |
| Model | `qwen2.5-coder:7b` | Model id |
| Template | AUTO | Auto or FIM/Chat |
| Auth header | Bearer template | Omitted if key empty |
| Extra headers | `{}` | JSON object |
| Temperature | 0 | Prefer 0 for code |
| Max tokens | 128 | Output cap |
| Completion timeout | 3000 ms | Ghost-text request |
| Settings timeout | 15000 ms | Models / probes |
| Stream | off | Experimental |
| Path overrides | optional | Override template paths |
| Override context budget | off | Profile prefix/suffix limits |

Panel actions: fetch models, test connection, test one/all templates (`SUCCESS` / `EMPTY` / `FAILED`).

## Performance

Debounce 150/300/1000 ms; prefix/suffix 8000/2000; max in-flight 1; caches 20/64; max file 512 KB; recent files **off** by default (sends more code if enabled).

## Logs

Level, ring size, optional prompt bodies (sensitive), fatal notify, optional token usage in log lines (not a bill). Keys never logged.

## Validation

Valid URL + non-empty model when a profile exists; JSON object headers; timeouts/tokens in range. Remote URLs are always allowed; lock down egress outside the plugin if needed.

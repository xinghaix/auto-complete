# Implementation status

[中文](IMPLEMENTATION_STATUS.md) · [Docs index](README.en.md)

What the **code already does**, plus **allowed platform differences**. Do not document plans as shipped. Trust current CI/local command output for build health.

## Shipped

| Area | JetBrains | VS Code |
|---|---|---|
| Host | Inline completion, trigger, cancel, toggle, snooze, status bar, settings/logs tool window | Inline completion, commands, status bar, Output |
| Engine | Full Kotlin pipeline | Matching TS pipeline + shared fixtures |
| Providers | FIM/Chat templates, probes, list models | Same semantics |
| Settings | Multi-profile, PasswordSafe, JCEF panel | Multi-profile, SecretStorage, Webview |
| Shared | — | Vue settings UI (en/zh/ja/ko) + contracts |

JetBrains: **2024.2+** with JCEF. VS Code: **1.85+**.

## Engine behaviour (both)

Enable/auto-trigger, debounce/cancel, cache, FIM/Chat, separate timeouts, backoff, logs, optional path/recent files, profiles + secret-free export.

## Cross-host policy

Converge by default; differ only where the platform forces it; UI changes checked on **JCEF + Webview** (`AGENTS.md`).

## Allowed differences

| Item | Today |
|---|---|
| Comment/string | Heuristic probe on both |
| `.gitignore` | Both inject project/workspace root |
| Recent files | Both; open files vs visible editors |
| Settings chrome | Tool window vs Webview (+ some native keys) |
| Secrets | Equivalent concepts, different storage |
| Actions | JB snooze; VS Code toggle/commands |
| Publishing | `v*` can attach Release artifacts; Marketplace/signing manual |
| Agent / Next Edit | Out of scope |

Different storage paths ≠ different features.

## Verify

```bash
npm install
./gradlew :core:test :plugin:test
npm run test:js
npm run build:js
./scripts/package-local.sh
```

Package script is not a full test suite. See [RELEASE.en.md](RELEASE.en.md).

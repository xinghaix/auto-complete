# Architecture

[中文](ARCHITECTURE.md) · [Docs index](README.en.md)

In short: **two IDE hosts + two matching completion engines + one Web settings UI**. Hosts never call each other over RPC.

## In scope / out of scope

**In:** you supply `baseUrl`, model, and optional key; the editor shows ghost text; typing cancels stale requests.

**Out:**

- JetBrains calling VS Code (or the reverse)
- Default whole-repo or heavy multi-file context
- Settings UI calling your model HTTP directly (always host → engine)
- Network work on the JetBrains UI thread
- Agent / Next Edit / account systems

Behaviour is informed by classic Kilo Code completion; code here is independent — see [SOURCES.en.md](SOURCES.en.md).

## Layout

```text
apps/jetbrains/plugin/     JetBrains host
apps/vscode/extension/     VS Code host
packages/completion/
  engine-jvm/              Kotlin engine (Gradle :core)
  engine-ts/               TypeScript engine
  contracts/               shared rules, templates, bridge, fixtures
packages/settings/ui/      Vue settings + logs
docs/
scripts/package-local.sh
```

Gradle owns `:core` and `:plugin`. Node owns the TS engine, settings UI, and VS Code extension. Two build chains — not “plugin depends on extension”.

## Responsibilities

| | JetBrains | VS Code |
|---|---|---|
| Editor entry | Inline completion | Inline completion |
| Engine | Kotlin | TypeScript |
| Secrets | PasswordSafe | SecretStorage |
| Settings / logs | Tool window (JCEF) | Webview + Output |
| Settings storage | XML persistent state | globalState (+ some native keys) |
| Network | IDE proxy / trust store | extension `fetch` |

JetBrains minimum **2024.2** with working JCEF. VS Code **1.85+**.

## Request path

```text
edit / manual trigger
  → host reads snippet, language, path
  → engine gates, cache, debounce, cancel
  → trim prefix/suffix → HTTP → filter
  → ghost text + logs / status
```

Only nearby code by default. Comment/string hints use a cheap probe on both hosts. Settings semantics converge — [SETTINGS.en.md](SETTINGS.en.md).

## Shared engine behaviour

Debounce ~150/300/1000 ms; completion timeout 3s by default; prefix/suffix 8000/2000; default one in-flight request; optional streaming and recent-file snippets (off by default).

## Providers

Templates build FIM or chat bodies. Probes run **UI → host → engine client**. Details: [PROVIDERS.en.md](PROVIDERS.en.md).

## Config & privacy

Global prefs + profiles; secrets never in export/snapshot; defaults favour privacy. Bridge: [protocol](../packages/completion/contracts/bridge-protocol.md).

## Verification

JVM + JS tests; CI on JDK 21 and Node 22. Build: [RELEASE.en.md](RELEASE.en.md).

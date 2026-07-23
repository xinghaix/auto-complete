# Contributing

[中文](CONTRIBUTING.zh.md) · [English](CONTRIBUTING.md)

Dual-host inline completion: JetBrains (`:core` + `:plugin`) and VS Code (`engine-ts` + extension) share `settings/ui` and `contracts`. Independent implementation — no JB↔VS Code bridge, `kilo serve`, accounts, or Agent/Next Edit.

## Develop

Needs **JDK 21** and **Node 18+**. Commands and signing: **[docs/DEV.en.md](docs/DEV.en.md)**.

```bash
npm install
npm run build:settings-ui
./gradlew :core:test :plugin:test
npm run test:js
npm run build:js
./scripts/package-local.sh
```

## Layout

| Path | Role |
|---|---|
| `packages/completion/engine-jvm` | Kotlin engine (`:core`) |
| `apps/jetbrains/plugin` | JetBrains host |
| `packages/completion/engine-ts` | TypeScript engine |
| `apps/vscode/extension` | VS Code host |
| `packages/settings/ui` | Shared settings UI |
| `packages/completion/contracts` | Contracts / fixtures |

## Rules (short)

1. Read `AGENTS.md` and the right doc first (user behaviour → `docs/GUIDE.en.md`; build → `docs/DEV.en.md`).  
2. Keep engines host-free; no IDE APIs in core packages.  
3. Keep cancellation and generation checks; settings UI must not call provider HTTP directly.  
4. Keys only in PasswordSafe / SecretStorage; no secrets, private endpoints, or home paths in the tree (`AGENTS.md`).  
5. Change shared behaviour on both hosts + fixtures; intentional gaps go under “allowed host gaps” in `docs/DEV.en.md`.  
6. User-facing changes update Chinese/English user docs (`README` / `GUIDE`).  
7. Settings UI: dual-host check (JCEF + Webview) per `AGENTS.md`.  

## PRs

Stay focused; note user impact in `CHANGELOG.md` `[Unreleased]`; prefer `feat:` / `fix:` / `docs:` prefixes. Do not push, publish, or tag unless asked.

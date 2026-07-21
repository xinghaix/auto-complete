# Build, install, release

[中文](RELEASE.md) · [Docs index](README.en.md)

Open-source preview: install local ZIP/VSIX. Marketplace listing and signing are **not** default CI.

## Prerequisites

| Goal | Need |
|---|---|
| Build JetBrains plugin | JDK 21 + network for platform deps |
| Settings UI / VS Code | Node 18+, npm |
| Run JetBrains | 2024.2+, working JCEF |
| Run VS Code | 1.85+ |

Set `JAVA_HOME` to a JDK 21 install when needed (paths differ by OS).

## Full verification

```bash
npm install
./gradlew :core:test :plugin:test
npm run test:js
npm run build:js
./gradlew :plugin:buildPlugin
```

Sandbox IDE (not the same as install-from-zip QA):

```bash
./gradlew :plugin:runIde
```

## Dual-host package

```bash
./scripts/package-local.sh
```

| Artifact | Install |
|---|---|
| `.../distributions/auto-complete-*.zip` | Install Plugin from Disk |
| `.../dist-vsix/auto-complete-*.vsix` | Install from VSIX |

One host: `SKIP_JB=1` or `SKIP_VSCODE=1`.

> The package script only forces `:core:test` — **not** a full test substitute.

## Smoke after install

Create a profile → test connection → type and watch ghost text cancel on continue → check settings UI on both hosts.

## CI

JDK 21 tests + ZIP; Node 22 JS tests + build; `v*` tags create a same-name GitHub Release with artifacts when tests pass (skip if release exists). No Marketplace/signing automation.

## Release checklist

Bump versions → CHANGELOG → full tests + package → real install smoke → annotated `vX.Y.Z` tag when intended → tokens only in CI/env.

Do not push/tag/publish without explicit intent.

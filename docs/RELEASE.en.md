# Build, install, release

[中文](RELEASE.md) · [Docs index](README.en.md)

**Preferred installs:**

| Host | Preferred | Fallback |
|---|---|---|
| JetBrains | [Marketplace · Auto Complete](https://plugins.jetbrains.com/plugin/33040-auto-complete) | GitHub Release **`*-signed.zip`** (Install from Disk) |
| VS Code | GitHub Release / local VSIX | `package:vscode` |

JetBrains Marketplace and GitHub Release ZIPs are **signed**. CI uploads **only `*-signed.zip`** when signing secrets are configured — no unsigned distribution artifact.

## Prerequisites

| Goal | Need |
|---|---|
| Build JetBrains plugin | **JDK 21** + network for platform deps |
| Settings UI / VS Code | Node 18+, npm |
| Run JetBrains | 2024.2+, working JCEF |
| Run VS Code | 1.85+ |
| Signed CI ZIP | Secrets: `CERTIFICATE_CHAIN`, `PRIVATE_KEY` — [MARKETPLACE.en.md](MARKETPLACE.en.md) |

Use JDK 21 (not Homebrew default openjdk 26):

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
```

## Full verification

```bash
npm install
./gradlew :core:test :plugin:test
npm run test:js
npm run build:js
```

Sandbox: `./gradlew :plugin:runIde` (not the same as Marketplace install QA).

## Local package

```bash
export CERTIFICATE_CHAIN="$(cat ~/.jb-plugin-signing/chain.crt)"
export PRIVATE_KEY="$(cat ~/.jb-plugin-signing/private.pem)"
./scripts/package-local.sh
```

| Artifact | Path |
|---|---|
| JetBrains **signed** ZIP | `apps/jetbrains/plugin/build/distributions/*-signed.zip` |
| VS Code VSIX | `apps/vscode/extension/dist-vsix/auto-complete-*.vsix` |

Without signing env, `package-local.sh` may still emit an **unsigned** ZIP for local debug only — do not ship it as a release.

## CI

| Case | Behaviour |
|---|---|
| PR without secrets | JVM tests; **no** JB ZIP artifact |
| main/tag with secrets | `buildPlugin` + **`signPlugin`**; upload `*-signed.zip` only |
| Node job | tests + VSIX |
| `v*` tag | GitHub Release with signed ZIP + VSIX |
| `v*` + `PUBLISH_TOKEN` | optional `publishPlugin` |

## Release checklist

Bump versions → CHANGELOG → full tests → signed secrets OK → smoke → annotated `vX.Y.Z` tag. Never commit keys/tokens.

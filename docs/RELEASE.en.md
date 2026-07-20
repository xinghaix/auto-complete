# Build, install, and release

[中文](RELEASE.md) · [Documentation index](README.en.md)

The current version is an open-source preview: build it locally and install through **JetBrains Install Plugin from Disk** or **VS Code Install from VSIX**. Marketplace publishing is not the default flow and CI does not perform it automatically.

## Prerequisites

| Target | Requirement |
|---|---|
| JetBrains plugin | JDK 21 and network access for IntelliJ Platform/Gradle dependencies |
| JS, settings UI, VS Code extension | Node.js 18+ and npm |
| JetBrains runtime | IntelliJ Platform 2024.2+ (build 242+) with working JCEF |
| VS Code runtime | VS Code `^1.85.0` |

Example JDK 21 setup for macOS Homebrew:

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
```

It is only an example; point `JAVA_HOME` at your JDK 21 installation on Linux or Windows.

## Install dependencies and run full verification

From the repository root:

```bash
npm install
./gradlew :core:test :plugin:test
npm run test:js
npm run build:js
./gradlew :plugin:buildPlugin
```

This runs Kotlin/JetBrains tests, TypeScript/settings-UI tests, the JS build, and the JetBrains distribution build. The ZIP is written to:

```text
apps/jetbrains/plugin/build/distributions/auto-complete-<version>.zip
```

For JetBrains development:

```bash
./gradlew :plugin:runIde
```

This starts an isolated IDE sandbox; it is not a replacement for installed-ZIP compatibility validation.

## Local dual-host packaging

Use the script to make installable artifacts:

```bash
npm install              # first time or after dependency changes
./scripts/package-local.sh
# or npm run package:local
```

It builds shared `settings-ui`, runs `:core:test`, builds the JetBrains ZIP, then builds `core-ts`, the VS Code extension, and a VSIX.

| Artifact | Installation |
|---|---|
| `apps/jetbrains/plugin/build/distributions/auto-complete-*.zip` | JetBrains: Settings/Preferences → Plugins → ⚙ → Install Plugin from Disk… → restart |
| `apps/vscode/extension/dist-vsix/auto-complete-*.vsix` | VS Code: Extensions → … → Install from VSIX… → reload window |

Build one host only:

```bash
SKIP_JB=1 ./scripts/package-local.sh      # VS Code only
SKIP_VSCODE=1 ./scripts/package-local.sh  # JetBrains only
```

> The script packages artifacts; it is not full verification. It explicitly runs only `:core:test`, not `:plugin:test` or `npm run test:js`. Run the full commands above before a release.

## First configuration and smoke test

1. Create/select a profile and enter Base URL, model, and optional API key.
2. Run **Fetch models** (optional) and **Test connection** first.
3. Select a FIM/chat template; use **Test template** or **Try all templates** when necessary.
4. In a supported text file, check automatic ghost text, manual trigger, cancellation on typing, native acceptance behaviour, and logs.
5. On JetBrains, check the JCEF panel on 2024.2 and a newer IDE; newer IDEs may need **Web Browser (JCEF)** enabled. See [COMPATIBILITY.md](COMPATIBILITY.md).
6. On VS Code, check the settings panel, OutputChannel, SecretStorage key, and VSIX install.

## CI

`.github/workflows/ci.yml` defines two jobs:

- **JVM (JDK 21):** `./gradlew :core:test :plugin:test --stacktrace`, `./gradlew :plugin:buildPlugin --stacktrace`, then ZIP artifact upload.
- **JS (Node 22):** `npm install`, `npm run test:js`, and `npm run build:js`.

CI builds and tests on `main`/PRs. A pushed `v*` tag downloads the successful ZIP/VSIX artifacts after the JVM and JS jobs, then creates a GitHub Release. If that tag already has a release, the workflow skips publication and never overwrites or uploads duplicates. Marketplace publishing and signing remain manual.

## Versioning and release checklist

1. Update `pluginVersion` in `gradle.properties` and keep the version intent consistent with `apps/vscode/extension/package.json` and the root Node workspace.
2. Add user-visible notes under `[Unreleased]` in `CHANGELOG.md`.
3. Run full verification, then dual-host packaging.
4. Install artifacts manually on target JetBrains/VS Code versions and smoke test.
5. Create and push an annotated `v<version>` tag; after tests pass, CI creates the matching GitHub Release and attaches ZIP and VSIX. An existing release for the tag is safely skipped.
6. Configure Marketplace/signing tokens only when explicitly requested; tokens must come from environment or CI secrets, never the repository.

Suggested tag:

```bash
git tag -a v0.1.1 -m "Auto Complete 0.1.1"
```

Do not push, tag, or publish without explicit user direction.
# Contributing

[中文](CONTRIBUTING.zh.md) · [English](CONTRIBUTING.md)

Thanks for your interest in **Auto Complete**.

## Origin note

Completion behavior is extracted/reimplemented from open-source [kilocode](https://github.com/Kilo-Org/kilocode). **JetBrains only today; VS Code planned.** Keep PRs focused on this product boundary.

## Development setup

1. JDK **21**
2. Clone the repo and open it in IntelliJ IDEA (or any editor + CLI Gradle)
3. Run tests:

```bash
./gradlew :core:test :plugin:test
```

4. Run an isolated IDE with the plugin:

```bash
./gradlew :plugin:runIde
```

5. Package a zip for Install from Disk:

```bash
./scripts/package-local.sh
# → plugin/build/distributions/auto-complete-*.zip
```

## Project rules (short)

Hard product constraints are in [`AGENTS.md`](AGENTS.md). Highlights:

- No VS Code Extension Host / RPC bridge; no `kilo serve` runtime
- Do not store API keys in plain XML
- Do not perform HTTP on the EDT
- Do not default to whole-file or whole-repo context
- v1 scope: inline completion only (no Agent / Next Edit product)

## Pull requests

1. Prefer a focused PR with a clear description
2. Include tests for engine / client / settings logic when possible
3. Update `CHANGELOG.md` under `[Unreleased]` for user-visible changes
4. Keep commits conventional when practical: `feat:`, `fix:`, `docs:`, `chore:`

## Code layout

| Path | Responsibility |
|------|----------------|
| `core/src/main/kotlin` | Engine, HTTP, prompts (no IntelliJ UI) |
| `plugin/src/main/kotlin` | Settings, InlineCompletion, status bar, logs |
| `plugin/src/main/resources/messages` | UI strings (en / zh / ja / ko) |

## Questions

Open a GitHub issue for design discussion before large refactors.

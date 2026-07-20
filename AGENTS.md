# AGENTS.md

Guidance for agents/developers implementing or releasing `auto-complete`.

## Product

JetBrains inline AI autocomplete plugin.  
Single process, Kotlin, direct user `baseUrl` / API key (PasswordSafe).

**Origin:** completion core extracted from open-source [kilocode](https://github.com/Kilo-Org/kilocode) (post-v7 spin-out).  
**Now:** JetBrains only · **Planned:** VS Code extension.

User-facing docs: Chinese default [`README.md`](README.md), English [`README.en.md`](README.en.md).

## Current stage

**Open-source preview.**

- Ship via Install from Disk / GitHub Releases
- CI runs tests + `buildPlugin`
- **Do not** commit Marketplace / signing tokens
- Marketplace `publishPlugin` only when explicitly requested and token is env-only

## Required reading

1. `docs/ARCHITECTURE.md`
2. `docs/SETTINGS.md`
3. `docs/PROVIDERS.md`
4. `docs/PERFORMANCE.md`
5. `docs/RELEASE.md`
6. `docs/COMPATIBILITY.md` — **JetBrains min 2024.2 / build 242**; optional jcef + reflective host
7. `docs/OPEN_SOURCE.md`
8. `docs/SOURCES.md`
9. `docs/IMPLEMENTATION_STATUS.md`
10. `CONTRIBUTING.md`

## Hard constraints

- No VS Code extension host / RPC bridge
- No `kilo serve` as a runtime dependency
- No Next Edit / Agent product in v1
- Do not default to whole-file or whole-repo context
- Do not store apiKey in plain XML
- Do not perform HTTP on the EDT
- Do not add secrets to the repository
- JetBrains **minimum 2024.2 / `pluginSinceBuild=242`**. Settings are **Web/JCEF only** (no Swing settings). Keep `com.intellij.modules.jcef` **optional** and load JCEF via `SettingsJcefHost` reflection — never hard-require the jcef plugin or put `JBCefBrowser` types on `SettingsWebPanel`.

## Local package (JetBrains + VS Code)

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home  # if needed
./scripts/package-local.sh
# or: npm run package:local

# JetBrains: Install Plugin from Disk → plugin/build/distributions/auto-complete-*.zip
# VS Code:   Install from VSIX     → hosts/vscode/dist-vsix/auto-complete-*.vsix

# Optional: SKIP_JB=1 or SKIP_VSCODE=1 to package only one host
```

## Reference projects (read-only)

Behavioral reference only — do not implement this product inside those trees:

- https://github.com/Kilo-Org/kilocode-legacy (classic autocomplete algorithms)
- https://github.com/Kilo-Org/kilocode (monorepo; contrast only)

## Git

- Prefer conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, `test:`
- Release version bump: `chore(release): X.Y.Z`
- First public docs/CI snapshot: `docs: open-source the JetBrains auto-complete plugin`
- Tags: annotated `vX.Y.Z` with subject `Auto Complete X.Y.Z` (see `docs/OPEN_SOURCE.md`)
- Do not push to remote unless the user asks
- Do not force-push `main` without explicit request

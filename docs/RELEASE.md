# Release / Distribution

[中文文档索引](README.md) · [English index](README.en.md)

**Stage:** open-source preview (zip / GitHub Releases).  
JetBrains Marketplace is optional and not required for community use.  
产品说明默认中文：[../README.md](../README.md) · [English](../README.en.md)

## 1. Distribution channels

| Channel | Use | How |
|---------|-----|-----|
| Install from Disk | Users & self-test | `buildPlugin` zip |
| GitHub Releases | Public download | Attach zip to a tag |
| `runIde` | Contributor sandbox | `./gradlew :plugin:runIde` |
| Marketplace | Optional later | Token via env only — never commit |

Artifact:

```text
plugin/build/distributions/auto-complete-<version>.zip
```

## 2. Compatibility (JetBrains)

| | |
|--|--|
| **Minimum** | **2024.2+** / Platform build **`242`** (`pluginSinceBuild`) |
| **JCEF** | Web-only settings; **optional** `com.intellij.modules.jcef` + reflective host (`SettingsJcefHost`) |
| Full notes | [COMPATIBILITY.md](COMPATIBILITY.md) |

Do not mark jcef as a **required** `<depends>` again — that breaks 2024.2 plugin load.

## 3. Build & install

```bash
export JAVA_HOME=...   # JDK 21 if needed
./scripts/package-local.sh
# or: ./gradlew :core:test :plugin:test :plugin:buildPlugin
```

IDE (**2024.2+**):

1. On 2025.3+/2026, enable **Web Browser (JCEF)** if present
2. Settings → Plugins → ⚙ → **Install Plugin from Disk…**
3. Select the zip → restart
4. Settings → Tools → **Auto Complete** (or tool window)
5. Configure endpoint → **Test Connection**

## 4. Release checklist

- [ ] `CHANGELOG.md` updated for the version
- [ ] `pluginVersion` / `pluginSinceBuild` in `gradle.properties` (min **242** unless COMPATIBILITY.md updated)
- [ ] `./gradlew :core:test :plugin:test` green
- [ ] `./gradlew :plugin:buildPlugin` green
- [ ] Smoke on **2024.2** and/or **2026.x**: install zip, Web settings (JCEF), Test Connection, ghost text, logs, keymap
- [ ] Git tag `v<pluginVersion>` (annotated) + push
- [ ] GitHub Release title `Auto Complete <version>` + attach zip
- [ ] (Optional) Marketplace publish — only with env token

### Commit / tag wording

**Commits (ongoing):** conventional — `feat:`, `fix:`, `docs:`, `chore:`, `test:`.

**Release commit** (when bumping version in-tree):

```text
chore(release): 0.1.1

Summarize user-facing changes in the body; keep subject = version only.
```

**First open-source snapshot** (docs/CI without version bump):

```text
docs: open-source the JetBrains auto-complete plugin
```

**Tag:** always `v` + version, e.g. `v0.1.1` (matches `auto-complete-0.1.1.zip`).

```bash
git tag -a v0.1.1 -m "Auto Complete 0.1.1

Install-from-Disk / GitHub Release build.
See CHANGELOG.md for details."
```

## 5. Versioning

- `0.1.x` — open-source preview; breaking changes allowed with notes
- Prefer semver once past 0.x
- Tag name ≡ `v` + `pluginVersion`; never tag `latest` or date-only names

## 5. Marketplace (optional, later)

1. JetBrains account + Marketplace listing  
2. Keep plugin id `io.autocomplete` stable  
3. English description + screenshots + privacy notes  
4. `JETBRAINS_MARKETPLACE_TOKEN` as CI/env secret only  
5. Optional `signPlugin`  
6. `./gradlew :plugin:publishPlugin`

```kotlin
// plugin/build.gradle.kts — enable only when intentionally publishing
// intellijPlatform {
//   publishing {
//     token.set(providers.environmentVariable("JETBRAINS_MARKETPLACE_TOKEN"))
//   }
// }
```

## 6. Do not

- Commit Marketplace or signing secrets  
- Treat Marketplace as required for open source  
- Bundle API keys or model weights  

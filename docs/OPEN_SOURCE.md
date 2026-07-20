# Open-source readiness

[中文文档索引](README.md) · [English index](README.en.md) · 产品说明默认 [中文 README](../README.md) / [English](../README.en.md)

Checklist for publishing this repository and distributing zips outside private self-test.

**Story:** completion core from [kilocode](https://github.com/Kilo-Org/kilocode); spun out after v7; **JetBrains now**, **VS Code planned**.

## Already in place

- [x] Apache-2.0 `LICENSE` + `NOTICE`
- [x] Public-facing `README.md`
- [x] `CONTRIBUTING.md` / `SECURITY.md`
- [x] CI workflow (`.github/workflows/ci.yml`)
- [x] Plugin description without “private only” branding
- [x] No Marketplace token in repo
- [x] Docs avoid absolute machine-local reference paths

## Before first public push

1. **Create empty GitHub repo** (name e.g. `auto-complete`)
2. Set remote and push `main` (do not force-push over others’ history)
3. Confirm `.gitignore` excludes `build/`, `.gradle/`, IDE sandboxes, local secrets
4. Scan tree for personal paths, tokens, internal-only notes
5. Commit & tag using the conventions below
6. Attach `plugin/build/distributions/auto-complete-<version>.zip` to the GitHub Release

### Commit message (first public snapshot)

Prefer one focused commit for “repo hygiene + docs + CI”, not a vague “update”:

```text
docs: open-source the JetBrains auto-complete plugin

Add public README, CONTRIBUTING, SECURITY, and CI.
Strip private-only branding from plugin metadata.
Document Install-from-Disk and GitHub Release flow.
```

Shorter alternative:

```text
chore: publish source for community Install-from-Disk builds
```

Avoid: `chore: prepare open-source preview`（信息量低）、`update`、`wip`。

### Tag name & annotation

| Item | Convention |
|------|------------|
| **Tag name** | `v` + `pluginVersion` from `gradle.properties` → e.g. `v0.1.1` |
| **When to bump** | Same as zip: change `pluginVersion` + `CHANGELOG.md` before tagging |
| **Annotation subject** | `Auto Complete <version>` — short product line |
| **Annotation body** | What users get + how to install |

```bash
# after tests + buildPlugin
git tag -a v0.1.1 -m "$(cat <<'EOF'
Auto Complete 0.1.1

First public source release of the JetBrains inline AI completion plugin.
Distribute the zip via Install Plugin from Disk (Marketplace optional).

Artifact: plugin/build/distributions/auto-complete-0.1.1.zip
EOF
)"

git push origin v0.1.1
```

GitHub Release title suggestion: **`0.1.1`** or **`Auto Complete 0.1.1`**  
Release notes: paste the matching section from `CHANGELOG.md`.

## Optional later

| Item | Notes |
|------|--------|
| JetBrains Marketplace | See `docs/RELEASE.md` — token via env only |
| Plugin signing | `signPlugin` with secrets in CI |
| Screenshots | README / Marketplace listing |
| Code of Conduct | Add if the community grows |
| Dependabot | Gradle / GitHub Actions |

## What we still intentionally skip

- Automatic Marketplace publish from CI  
- Requiring pluginVerifier green on every IDE build as a hard merge gate (can add later)  
- Bundling third-party model weights or API keys  

## Attribution

Behavioral references: Kilo Code classic autocomplete (see `NOTICE`, `docs/SOURCES.md`). This is an independent JetBrains reimplementation.

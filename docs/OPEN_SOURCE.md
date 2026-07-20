# Open-source publishing readiness

[中文](OPEN_SOURCE.zh.md) · [Documentation index](README.en.md)

The repository already has the baseline pieces for an open-source preview: Apache-2.0 `LICENSE` / `NOTICE`, Chinese and English READMEs, contribution and security policies, CI, local JetBrains ZIP and VSIX packaging, and no Marketplace token in tracked build configuration.

## Current distribution boundary

- **JetBrains:** Install from Disk and GitHub Release ZIP; minimum 2024.2 / build 242.
- **VS Code:** local VSIX distribution; extension, TS engine, and Webview settings UI are in the tree.
- **Marketplace and signing:** optional; current CI does not automate either.
- **API keys:** stored only in PasswordSafe / SecretStorage and must never be committed.
- **Runtime:** the two hosts run independently; neither requires a VS Code host bridge, `kilo serve`, or Kilo Gateway.

## Pre-release checks

1. Ensure `git status` contains only intended files. Scan for `.env`, private endpoints, tokens, machine paths, and generated artifacts.
2. Review `LICENSE`, `NOTICE`, and attribution for every added third-party dependency or asset.
3. Run the JVM and Node tests, builds, and dual-host packaging in [RELEASE.en.md](RELEASE.en.md).
4. Verify the JCEF panel on JetBrains 2024.2 and a newer IDE; verify the VSIX on a supported VS Code version.
5. Verify privacy defaults: no profile/key must not leak data; exports have no secret; prompt-body logging remains off unless explicitly enabled.
6. Update READMEs, indexes, CHANGELOG, and version. Remove stale single-host, mandatory-JCEF-module, and 2500 ms-default-timeout statements.
7. Create a tag, push, or GitHub Release only with explicit release-owner approval.

## Recommended artifacts and names

| Host | Artifact | Recommended distribution |
|---|---|---|
| JetBrains | `apps/jetbrains/plugin/build/distributions/auto-complete-<version>.zip` | GitHub Release; Install from Disk |
| VS Code | `apps/vscode/extension/dist-vsix/auto-complete-<version>.vsix` | GitHub Release; Install from VSIX |

Use an annotated `v<version>` tag, for example:

```bash
git tag -a v0.1.1 -m "Auto Complete 0.1.1"
```

Release notes should come from the matching `CHANGELOG.md` section and include known host differences and installation paths. Do not claim that Marketplace publishing, signing, VSIX CI upload, or compatibility testing is automated when it is not.

## Optional next steps

- Marketplace listing, signing, and token management;
- a reproducible release workflow after end-to-end smoke tests are stable;
- screenshots, demos, and privacy documentation;
- Dependabot, a Code of Conduct, and more security-reporting channels;
- stronger cross-host parity tests, especially VS Code `.gitignore`, recent-file context, and comment/string detection.

Any release automation must keep secrets confined to CI and must not package user provider keys, model weights, or private logs.
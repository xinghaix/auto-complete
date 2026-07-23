# Security Policy

[中文](SECURITY.zh.md) · [English](SECURITY.md)

## Supported versions

Security fixes are accepted for the current `main` branch and the latest released tag. This is an open-source preview; do not infer support for untested historical packages.

## Reporting a vulnerability

Do **not** open a public issue for a security-sensitive report, including secret exposure, UiBridge/Webview/JCEF injection, provider-header handling, unsafe path filtering, or unexpected code-context transmission.

Use one of:

1. GitHub **Security Advisories** private reporting for this repository, if enabled; or
2. the maintainer contact listed on the repository/org profile.

Include the affected version or commit, host (JetBrains/VS Code), impact, minimal reproduction steps, relevant redacted logs, and whether you have a proposed fix. Never include a live API key or private source code unless a maintainer provides a secure channel.

## Secret and context handling

- API keys must be stored only in JetBrains PasswordSafe or VS Code SecretStorage.
- Keys, Authorization headers, and personal endpoints must not enter source, docs, fixtures, exported settings, CI logs, or issue comments.
- UiBridge snapshots expose `hasApiKey`, never the dedicated API key. They retain editable plaintext header fields only for local editing; portable exports omit `apiKey`, `hasApiKey`, `authHeaderTemplate`, and `extraHeadersJson`.
- Settings UI must not directly call provider HTTP. Probes go through the host and engine client.
- Completion sends trimmed prefix/suffix to user-configured endpoints. File paths are on by default; recent-open-file context and prompt-body logging are opt-in and disabled by default.
- PR CI may run without Marketplace/signing secrets (tests only). Release/main JetBrains ZIP artifacts require signing secrets and publish **signed** builds only — secrets stay in GitHub Actions, never in the repository.

## Scope notes

This project runs in two hosts. Please identify the host and IDE/extension version in reports. JetBrains networking follows IDE proxy/trust-store integration; VS Code uses its extension networking path. Provider data policies, TLS interception, endpoint access controls, and network egress policies remain the user's responsibility.

What settings can transmit: [docs/GUIDE.en.md](docs/GUIDE.en.md) (privacy + settings sections).
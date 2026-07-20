# Security Policy

[中文 README](README.md) · [English README](README.en.md)

## Supported versions

Security fixes are accepted against the latest `main` branch and the most recent release tag.

## Reporting a vulnerability

Please **do not** open a public issue for security-sensitive reports (e.g. secret leakage, auth header handling, path traversal in ignore rules).

Prefer one of:

1. GitHub **Security Advisories** (private report) on this repository, if enabled  
2. Contact the maintainers via the email listed on the GitHub org/profile page  

Include:

- Affected version / commit  
- Impact and reproduction steps  
- Whether a fix is already proposed  

## Safe handling of secrets

- User API keys must remain in PasswordSafe (or equivalent secure storage)  
- Never commit real tokens, keys, or personal endpoints into the repo  
- CI must not require Marketplace or signing secrets for open-source PR builds  

## Scope notes

This plugin sends code context (prefix/suffix, optional path) to **user-configured** endpoints. Review your provider’s data policies. Logging of full prompts is opt-in and disabled by default.

# @auto-complete/shared-spec

[English](README.md) · [中文](README.zh.md)

Disk path: `packages/completion/contracts` · npm package name: `@auto-complete/shared-spec`.

Shared behavioural contracts and test data for the Kotlin JetBrains engine, TypeScript VS Code engine, and shared Web settings UI. This package does **not** mean every engine dynamically loads every JSON file at runtime; implementation changes still require review on both sides. TypeScript golden tests under `packages/completion/engine-ts/test` read `testdata/**` from this directory; the Kotlin engine keeps parallel unit tests rather than loading every JSON fixture at runtime.

| File/directory | Purpose |
|---|---|
| `settings.schema.json` | JSON Schema for cross-host settings/profiles; secrets must not appear in snapshot/export |
| `defaults.json` | Default settings document matching the schema |
| `templates.json` | FIM/chat templates, wire formats, stop tokens, and model-name detection rules |
| `language-map.json` | Extension/alias → language-id mapping |
| `bridge-protocol.md` | UiBridge messages and security rules between settings UI and host |
| `testdata/**` | Golden fixtures for HTTP parsing, prompt budgets, and cache matching |

When changing a settings key, template, language rule, or shared behaviour:

1. update the contract/fixture here when it belongs to shared semantics;
2. update Kotlin `packages/completion/engine-jvm` (Gradle `:core`) and TypeScript `packages/completion/engine-ts` (npm `@auto-complete/core-ts`), or explicitly document an intentional difference;
3. run relevant tests for both sides;
4. update user docs, especially `docs/SETTINGS*`, `docs/PROVIDERS*`, and `docs/IMPLEMENTATION_STATUS*`.

Security boundary: fixtures, defaults, schema examples, and bridge payloads must never contain an API key, plaintext Authorization header, real private endpoint, or user code.
# @auto-complete/shared-spec

[中文](README.zh.md)

Path: `packages/completion/contracts` · npm: `@auto-complete/shared-spec`

Shared **rules and fixtures** for both engines and the settings UI. Not “every JSON is loaded at runtime” — implementations still change on both sides.

| Item | Role |
|---|---|
| `settings.schema.json` | Settings shape (no secrets in export) |
| `defaults.json` | Default sample |
| `templates.json` | Templates & model-name hints |
| `language-map.json` | Language ids |
| `bridge-protocol.md` | Settings UI ↔ host messages |
| `testdata/**` | HTTP / prompt / cache samples |

When shared semantics change: update here → both engines → tests → `docs/GUIDE` when user-visible.

**Never** put real keys, auth headers, private endpoints, or user code in samples.

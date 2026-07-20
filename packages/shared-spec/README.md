# @auto-complete/shared-spec

Shared contracts for the dual-engine (Kotlin `core` + TypeScript `core-ts`) and shared Web settings UI.

| File | Purpose |
|------|---------|
| `settings.schema.json` | Profiles + global settings JSON Schema |
| `defaults.json` | Default document matching schema |
| `templates.json` | Prompt templates, wire formats, detection rules |
| `language-map.json` | Extension / alias → language id |
| `bridge-protocol.md` | UiBridge message table + security rules |
| `testdata/**` | Golden fixtures for HTTP parse, prompt budget, cache |

Both engines and hosts must treat this package as the source of truth for keys and defaults.
Change fixtures only with dual-engine tests green.

# Sources, attribution, and boundaries

[中文](SOURCES.md) · [Documentation index](README.en.md)

## Project relationship

Auto Complete is an independent dual-host inline-completion project. It uses open-source [Kilo Code / kilocode](https://github.com/Kilo-Org/kilocode) and [kilocode-legacy](https://github.com/Kilo-Org/kilocode-legacy) as references for classic completion behaviour and design, then reimplements that behaviour in this repository in Kotlin/JVM and TypeScript.

The current tree is not “JetBrains shipped, VS Code planned”: it contains JetBrains `plugin` plus Kotlin `core`, VS Code `hosts/vscode` plus `packages/core-ts`, shared `packages/settings-ui`, and `packages/shared-spec`. The hosts do not call each other through an Extension Host, RPC, or `kilo serve`.

## Reference use

| Reference | Use | Treatment here |
|---|---|---|
| `kilocode-legacy` v5.16.2 | Classic autocomplete cache, skip, FIM, filter, and lifecycle behaviour | Lock intended behaviour with tests/specs, then rewrite; do not carry its JetBrains→VS Code RPC |
| Current `kilocode` monorepo | Error backoff, modern FIM routing, and product-evolution reference | Borrow behaviour only; no agent runtime, gateway account system, or CLI service |
| Public completion ideas from projects such as Continue | Algorithm/protocol reference only when needed | Confirm licence and attribution before writing an independent implementation |

The historical v5 JetBrains shell sent complete documents through RPC to a VS Code extension host. That topology is explicitly rejected here: both current engines make in-process HTTP requests and `PromptBuilder` budgets prefix/suffix before transmission.

## Current implementation map

| Behaviour | Kotlin/JVM | TypeScript |
|---|---|---|
| Main pipeline | `core/.../engine/CompletionEngine.kt` | `packages/core-ts/src/engine.ts` |
| HTTP and templates | `core/.../client/HttpCompletionClient.kt` | `packages/core-ts/src/httpClient.ts` |
| Cache / skip / filter | `core/.../{cache,skip,filter}/` | `packages/core-ts/src/{cache,contextualSkip,suggestionFilter}.ts` |
| Prompt and language map | `core/.../prompt/`, `util/LanguageMap.kt` | `packages/core-ts/src/prompt*`, `languageMap.ts` |
| JetBrains host | `plugin/.../ide`, `bridge`, `config`, `ui` | — |
| VS Code host | — | `hosts/vscode/src/` |
| Shared contract | `packages/shared-spec/`: schema, templates, language map, UiBridge, fixtures | same |

`shared-spec` is a cross-host documentation/fixture contract. When changing completion behaviour, templates, or settings keys, review both host implementations and fixture tests; do not assume every JSON file is automatically loaded at runtime.

## Explicit non-goals

The current product boundary excludes:

- a VS Code Extension Host supplying JetBrains completion;
- `kilo serve` or Kilo Gateway as a runtime dependency;
- Kilo login, balance, device-flow, or OAuth account systems;
- Agent, Next Edit, repository retrieval, or default heavy multi-file context;
- upstream private paths, secrets, brand assets, or code under unreviewed terms.

## Licence and contribution requirements

This repository uses Apache-2.0 ([LICENSE](../LICENSE)) and retains [NOTICE](../NOTICE). An upstream reference is not permission to copy: contributors must confirm the licence and attribution for any reused code, fixture, copy, or asset, and place required notices in NOTICE or an appropriate third-party notice.

When adding work:

1. State the behaviour as a testable requirement of this repository, not “copy upstream implementation”.
2. Prefer a minimal independent implementation and tests; do not copy agent/extension-host infrastructure.
3. Complete licence review and attribution before adding third-party constrained code.
4. Keep API keys, personal endpoints, and machine paths out of source, documentation, fixtures, and log samples.
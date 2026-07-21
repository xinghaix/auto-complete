# Sources and attribution

[中文](SOURCES.md) · [Docs index](README.en.md)

## Relation to Kilo

Auto Complete is **independent**. It draws on classic inline-completion behaviour from open-source [Kilo Code](https://github.com/Kilo-Org/kilocode) / [kilocode-legacy](https://github.com/Kilo-Org/kilocode-legacy), reimplemented here in Kotlin and TypeScript.

This repo already ships JetBrains + VS Code hosts, both engines, and shared settings UI. Hosts do not call each other via Extension Host or `kilo serve`.

## What was referenced

| Source | Use | Here |
|---|---|---|
| kilocode-legacy classic autocomplete | cache, skip, FIM, filter behaviour | Spec + rewrite; no JB→VS Code RPC |
| current kilocode monorepo | backoff, routing ideas | Behaviour only; no agent/gateway accounts |
| other public completion material | occasional protocol ideas | Licence check first |

Whole-file-over-RPC topologies are explicitly **not** used.

## Code map

| Area | Kotlin | TypeScript |
|---|---|---|
| Pipeline | `CompletionEngine.kt` | `engine.ts` |
| HTTP / templates | `HttpCompletionClient.kt` | `httpClient.ts` |
| Cache / skip / filter | matching packages | matching modules |
| Hosts | `apps/jetbrains/plugin` | `apps/vscode/extension` |
| Contracts | `packages/completion/contracts` | same |

Change shared behaviour on both sides + fixtures.

## Not ported

VS Code host for JetBrains; `kilo serve` / Gateway; Kilo accounts; Agent / Next Edit / default full-repo context; private upstream assets or unlicensed copies.

## Licence

Apache-2.0 + [NOTICE](../NOTICE). Reference ≠ copy. Contributions: testable requirements, minimal independent code, licence review, no secrets/private endpoints/home paths in the tree.

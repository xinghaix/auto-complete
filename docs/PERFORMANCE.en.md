# Performance and hot path

[中文](PERFORMANCE.md) · [Documentation index](README.en.md)

Inline completion runs on the typing hot path. The priority is to avoid interrupting editing, discard low-value work early, and never let old output overwrite a new cursor state—not to maximize context or wait indefinitely for a model.

## Current default budgets

| Item | Current default/limit | Code source |
|---|---:|---|
| Automatic debounce | `150 / 300 / 1000 ms` (min/initial/max) | `EngineSettings` / core-ts types |
| Completion hard timeout | `3000 ms`, `500..30000` | `ProviderConfig` |
| Settings-probe hard timeout | `15000 ms`, `1000..120000` | `ProviderConfig` |
| Output limit | `128 tokens`, `16..1024` | profile settings |
| Prefix / suffix budget | `8000 / 2000` characters | `PromptBuilder` settings |
| Maximum file | `512 KB` | engine gate |
| Global in-flight requests | `1` | `maxInFlight` |
| Suggestion history / prompt LRU | `20 / 64` | engine cache |
| In-memory logs | `1000` entries | `LogBuffer` |
| Recent-file context | disabled; `3 × 1200` chars when enabled | project-context settings |

These are implementation defaults, not an end-to-end SLA. Model latency, network, proxying, and endpoint queueing are outside this project.

## Pre-request gates

Before debounce and HTTP, `CompletionEngine` checks:

1. master switch, automatic trigger, and JetBrains snooze;
2. disabled language, comment/string hints, and file-size limit;
3. **JetBrains** `.gitignore` and extra globs; VS Code currently injects only extra globs into its engine;
4. validation and whether an active profile is usable;
5. suggestion-history hit;
6. contextual skip rules;
7. whether error backoff blocks a request.

A gate or cache hit avoids network work. Manual trigger may skip automatic debounce, but it still passes size, ignore, configuration, and response-filtering checks.

## Cancellation, generation, and concurrency

Every trigger has an increasing `generation` and a cancellable token.

- A new request cancels the previous task in the same path scope.
- A response is discarded if its token is cancelled or its generation is stale.
- At `maxInFlight`, the engine cancels another in-flight scope instead of creating an unbounded queue.
- HTTP cancellation is wired to the JVM `sendAsync` future and the TS `AbortController` path.
- Cancellation caused by more typing is normal: it is debug-logged, not surfaced as an error.

This prevents ghost-text rollback and request buildup. Do not change cancellation into “wait for the old request, then compare”; resources must be released early.

## Context and cache

`PromptBuilder` keeps prefix/suffix nearest the cursor and applies character budgets. File path inclusion is on by default; recent-open-file snippets are off by default. JetBrains creates a snapshot from the current document, but outgoing text is trimmed before sending—this is not a default whole-file upload.

There are two cache layers:

- suggestion history matches exact, continued-typing, and backspace cases;
- prompt LRU keys language, model, and trimmed prompt.

A hit still goes through `SuggestionFilter` to avoid duplicate text and inappropriate multiline text at a mid-line cursor.

## Error backoff

| Class | Examples | Behaviour |
|---|---|---|
| Cancellation | typing continues, host cancellation | Silent; not a failure |
| Fatal | 401/403 | Block later completion until settings change/reset; may notify |
| Retriable | 429, 5xx, transport/timeout error | Back off before later requests; log |
| Empty | 2xx empty/filtered response | Do not render; retain diagnostics |

A settings change reloads caches and refreshes status. After changing an endpoint, template, or key, use a connection probe rather than repeatedly failing on the editor hot path.

## Logs and verification

For performance diagnosis, inspect:

- `latencyMs`, HTTP status, cache hits, and response length;
- cancellation rate and stale-response drops;
- gate/skip reason and model/template probe results;
- the shared log stream in JetBrains `idea.log` or the VS Code OutputChannel.

Suggested checks:

1. While typing continuously, confirm an old request in the same file cannot write back.
2. Files exceeding `maxFileSizeKb` or matching ignore rules produce no network log.
3. After a 401, typing must not create an HTTP request for every keystroke.
4. Use a fake HTTP server to confirm a cancelled request never renders.
5. Validate path and parsing separately for FIM and chat templates.

Relevant tests/fixtures live in `core/src/test`, `plugin/src/test`, `packages/core-ts/test`, and `packages/settings-ui/src/*.test.ts`.
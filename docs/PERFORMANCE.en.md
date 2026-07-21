# Performance

[中文](PERFORMANCE.md) · [Docs index](README.en.md)

Inline completion sits on the **typing hot path**. Priorities:

1. Don’t block editing  
2. Drop useless work early  
3. Never paint stale ghost text  

Not “max context” or “wait for the model at all costs”.

## Default budgets (implementation defaults, not an SLA)

| Item | Default |
|---|---:|
| Debounce min / initial / max | 150 / 300 / 1000 ms |
| Completion timeout | 3000 ms (500–30000) |
| Settings probe timeout | 15000 ms |
| Max tokens | 128 (16–1024) |
| Prefix / suffix chars | 8000 / 2000 |
| Max file size | 512 KB |
| Max in-flight | 1 |
| Suggestion cache / prompt LRU | 20 / 64 |
| Log ring | 1000 |
| Recent files | off (about 3×1200 chars when on) |

Model latency, proxies, and server queues are outside this plugin.

## Gates before HTTP

Enable → auto/snooze → language → comment/string → size → ignore → invalid config → cache hit → skip rules → backoff.

Manual trigger can skip auto-debounce but still runs safety gates.

## Cancel & concurrency

New work cancels same-file work; stale generations are dropped; at max in-flight another scope is cancelled; cancel-on-type is normal (debug log only).

## Context & cache

Only near-cursor text. Path optional; recent files off by default. Two local caches; filter still runs on hits.

## Errors

Cancel silent; 401/403 fatal; 429/5xx/timeout retriable; empty body no suggestion. Probe after config changes.

## What to watch

Latency, status, cache hits, cancel rate. No flash-back while typing; oversized/ignored files should not hit the network. Tests live under engine and host packages.

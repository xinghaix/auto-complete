import type { CacheHit, CachedSuggestion } from "./types.js";

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_BACKWARD_DELETION_CHARS = 32;
const MAX_STORED_PREFIX_CHARS = 4096;
const MAX_STORED_SUFFIX_CHARS = 1024;

interface StoredSuggestion {
  suggestion: CachedSuggestion;
  prefixTruncated: boolean;
  createdAt: number;
}

export class SuggestionCache {
  private items: StoredSuggestion[] = [];

  constructor(
    private capacity = 20,
    private ttlMs = DEFAULT_TTL_MS,
    private clock: () => number = () => Date.now(),
  ) {}

  clear(): void {
    this.items = [];
  }

  put(suggestion: CachedSuggestion): void {
    if (!suggestion.text) return;
    this.evictExpired();
    const prefixTruncated = suggestion.prefix.length > MAX_STORED_PREFIX_CHARS;
    const stored: CachedSuggestion = {
      scope: suggestion.scope,
      prefix: prefixTruncated
        ? suggestion.prefix.slice(-MAX_STORED_PREFIX_CHARS)
        : suggestion.prefix,
      suffix:
        suggestion.suffix.length > MAX_STORED_SUFFIX_CHARS
          ? suggestion.suffix.slice(0, MAX_STORED_SUFFIX_CHARS)
          : suggestion.suffix,
      text: suggestion.text,
    };
    const duplicate = this.items.some(
      (it) =>
        it.suggestion.scope === stored.scope &&
        it.suggestion.prefix === stored.prefix &&
        it.suggestion.suffix === stored.suffix &&
        it.suggestion.text === stored.text,
    );
    if (duplicate) return;
    this.items.unshift({
      suggestion: stored,
      prefixTruncated,
      createdAt: this.clock(),
    });
    const cap = Math.max(1, this.capacity);
    while (this.items.length > cap) this.items.pop();
  }

  find(scope: string, prefix: string, suffix: string): CacheHit | null {
    this.evictExpired();
    const normPrefix =
      prefix.length > MAX_STORED_PREFIX_CHARS ? prefix.slice(-MAX_STORED_PREFIX_CHARS) : prefix;
    const normSuffix =
      suffix.length > MAX_STORED_SUFFIX_CHARS ? suffix.slice(0, MAX_STORED_SUFFIX_CHARS) : suffix;

    for (const entry of this.items) {
      const item = entry.suggestion;
      if (item.scope !== scope) continue;
      if (normSuffix !== item.suffix) continue;

      if (normPrefix === item.prefix) {
        return { text: item.text, match: "EXACT", source: item };
      }

      if (item.text) {
        // PARTIAL_TYPING
        if (!entry.prefixTruncated && prefix.startsWith(item.prefix)) {
          const typed = prefix.slice(item.prefix.length);
          if (item.text.startsWith(typed)) {
            const rest = item.text.slice(typed.length);
            if (rest) return { text: rest, match: "PARTIAL_TYPING", source: item };
          }
        } else if (entry.prefixTruncated) {
          const minIdx = Math.max(0, prefix.length - item.prefix.length - item.text.length);
          const idx = prefix.lastIndexOf(item.prefix);
          if (idx >= minIdx && idx + item.prefix.length < prefix.length) {
            const typed = prefix.slice(idx + item.prefix.length);
            if (item.text.startsWith(typed)) {
              const rest = item.text.slice(typed.length);
              if (rest) return { text: rest, match: "PARTIAL_TYPING", source: item };
            }
          }
        }

        // BACKWARD_DELETION (capped <= 32 chars and no newline)
        if (!entry.prefixTruncated && item.prefix.startsWith(prefix)) {
          const deleted = item.prefix.slice(prefix.length);
          if (
            deleted.length > 0 &&
            deleted.length <= MAX_BACKWARD_DELETION_CHARS &&
            !deleted.includes("\n")
          ) {
            return { text: deleted + item.text, match: "BACKWARD_DELETION", source: item };
          }
        } else if (entry.prefixTruncated) {
          const maxDel = Math.min(MAX_BACKWARD_DELETION_CHARS, item.prefix.length - 1);
          for (let d = 1; d <= maxDel; d++) {
            const deleted = item.prefix.slice(item.prefix.length - d);
            if (deleted.includes("\n")) break;
            const remaining = item.prefix.slice(0, item.prefix.length - d);
            if (prefix.endsWith(remaining)) {
              return { text: deleted + item.text, match: "BACKWARD_DELETION", source: item };
            }
          }
        }
      }
    }
    return null;
  }

  size(): number {
    this.evictExpired();
    return this.items.length;
  }

  private evictExpired(): void {
    if (this.ttlMs <= 0) return;
    const now = this.clock();
    this.items = this.items.filter((entry) => now - entry.createdAt <= this.ttlMs);
  }
}

interface LruEntry {
  value: string;
  createdAt: number;
}

export class PromptLruCache {
  private map = new Map<string, LruEntry>();

  constructor(
    private capacity = 64,
    private ttlMs = DEFAULT_TTL_MS,
    private clock: () => number = () => Date.now(),
  ) {}

  get(key: string): string | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (this.ttlMs > 0 && this.clock() - entry.createdAt > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    // refresh LRU order
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  put(key: string, value: string): void {
    if (!value || this.capacity <= 0) return;
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, createdAt: this.clock() });
    while (this.map.size > this.capacity) {
      const first = this.map.keys().next().value as string | undefined;
      if (first === undefined) break;
      this.map.delete(first);
    }
  }

  clear(): void {
    this.map.clear();
  }

  size(): number {
    if (this.ttlMs > 0) {
      const now = this.clock();
      for (const [k, v] of this.map.entries()) {
        if (now - v.createdAt > this.ttlMs) this.map.delete(k);
      }
    }
    return this.map.size;
  }
}

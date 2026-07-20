import type { CacheHit, CachedSuggestion } from "./types.js";

export class SuggestionCache {
  private items: CachedSuggestion[] = [];

  constructor(private capacity = 20) {}

  clear(): void {
    this.items = [];
  }

  put(suggestion: CachedSuggestion): void {
    if (!suggestion.text) return;
    const duplicate = this.items.some(
      (it) =>
        it.scope === suggestion.scope &&
        it.prefix === suggestion.prefix &&
        it.suffix === suggestion.suffix &&
        it.text === suggestion.text,
    );
    if (duplicate) return;
    this.items.unshift(suggestion);
    const cap = Math.max(1, this.capacity);
    while (this.items.length > cap) this.items.pop();
  }

  find(scope: string, prefix: string, suffix: string): CacheHit | null {
    for (const item of this.items) {
      if (item.scope !== scope) continue;
      if (prefix === item.prefix && suffix === item.suffix) {
        return { text: item.text, match: "EXACT", source: item };
      }
      if (item.text && prefix.startsWith(item.prefix) && suffix === item.suffix) {
        const typed = prefix.slice(item.prefix.length);
        if (item.text.startsWith(typed)) {
          const rest = item.text.slice(typed.length);
          if (rest) return { text: rest, match: "PARTIAL_TYPING", source: item };
        }
      }
      if (item.text && item.prefix.startsWith(prefix) && suffix === item.suffix) {
        const deleted = item.prefix.slice(prefix.length);
        if (deleted) {
          return { text: deleted + item.text, match: "BACKWARD_DELETION", source: item };
        }
      }
    }
    return null;
  }

  size(): number {
    return this.items.length;
  }
}

export class PromptLruCache {
  private map = new Map<string, string>();

  constructor(private capacity = 64) {}

  get(key: string): string | undefined {
    const v = this.map.get(key);
    if (v === undefined) return undefined;
    // refresh LRU order
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }

  put(key: string, value: string): void {
    if (!value || this.capacity <= 0) return;
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
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
    return this.map.size;
  }
}

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const ORDER: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

export function parseLogLevel(value: string): LogLevel {
  const u = value.trim().toUpperCase();
  if (u === "DEBUG" || u === "INFO" || u === "WARN" || u === "ERROR") return u;
  return "INFO";
}

export function isEnabledBy(level: LogLevel, configured: string): boolean {
  return ORDER[level] >= ORDER[parseLogLevel(configured)];
}

export interface LogEntry {
  time: string;
  level: LogLevel;
  requestId?: string;
  file?: string;
  trigger?: string;
  cacheHit?: boolean;
  latencyMs?: number | null;
  status?: number | null;
  error?: string;
  prefixChars?: number | null;
  suffixChars?: number | null;
  operation?: string;
  method?: string;
  url?: string;
  model?: string;
  requestStyle?: string;
  responseChars?: number | null;
  message?: string;
}

export function formatLogSummary(entry: LogEntry): string {
  const bits: string[] = [entry.level];
  if (entry.requestId) bits.push(`id=${entry.requestId}`);
  if (entry.file) bits.push(entry.file.split("/").pop() ?? entry.file);
  if (entry.trigger) bits.push(entry.trigger);
  if (entry.operation) bits.push(`op=${entry.operation}`);
  if (entry.method) bits.push(entry.method);
  if (entry.url) bits.push(entry.url);
  if (entry.model) bits.push(`model=${entry.model}`);
  if (entry.requestStyle) bits.push(`style=${entry.requestStyle}`);
  if (entry.cacheHit) bits.push("cache");
  if (entry.latencyMs != null) bits.push(`${entry.latencyMs}ms`);
  if (entry.status != null) bits.push(`http=${entry.status}`);
  if (entry.responseChars != null) bits.push(`responseChars=${entry.responseChars}`);
  if (entry.error) bits.push(entry.error);
  if (entry.message) bits.push(entry.message);
  return `${entry.time} ${bits.join(" ")}`;
}

export class LogBuffer {
  static readonly DEFAULT_RETENTION = 1000;
  static readonly MIN_RETENTION = 50;
  static readonly MAX_RETENTION = 10_000;

  private entries: LogEntry[] = [];
  private listeners = new Set<(e: LogEntry) => void>();
  private retention: number;

  constructor(retention = LogBuffer.DEFAULT_RETENTION) {
    this.retention = clampRetention(retention);
  }

  setRetention(n: number): void {
    this.retention = clampRetention(n);
    this.trim();
  }

  getRetention(): number {
    return this.retention;
  }

  append(entry: LogEntry): void {
    this.entries.push(entry);
    this.trim();
    for (const l of this.listeners) {
      try {
        l(entry);
      } catch {
        /* ignore */
      }
    }
  }

  appendIfEnabled(entry: LogEntry, configuredLevel: string): void {
    if (isEnabledBy(entry.level, configuredLevel)) this.append(entry);
  }

  clear(): void {
    this.entries = [];
  }

  snapshot(): LogEntry[] {
    return [...this.entries];
  }

  addListener(listener: (e: LogEntry) => void): void {
    this.listeners.add(listener);
  }

  removeListener(listener: (e: LogEntry) => void): void {
    this.listeners.delete(listener);
  }

  private trim(): void {
    while (this.entries.length > this.retention) this.entries.shift();
  }
}

function clampRetention(n: number): number {
  return Math.min(LogBuffer.MAX_RETENTION, Math.max(LogBuffer.MIN_RETENTION, n));
}

import type { ErrorKind } from "./types.js";

export class HttpStatusError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpStatusError";
  }
}

export class CancelledError extends Error {
  constructor(message = "cancelled") {
    super(message);
    this.name = "CancelledError";
  }
}

export class CancellationToken {
  private cancelled = false;
  private onCancelCb: (() => void) | null = null;

  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    const cb = this.onCancelCb;
    this.onCancelCb = null;
    cb?.();
  }

  isCancelled(): boolean {
    return this.cancelled;
  }

  throwIfCancelled(): void {
    if (this.cancelled) throw new CancelledError();
  }

  onCancel(action: () => void): void {
    this.onCancelCb = action;
    if (this.cancelled) {
      this.onCancelCb = null;
      action();
    }
  }
}

export class ErrorBackoff {
  private fatal = false;
  private fatalStatus: number | null = null;
  private fatalAt = 0;
  private opened = 0;
  private failures = 0;
  private blockedUntil = 0;

  constructor(
    private baseDelayMs = 2_000,
    private maxDelayMs = 120_000,
    private circuitThreshold = 5,
    private circuitCooldownMs = 300_000,
    private fatalProbeIntervalMs = 300_000,
    private clock: () => number = () => Date.now(),
  ) {}

  success(): void {
    this.fatal = false;
    this.fatalStatus = null;
    this.fatalAt = 0;
    this.opened = 0;
    this.failures = 0;
    this.blockedUntil = 0;
  }

  reset(): void {
    this.success();
  }

  failure(error: unknown, status?: number | null): ErrorKind {
    const code = status ?? extractStatus(error);
    const kind = classify(code, error);
    switch (kind) {
      case "FATAL":
        this.fatal = true;
        this.fatalStatus = code ?? null;
        this.fatalAt = this.clock();
        break;
      case "RETRIABLE": {
        this.failures++;
        const exp = this.baseDelayMs * 2 ** Math.min(this.failures - 1, 16);
        const delay = Math.min(exp, this.maxDelayMs);
        this.blockedUntil = this.clock() + delay;
        if (this.failures >= this.circuitThreshold && this.opened === 0) {
          this.opened = this.clock();
        }
        break;
      }
      default:
        break;
    }
    return kind;
  }

  blocked(): boolean {
    if (this.fatal) return true;
    const now = this.clock();
    if (this.opened > 0) {
      if (now - this.opened < this.circuitCooldownMs) return true;
      this.opened = 0;
      this.failures = 0;
      this.blockedUntil = 0;
      return false;
    }
    if (this.blockedUntil > 0 && now < this.blockedUntil) return true;
    return false;
  }

  getFatalStatus(): number | null {
    return this.fatal ? this.fatalStatus : null;
  }

  shouldProbe(): boolean {
    if (!this.fatal) return false;
    const now = this.clock();
    if (now - this.fatalAt < this.fatalProbeIntervalMs) return false;
    this.fatalAt = now;
    return true;
  }
}

export function extractStatus(error: unknown): number | null {
  if (!error) return null;
  if (error instanceof HttpStatusError) return error.status;
  const msg = error instanceof Error ? error.message : String(error);
  const match = /:\s*([45]\d{2})\b/.exec(msg);
  return match ? Number(match[1]) : null;
}

export function classify(status: number | null | undefined, error?: unknown): ErrorKind {
  if (error instanceof CancelledError) return "CANCEL";
  const msg = error instanceof Error ? error.message : String(error ?? "");
  if (msg.toLowerCase().includes("cancel")) return "CANCEL";
  const code = status ?? extractStatus(error);
  if (code === 401 || code === 402 || code === 403) return "FATAL";
  if (code === 429) return "RETRIABLE";
  if (code != null && code >= 500 && code <= 599) return "RETRIABLE";
  if (code == null) return "TRANSIENT";
  return "TRANSIENT";
}

import { PromptLruCache, SuggestionCache } from "./cache.js";
import { shouldSkip } from "./contextualSkip.js";
import { Debouncer, normalizeDebounceBounds } from "./debouncer.js";
import {
  CancellationToken,
  CancelledError,
  ErrorBackoff,
  HttpStatusError,
} from "./errorBackoff.js";
import { HttpCompletionClient, type CompletionClient } from "./httpClient.js";
import { IgnoreRules } from "./ignoreRules.js";
import { formatLogSummary, LogBuffer, type LogEntry, type LogLevel } from "./logBuffer.js";
import { buildPrompt, lruKey } from "./promptBuilder.js";
import { resolveTemplate } from "./promptTemplate.js";
import { isMidLine, postprocess, shouldShowOnlyFirstLine } from "./suggestionFilter.js";
import type {
  CachedSuggestion,
  CompletionOutcome,
  CompletionRequest,
  EngineSettings,
  ProviderConfig,
  RequestStyle,
  SessionStats,
} from "./types.js";
import { isEnabledNow } from "./types.js";

export type SettingsSource = () => EngineSettings;

export interface ProjectContextPort {
  gitignorePatterns(projectKey: string): string[];
  recentSnippets(
    projectKey: string,
    enabled: boolean,
    limit: number,
    maxChars: number,
  ): string[];
}

const emptyProjectContext: ProjectContextPort = {
  gitignorePatterns: () => [],
  recentSnippets: () => [],
};

interface Job {
  id: string;
  generation: number;
  token: CancellationToken;
  abort?: () => void;
}

/**
 * Core completion pipeline with cancelable async jobs (TypeScript dual of CompletionEngine).
 */
export class CompletionEngine {
  private generationCounter = 0;
  private globalGeneration = 0;
  private cancelAllFloor = -1;
  private scopeGenerations = new Map<string, number>();
  private inflight = new Map<string, Job>();
  private latencySamples: number[] = [];
  private debounceMs = Debouncer.INITIAL_MS;
  private history: SuggestionCache;
  private lru: PromptLruCache;
  private totalRequestsCount = 0;
  private cacheHitsCount = 0;
  private cancelledCount = 0;
  private failedCount = 0;
  private acceptedCount = 0;
  readonly backoff: ErrorBackoff;
  readonly logs: LogBuffer;

  constructor(
    private settings: SettingsSource,
    logs?: LogBuffer,
    private projectContexts: ProjectContextPort = emptyProjectContext,
    private clientFactory?: (cfg: ProviderConfig) => CompletionClient,
    private sleeper: (ms: number, token: CancellationToken) => Promise<void> = sleepCancelable,
    private onFatal?: (status: number | null, message: string) => void,
    backoff?: ErrorBackoff,
  ) {
    this.logs = logs ?? new LogBuffer();
    this.backoff = backoff ?? new ErrorBackoff();
    const s = settings();
    this.history = new SuggestionCache(s.cacheSize);
    this.lru = new PromptLruCache(s.lruSize);
    const { min, max } = normalizeDebounceBounds(s.debounceMinMs, s.debounceMaxMs);
    this.debounceMs = clamp(s.debounceInitialMs, min, max);
  }

  currentGeneration(scope?: string): number {
    if (scope !== undefined) {
      return Math.max(this.scopeGenerations.get(scope) ?? 0, this.globalGeneration);
    }
    return this.globalGeneration;
  }

  nextGeneration(scope?: string): number {
    const next = ++this.generationCounter;
    if (scope !== undefined) {
      this.scopeGenerations.set(scope, next);
    } else {
      this.globalGeneration = next;
    }
    return next;
  }

  resetBackoff(): void {
    this.backoff.reset();
  }

  clearCaches(): void {
    this.history.clear();
    this.lru.clear();
    this.backoff.reset();
  }

  reloadCaches(): void {
    const s = this.settings();
    this.history = new SuggestionCache(s.cacheSize);
    this.lru = new PromptLruCache(s.lruSize);
    this.backoff.reset();
    const { min, max } = normalizeDebounceBounds(s.debounceMinMs, s.debounceMaxMs);
    this.debounceMs = clamp(s.debounceInitialMs, min, max);
    this.logs.setRetention(s.logRetention);
  }

  recordAccepted(): void {
    this.acceptedCount += 1;
  }

  sessionStats(): SessionStats {
    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    return {
      totalRequests: this.totalRequestsCount,
      cacheHits: this.cacheHitsCount,
      cancelled: this.cancelledCount,
      failed: this.failedCount,
      accepted: this.acceptedCount,
      p50LatencyMs: percentile(sorted, 0.5),
      p95LatencyMs: percentile(sorted, 0.95),
      currentDebounceMs: this.debounceMs,
      backoffBlocked: this.backoff.blocked(),
      backoffFatal: this.backoff.isFatal(),
    };
  }

  async complete(
    request: CompletionRequest,
    options: { debounce?: boolean; token?: CancellationToken } = {},
  ): Promise<CompletionOutcome> {
    const debounce = options.debounce ?? request.trigger === "AUTO";
    const token = options.token ?? new CancellationToken();
    return this.completeSync(request, debounce, token);
  }

  async completeSync(
    request: CompletionRequest,
    debounce = request.trigger === "AUTO",
    token = new CancellationToken(),
  ): Promise<CompletionOutcome> {
    const s = this.settings();
    const logLevel = s.logLevel;
    if (!isEnabledNow(s)) {
      this.log("DEBUG", request, { message: "skip disabled or snoozed" }, logLevel);
      return { kind: "skipped" };
    }
    if (request.trigger === "AUTO" && !s.autoTrigger) {
      this.log("DEBUG", request, { message: "skip automatic trigger disabled" }, logLevel);
      return { kind: "skipped" };
    }
    const disabled = languageSet(s.disabledLanguages);
    if (disabled.has(request.language.toLowerCase())) {
      this.log("DEBUG", request, { message: `skip disabled language=${request.language}` }, logLevel);
      return { kind: "skipped" };
    }
    if (!s.enableInComments && request.context?.inComment) {
      this.log("DEBUG", request, { message: "skip comment" }, logLevel);
      return { kind: "skipped" };
    }
    if (!s.enableInStrings && request.context?.inString) {
      this.log("DEBUG", request, { message: "skip string" }, logLevel);
      return { kind: "skipped" };
    }
    const maxBytes = Math.max(1, s.maxFileSizeKb) * 1024;
    if ((request.fileSizeBytes ?? 0) > 0 && (request.fileSizeBytes ?? 0) > maxBytes) {
      this.log("DEBUG", request, { message: "skip oversized file" }, logLevel);
      return { kind: "skipped" };
    }
    const ignore = new IgnoreRules(
      s.ignoreGlobs ?? [],
      s.respectGitignore,
      this.projectContexts.gitignorePatterns(request.projectKey ?? ""),
    );
    if (request.path && ignore.isIgnored(request.path)) {
      this.log("DEBUG", request, { message: "skip ignored path" }, logLevel);
      return { kind: "skipped" };
    }
    if (s.validationErrors.length) {
      this.log("WARN", request, { message: "settings invalid" }, logLevel);
      return { kind: "skipped" };
    }

    const scope = request.path || "untitled";
    if (!request.forceRefresh) {
      const hit = this.history.find(scope, request.prefix, request.suffix);
      if (hit) {
        const firstOnly =
          s.firstLineOnlyWhenMidLine && shouldShowOnlyFirstLine(request.prefix, hit.text);
        const text = postprocess(hit.text, request.prefix, request.suffix, firstOnly);
        if (text) {
          this.totalRequestsCount += 1;
          this.cacheHitsCount += 1;
          this.log(
            "INFO",
            request,
            {
              cacheHit: true,
              latencyMs: 0,
              message: `cache ${hit.match.toLowerCase()}`,
            },
            logLevel,
          );
          return {
            kind: "success",
            response: {
              id: request.id,
              text,
              latencyMs: 0,
              cached: true,
              model: s.model,
              generation: request.generation,
            },
          };
        }
      }
    }

    if (
      request.trigger === "AUTO" &&
      shouldSkip(request.prefix, request.suffix, request.language)
    ) {
      this.log("DEBUG", request, { message: "contextual skip" }, logLevel);
      return { kind: "skipped" };
    }

    const prompt = buildPrompt({
      prefix: request.prefix,
      suffix: request.suffix,
      maxPrefixChars: s.maxPrefixChars,
      maxSuffixChars: s.maxSuffixChars,
      path: request.path,
      language: request.language,
      sendFilePath: s.sendFilePath,
      recentSnippets: this.projectContexts.recentSnippets(
        request.projectKey ?? "",
        s.enableRecentFileContext,
        s.recentFileLimit,
        s.recentFileMaxChars,
      ),
    });
    const effectiveTemplate = effectivePromptTemplate(s.providerConfig);
    const key = lruKey(request.language, s.model, prompt.prefix, prompt.suffix, {
      promptTemplate: effectiveTemplate,
      baseUrl: s.providerConfig.baseUrl,
      temperature: s.temperature,
      maxTokens: s.maxTokens,
      firstLineOnlyWhenMidLine: s.firstLineOnlyWhenMidLine,
    });

    // Check LRU cache BEFORE debounce so identical prompts return immediately at 0ms.
    if (!request.forceRefresh) {
      const lruHit = this.lru.get(key);
      if (lruHit) {
        const firstOnly =
          s.firstLineOnlyWhenMidLine && shouldShowOnlyFirstLine(request.prefix, lruHit);
        const text = postprocess(lruHit, request.prefix, request.suffix, firstOnly);
        if (text) {
          this.totalRequestsCount += 1;
          this.cacheHitsCount += 1;
          this.history.put({ scope, prefix: request.prefix, suffix: request.suffix, text });
          this.log("INFO", request, { cacheHit: true, latencyMs: 0, message: "lru hit" }, logLevel);
          return {
            kind: "success",
            response: {
              id: request.id,
              text,
              latencyMs: 0,
              cached: true,
              model: s.model,
              generation: request.generation,
            },
          };
        }
      }
    }

    if (this.backoff.blocked()) {
      const allowProbe = request.trigger === "MANUAL" || this.backoff.shouldProbe();
      if (!allowProbe) {
        this.log(
          "DEBUG",
          request,
          { message: `backoff blocked status=${this.backoff.getFatalStatus()}` },
          logLevel,
        );
        return { kind: "skipped" };
      }
      this.log(
        "DEBUG",
        request,
        { message: `backoff probe allowed trigger=${request.trigger}` },
        logLevel,
      );
    }

    this.totalRequestsCount += 1;

    if (debounce) {
      const { min, max } = normalizeDebounceBounds(s.debounceMinMs, s.debounceMaxMs);
      const delay = clamp(this.debounceMs, min, max);
      if (delay > 0) {
        try {
          await this.sleeper(delay, token);
        } catch (e) {
          if (e instanceof CancelledError) {
            this.cancelledCount += 1;
            return { kind: "cancelled" };
          }
          throw e;
        }
      }
      if (token.isCancelled() || this.isGenerationStale(scope, request.generation)) {
        this.cancelledCount += 1;
        return { kind: "cancelled" };
      }
    }

    const started = Date.now();
    try {
      token.throwIfCancelled();
      if (this.isGenerationStale(scope, request.generation)) {
        this.cancelledCount += 1;
        return { kind: "cancelled" };
      }

      if (s.logPromptBodies) {
        this.log(
          "DEBUG",
          request,
          {
            message: `prompt prefix=${prompt.prefix.slice(0, 200)} suffix=${prompt.suffix.slice(0, 80)}`,
            prefixChars: prompt.prefix.length,
            suffixChars: prompt.suffix.length,
          },
          logLevel,
        );
      }

      const providerConfig: ProviderConfig = {
        ...s.providerConfig,
        stream: s.stream,
      };
      const client =
        this.clientFactory?.(providerConfig) ??
        new HttpCompletionClient(providerConfig, "completion", (event) => {
          this.logHttp(request, event, logLevel);
        });

      const stopAtNewline = s.firstLineOnlyWhenMidLine && isMidLine(request.prefix);

      const providerResponse = await client.complete(
        {
          model: s.model,
          prefix: prompt.prefix,
          suffix: prompt.suffix,
          maxTokens: s.maxTokens,
          temperature: s.temperature,
          stream: s.stream,
          stopAtNewline,
          language: request.language,
          path: request.path,
        },
        token,
      );

      if (token.isCancelled() || this.isGenerationStale(scope, request.generation)) {
        this.cancelledCount += 1;
        return { kind: "cancelled" };
      }
      const latency = Date.now() - started;
      this.recordLatency(latency, s);
      this.backoff.success();

      const firstOnly =
        s.firstLineOnlyWhenMidLine &&
        shouldShowOnlyFirstLine(request.prefix, providerResponse.text);
      const text = postprocess(
        providerResponse.text,
        request.prefix,
        request.suffix,
        firstOnly,
      );
      if (!text) {
        this.log(
          "INFO",
          request,
          {
            latencyMs: latency,
            status: providerResponse.rawStatus,
            message: "empty after filter",
            prefixChars: prompt.prefix.length,
            suffixChars: prompt.suffix.length,
          },
          logLevel,
        );
        return { kind: "skipped" };
      }
      this.history.put({
        scope,
        prefix: request.prefix,
        suffix: request.suffix,
        text,
      } satisfies CachedSuggestion);
      this.lru.put(key, text);
      const costMsg = s.showCostApprox
        ? ` tokens=${providerResponse.usage?.inputTokens ?? 0}/${providerResponse.usage?.outputTokens ?? 0}`
        : "";
      this.log(
        "INFO",
        request,
        {
          latencyMs: latency,
          status: providerResponse.rawStatus,
          message: `ok model=${s.model}${costMsg}`,
          prefixChars: prompt.prefix.length,
          suffixChars: prompt.suffix.length,
        },
        logLevel,
      );
      return {
        kind: "success",
        response: {
          id: request.id,
          text,
          latencyMs: latency,
          cached: false,
          model: s.model,
          usage: providerResponse.usage,
          generation: request.generation,
        },
      };
    } catch (e) {
      if (
        e instanceof CancelledError ||
        token.isCancelled() ||
        this.isGenerationStale(scope, request.generation)
      ) {
        this.cancelledCount += 1;
        this.log("DEBUG", request, { message: "cancelled" }, logLevel);
        return { kind: "cancelled" };
      }
      this.failedCount += 1;
      const status = e instanceof HttpStatusError ? e.status : null;
      const kind = this.backoff.failure(e, status);
      this.log(
        kind === "FATAL" ? "ERROR" : "WARN",
        request,
        {
          status,
          error: e instanceof Error ? e.message : String(e),
          message: `fail kind=${kind}`,
        },
        logLevel,
      );
      if (kind === "FATAL" && s.notifyOnFatalError) {
        this.onFatal?.(status, e instanceof Error ? e.message : String(e));
      }
      return {
        kind: "failed",
        message: e instanceof Error ? e.message : String(e),
        status,
        errorKind: kind.toLowerCase(),
      };
    }
  }

  completeAsync(
    request: CompletionRequest,
    onDone: (outcome: CompletionOutcome) => void,
    debounce = request.trigger === "AUTO",
  ): void {
    const scope = request.path || "untitled";
    this.cancelScope(scope);

    const s = this.settings();
    const max = Math.max(1, s.maxInFlight);
    while (this.inflight.size >= max) {
      let evicted = false;
      for (const key of this.inflight.keys()) {
        if (key !== scope) {
          this.cancelScope(key);
          evicted = true;
          break;
        }
      }
      if (!evicted) break;
    }

    const token = new CancellationToken();
    const gen = request.generation === 0 ? this.nextGeneration(scope) : request.generation;
    const req = request.generation === gen ? request : { ...request, generation: gen };

    this.inflight.set(scope, { id: req.id, generation: req.generation, token });

    void (async () => {
      try {
        const outcome = await this.completeSync(req, debounce, token);
        if (!token.isCancelled() && !this.isGenerationStale(scope, req.generation)) {
          onDone(outcome);
        } else {
          if (outcome.kind !== "cancelled") this.cancelledCount += 1;
          onDone({ kind: "cancelled" });
        }
      } catch (e) {
        if (e instanceof CancelledError) onDone({ kind: "cancelled" });
        else onDone({ kind: "failed", message: e instanceof Error ? e.message : String(e) });
      } finally {
        const current = this.inflight.get(scope);
        if (current?.id === req.id) this.inflight.delete(scope);
      }
    })();
  }

  cancelAll(): void {
    const next = ++this.generationCounter;
    this.globalGeneration = next;
    this.cancelAllFloor = next;
    for (const scope of this.scopeGenerations.keys()) {
      this.scopeGenerations.set(scope, next);
    }
    for (const scope of [...this.inflight.keys()]) this.cancelScope(scope);
  }

  cancelScope(scope: string, expectedRequestId?: string): void {
    const job = this.inflight.get(scope);
    if (!job || (expectedRequestId && job.id !== expectedRequestId)) return;
    this.inflight.delete(scope);
    job.token.cancel();
    job.abort?.();
  }

  dispose(): void {
    this.cancelAll();
  }

  newRequestId(): string {
    return crypto.randomUUID();
  }

  private isGenerationStale(scope: string, gen: number): boolean {
    if (gen <= this.cancelAllFloor) return true;
    const expected = Math.max(this.scopeGenerations.get(scope) ?? 0, this.globalGeneration);
    return gen !== expected;
  }

  private recordLatency(ms: number, s: EngineSettings): void {
    this.latencySamples.push(ms);
    while (this.latencySamples.length > 50) this.latencySamples.shift();
    const { min, max } = normalizeDebounceBounds(s.debounceMinMs, s.debounceMaxMs);
    this.debounceMs = Debouncer.nextDelay(this.debounceMs, this.latencySamples, min, max);
  }

  private log(
    level: LogLevel,
    request: CompletionRequest,
    extra: Partial<LogEntry> = {},
    configuredLevel?: string,
  ): void {
    const entry: LogEntry = {
      time: new Date().toISOString(),
      level,
      requestId: request.id,
      file: request.path,
      trigger: request.trigger,
      ...extra,
    };
    this.logs.appendIfEnabled(entry, configuredLevel ?? this.settings().logLevel);
  }

  private logHttp(
    request: CompletionRequest,
    event: {
      level: LogLevel;
      operation: string;
      method: string;
      url: string;
      model?: string;
      requestStyle?: string;
      status?: number | null;
      latencyMs?: number | null;
      responseChars?: number | null;
      message?: string;
      error?: string;
    },
    configuredLevel?: string,
  ): void {
    this.logs.appendIfEnabled(
      {
        time: new Date().toISOString(),
        level: event.level,
        requestId: request.id,
        file: request.path,
        trigger: request.trigger,
        operation: event.operation,
        method: event.method,
        url: event.url,
        model: event.model,
        requestStyle: event.requestStyle,
        status: event.status,
        latencyMs: event.latencyMs,
        responseChars: event.responseChars,
        message: event.message,
        error: event.error,
      },
      configuredLevel ?? this.settings().logLevel,
    );
  }
}

function effectivePromptTemplate(cfg: ProviderConfig): string {
  let stored = cfg.promptTemplate ?? "AUTO";
  if (stored === "AUTO") {
    const style = (cfg.requestStyle ?? "AUTO") as RequestStyle;
    if (style === "FIM") stored = "CODESTRAL_API";
    else if (style === "CHAT") stored = "CHAT";
  }
  return resolveTemplate(stored, cfg.model, cfg.kind, cfg.baseUrl);
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[idx]!;
}

async function sleepCancelable(ms: number, token: CancellationToken): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    token.throwIfCancelled();
    const remain = end - Date.now();
    if (remain <= 0) break;
    await new Promise<void>((resolve, reject) => {
      let unsubscribe: (() => void) | null = null;
      const t = setTimeout(() => {
        unsubscribe?.();
        resolve();
      }, Math.min(20, remain));
      unsubscribe = token.onCancel(() => {
        clearTimeout(t);
        reject(new CancelledError());
      });
    });
  }
}

function languageSet(langs: Set<string> | string[]): Set<string> {
  if (langs instanceof Set) {
    return new Set([...langs].map((l) => l.toLowerCase()));
  }
  return new Set(langs.map((l) => l.toLowerCase()));
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export { formatLogSummary };

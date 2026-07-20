import { PromptLruCache, SuggestionCache } from "./cache.js";
import { shouldSkip } from "./contextualSkip.js";
import { Debouncer } from "./debouncer.js";
import {
  CancellationToken,
  CancelledError,
  ErrorBackoff,
  HttpStatusError,
} from "./errorBackoff.js";
import { HttpCompletionClient, type CompletionClient } from "./httpClient.js";
import { DEFAULT_GLOBS, IgnoreRules } from "./ignoreRules.js";
import { formatLogSummary, LogBuffer, type LogEntry, type LogLevel } from "./logBuffer.js";
import { buildPrompt, lruKey } from "./promptBuilder.js";
import { postprocess, shouldShowOnlyFirstLine } from "./suggestionFilter.js";
import type {
  CachedSuggestion,
  CompletionOutcome,
  CompletionRequest,
  EngineSettings,
  ProviderConfig,
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
  private generation = 0;
  private inflight = new Map<string, Job>();
  private globalInflight = 0;
  private latencySamples: number[] = [];
  private debounceMs = Debouncer.INITIAL_MS;
  private history: SuggestionCache;
  private lru: PromptLruCache;
  readonly backoff = new ErrorBackoff();
  readonly logs: LogBuffer;

  constructor(
    private settings: SettingsSource,
    logs?: LogBuffer,
    private projectContexts: ProjectContextPort = emptyProjectContext,
    private clientFactory?: (cfg: ProviderConfig) => CompletionClient,
    private sleeper: (ms: number, token: CancellationToken) => Promise<void> = sleepCancelable,
    private onFatal?: (status: number | null, message: string) => void,
  ) {
    this.logs = logs ?? new LogBuffer();
    const s = settings();
    this.history = new SuggestionCache(s.cacheSize);
    this.lru = new PromptLruCache(s.lruSize);
    this.debounceMs = clamp(
      s.debounceInitialMs,
      Debouncer.MIN_MS,
      Debouncer.MAX_MS,
    );
  }

  currentGeneration(): number {
    return this.generation;
  }

  nextGeneration(): number {
    this.generation += 1;
    return this.generation;
  }

  reloadCaches(): void {
    const s = this.settings();
    this.history = new SuggestionCache(s.cacheSize);
    this.lru = new PromptLruCache(s.lruSize);
    this.debounceMs = clamp(s.debounceInitialMs, Debouncer.MIN_MS, Debouncer.MAX_MS);
    this.logs.setRetention(s.logRetention);
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
    if (!isEnabledNow(s)) {
      this.log("DEBUG", request, { message: "skip disabled or snoozed" });
      return { kind: "skipped" };
    }
    if (request.trigger === "AUTO" && !s.autoTrigger) {
      this.log("DEBUG", request, { message: "skip automatic trigger disabled" });
      return { kind: "skipped" };
    }
    const disabled = languageSet(s.disabledLanguages);
    if (disabled.has(request.language.toLowerCase())) {
      this.log("DEBUG", request, { message: `skip disabled language=${request.language}` });
      return { kind: "skipped" };
    }
    if (!s.enableInComments && request.context?.inComment) {
      this.log("DEBUG", request, { message: "skip comment" });
      return { kind: "skipped" };
    }
    if (!s.enableInStrings && request.context?.inString) {
      this.log("DEBUG", request, { message: "skip string" });
      return { kind: "skipped" };
    }
    const maxBytes = Math.max(1, s.maxFileSizeKb) * 1024;
    if ((request.fileSizeBytes ?? 0) > 0 && (request.fileSizeBytes ?? 0) > maxBytes) {
      this.log("DEBUG", request, { message: "skip oversized file" });
      return { kind: "skipped" };
    }
    const ignore = new IgnoreRules(
      s.ignoreGlobs?.length ? s.ignoreGlobs : DEFAULT_GLOBS,
      s.respectGitignore,
      this.projectContexts.gitignorePatterns(request.projectKey ?? ""),
    );
    if (request.path && ignore.isIgnored(request.path)) {
      this.log("DEBUG", request, { message: "skip ignored path" });
      return { kind: "skipped" };
    }
    if (s.validationErrors.length) {
      this.log("WARN", request, { message: "settings invalid" });
      return { kind: "skipped" };
    }

    const scope = request.path || "untitled";
    const hit = this.history.find(scope, request.prefix, request.suffix);
    if (hit) {
      const firstOnly =
        s.firstLineOnlyWhenMidLine && shouldShowOnlyFirstLine(request.prefix, hit.text);
      const text = postprocess(hit.text, request.prefix, request.suffix, firstOnly);
      if (text) {
        this.log("INFO", request, {
          cacheHit: true,
          latencyMs: 0,
          message: `cache ${hit.match.toLowerCase()}`,
        });
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

    if (
      request.trigger === "AUTO" &&
      shouldSkip(request.prefix, request.suffix, request.language)
    ) {
      this.log("DEBUG", request, { message: "contextual skip" });
      return { kind: "skipped" };
    }

    if (this.backoff.blocked()) {
      this.log("DEBUG", request, {
        message: `backoff blocked status=${this.backoff.getFatalStatus()}`,
      });
      return { kind: "skipped" };
    }

    if (debounce) {
      const delay = clamp(
        this.debounceMs,
        Math.max(Debouncer.MIN_MS, s.debounceMinMs),
        Math.max(Debouncer.MIN_MS, s.debounceMaxMs),
      );
      try {
        await this.sleeper(delay, token);
      } catch (e) {
        if (e instanceof CancelledError) return { kind: "cancelled" };
        throw e;
      }
      if (token.isCancelled() || request.generation !== this.generation) {
        return { kind: "cancelled" };
      }
    }

    const started = Date.now();
    try {
      token.throwIfCancelled();
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
      if (s.logPromptBodies) {
        this.log("DEBUG", request, {
          message: `prompt prefix=${prompt.prefix.slice(0, 200)} suffix=${prompt.suffix.slice(0, 80)}`,
          prefixChars: prompt.prefix.length,
          suffixChars: prompt.suffix.length,
        });
      }
      const key = lruKey(request.language, s.model, prompt.prefix, prompt.suffix);
      const lruHit = this.lru.get(key);
      if (lruHit) {
        const firstOnly =
          s.firstLineOnlyWhenMidLine && shouldShowOnlyFirstLine(request.prefix, lruHit);
        const text = postprocess(lruHit, request.prefix, request.suffix, firstOnly);
        if (text) {
          this.history.put({ scope, prefix: request.prefix, suffix: request.suffix, text });
          this.log("INFO", request, { cacheHit: true, latencyMs: 0, message: "lru hit" });
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

      token.throwIfCancelled();
      if (request.generation !== this.generation) return { kind: "cancelled" };

      const providerConfig: ProviderConfig = {
        ...s.providerConfig,
        stream: s.stream,
      };
      const client =
        this.clientFactory?.(providerConfig) ??
        new HttpCompletionClient(providerConfig, "completion", (event) => {
          this.logHttp(request, event);
        });

      const providerResponse = await client.complete(
        {
          model: s.model,
          prefix: prompt.prefix,
          suffix: prompt.suffix,
          maxTokens: s.maxTokens,
          temperature: s.temperature,
          stream: s.stream,
          language: request.language,
          path: request.path,
        },
        token,
      );

      if (token.isCancelled() || request.generation !== this.generation) {
        return { kind: "cancelled" };
      }
      const latency = Date.now() - started;
      this.recordLatency(latency);
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
        this.log("INFO", request, {
          latencyMs: latency,
          status: providerResponse.rawStatus,
          message: "empty after filter",
          prefixChars: prompt.prefix.length,
          suffixChars: prompt.suffix.length,
        });
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
      this.log("INFO", request, {
        latencyMs: latency,
        status: providerResponse.rawStatus,
        message: `ok model=${s.model}${costMsg}`,
        prefixChars: prompt.prefix.length,
        suffixChars: prompt.suffix.length,
      });
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
      if (e instanceof CancelledError || token.isCancelled() || request.generation !== this.generation) {
        this.log("DEBUG", request, { message: "cancelled" });
        return { kind: "cancelled" };
      }
      const status = e instanceof HttpStatusError ? e.status : null;
      const kind = this.backoff.failure(e, status);
      this.log(kind === "FATAL" ? "ERROR" : "WARN", request, {
        status,
        error: e instanceof Error ? e.message : String(e),
        message: `fail kind=${kind}`,
      });
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
    if (this.globalInflight >= max) {
      for (const key of this.inflight.keys()) {
        if (key !== scope) {
          this.cancelScope(key);
          break;
        }
      }
    }

    const token = new CancellationToken();
    const gen = request.generation === 0 ? this.nextGeneration() : request.generation;
    const req = request.generation === gen ? request : { ...request, generation: gen };

    this.inflight.set(scope, { id: req.id, generation: req.generation, token });
    this.globalInflight += 1;

    void (async () => {
      try {
        const outcome = await this.completeSync(req, debounce, token);
        if (!token.isCancelled() && req.generation === this.generation) {
          onDone(outcome);
        } else {
          onDone({ kind: "cancelled" });
        }
      } catch (e) {
        if (e instanceof CancelledError) onDone({ kind: "cancelled" });
        else onDone({ kind: "failed", message: e instanceof Error ? e.message : String(e) });
      } finally {
        this.globalInflight = Math.max(0, this.globalInflight - 1);
        const current = this.inflight.get(scope);
        if (current?.id === req.id) this.inflight.delete(scope);
      }
    })();
  }

  cancelAll(): void {
    this.generation += 1;
    for (const scope of [...this.inflight.keys()]) this.cancelScope(scope);
  }

  cancelScope(scope: string): void {
    const job = this.inflight.get(scope);
    if (!job) return;
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

  private recordLatency(ms: number): void {
    this.latencySamples.push(ms);
    while (this.latencySamples.length > 50) this.latencySamples.shift();
    this.debounceMs = Debouncer.nextDelay(this.debounceMs, this.latencySamples);
    const s = this.settings();
    this.debounceMs = clamp(
      this.debounceMs,
      Math.max(Debouncer.MIN_MS, s.debounceMinMs),
      Math.max(Debouncer.MIN_MS, Math.min(Debouncer.MAX_MS, s.debounceMaxMs)),
    );
  }

  private log(
    level: LogLevel,
    request: CompletionRequest,
    extra: Partial<LogEntry> = {},
  ): void {
    const entry: LogEntry = {
      time: new Date().toISOString(),
      level,
      requestId: request.id,
      file: request.path,
      trigger: request.trigger,
      ...extra,
    };
    this.logs.appendIfEnabled(entry, this.settings().logLevel);
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
      this.settings().logLevel,
    );
  }
}

async function sleepCancelable(ms: number, token: CancellationToken): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    token.throwIfCancelled();
    const remain = end - Date.now();
    if (remain <= 0) break;
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, Math.min(20, remain));
      token.onCancel(() => {
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

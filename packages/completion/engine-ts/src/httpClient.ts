import {
  CancellationToken,
  CancelledError,
  HttpStatusError,
} from "./errorBackoff.js";
import { contextTokensFromModelObject } from "./modelLimits.js";
import { chatUserContent, STRICT_COMPLETION_INSTRUCTIONS } from "./promptBuilder.js";
import {
  formatTokenPrompt,
  isDeepSeekBetaUrl,
  probeCandidates,
  resolveTemplate,
  shortLabel,
  stopTokens,
  wireFormat,
} from "./promptTemplate.js";
import {
  hasCrlf,
  isBlockedExtraHeaderName,
  isLocalHostname,
} from "./settingsValidation.js";
import type {
  PromptTemplateId,
  ProviderConfig,
  ProviderRequest,
  ProviderResponse,
  RequestStyle,
  TemplateProbeStatus,
  Usage,
  WireFormat,
} from "./types.js";
import { TIMEOUT } from "./types.js";

export interface HttpLogEvent {
  level: "DEBUG" | "INFO" | "WARN" | "ERROR";
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
}

export interface RemoteModel {
  id: string;
  contextLength?: number | null;
}

export interface TemplateProbeResult {
  template: PromptTemplateId;
  status: TemplateProbeStatus;
  httpStatus?: number | null;
  latencyMs: number;
  preview?: string;
  error?: string;
  resolvedPath?: string;
  resolvedUrl?: string;
}

export type CompletionClient = {
  complete(request: ProviderRequest, token: CancellationToken): Promise<ProviderResponse>;
};

const PROTECTED_BODY_KEYS = new Set([
  "model",
  "prompt",
  "suffix",
  "messages",
  "input",
  "instructions",
  "stream",
  "__proto__",
  "constructor",
  "prototype",
]);

function httpStatusFallbackMessage(status: number): string {
  switch (status) {
    case 400:
      return "Bad Request";
    case 401:
      return "Unauthorized";
    case 403:
      return "Forbidden";
    case 404:
      return "Not Found";
    case 405:
      return "Method Not Allowed";
    case 429:
      return "Too Many Requests";
    case 500:
      return "Internal Server Error";
    case 502:
      return "Bad Gateway";
    case 503:
      return "Service Unavailable";
    case 504:
      return "Gateway Timeout";
    default:
      return `HTTP ${status} (empty response body)`;
  }
}

const SENSITIVE_QUERY_KEY_RE =
  /(?:key|token|secret|auth|password|passwd|pwd|credential|sig|signature)/i;

export class HttpCompletionClient implements CompletionClient {
  constructor(
    private config: ProviderConfig,
    private operation = "completion",
    private onLog: (e: HttpLogEvent) => void = () => {},
    private fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}

  async complete(
    request: ProviderRequest,
    token: CancellationToken,
    timeoutMs?: number,
  ): Promise<ProviderResponse> {
    validateBaseUrl(this.config.baseUrl, this.config.allowRemote !== false);
    token.throwIfCancelled();
    const hardTimeout = clamp(
      timeoutMs ?? this.completionTimeoutMs(),
      TIMEOUT.MIN_MS,
      TIMEOUT.MAX_SETTINGS_MS,
    );
    const template = this.resolveTemplate(this.config);
    const wire = wireFormat(template);
    const useStream = !!(request.stream && this.config.stream);
    const path = pathFor(template, this.config);
    const url = joinUrl(this.config.baseUrl, path);
    const safeUrl = redactUrl(url);
    const body = bodyFor(template, request, this.config, useStream);
    const settingsOp = isSettingsOperation(this.operation);
    this.emitLog({
      level: settingsOp ? "INFO" : "DEBUG",
      operation: this.operation,
      method: "POST",
      url: safeUrl,
      model: request.model || this.config.model,
      requestStyle: `${template}/${wire}`,
      message: `request start stream=${useStream} template=${shortLabel(template)} timeoutMs=${hardTimeout} settingsOp=${settingsOp}`,
    });

    const headers: Record<string, string> = {};
    applyExtraHeaders(headers, this.config.extraHeadersJson ?? "{}");
    headers["Content-Type"] = "application/json";
    headers.Accept = useStream ? "text/event-stream" : "application/json";
    applyAuth(headers, this.config);

    const controller = new AbortController();
    let timedOut = false;
    token.onCancel(() => controller.abort());
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, hardTimeout);
    const started = Date.now();
    try {
      token.throwIfCancelled();
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
      if (timedOut) {
        throw new Error(`timed out after ${hardTimeout}ms`);
      }
      token.throwIfCancelled();
      if (!res.ok) {
        const rawErr = (await res.text().catch(() => "")).trim();
        const preview = redactSecrets(
          (rawErr || httpStatusFallbackMessage(res.status)).slice(0, 300),
          this.config.apiKey,
        );
        this.emitFailure(safeUrl, template, started, res.status, preview, rawErr.length);
        throw new HttpStatusError(
          res.status,
          `POST ${safeUrl} -> HTTP ${res.status}: ${preview}`,
        );
      }
      if (useStream) {
        const streamed = await this.readStream(
          res,
          wire,
          token,
          !!request.stopAtNewline,
          controller,
        );
        if (streamed.streamError) {
          const safeErr = redactSecrets(streamed.streamError, this.config.apiKey);
          this.emitFailure(safeUrl, template, started, res.status, safeErr);
          throw new HttpStatusError(res.status, `POST ${safeUrl} -> HTTP ${res.status}: ${safeErr}`);
        }
        this.emitSuccess(
          safeUrl,
          template,
          started,
          res.status,
          null,
          streamed.text.length,
          streamed.emptyReason,
        );
        return {
          text: streamed.text,
          usage: streamed.usage,
          rawStatus: res.status,
          emptyReason: streamed.emptyReason,
        };
      }
      const raw = await res.text();
      const parsedText = parseText(wire, raw);
      const usage = parseUsage(raw);
      const emptyReason = parsedText.trim() ? null : diagnoseEmptyResponse(raw);
      this.emitSuccess(safeUrl, template, started, res.status, raw.length, parsedText.length, emptyReason);
      return { text: parsedText, usage, rawStatus: res.status, emptyReason };
    } catch (e) {
      if (timedOut) {
        const detail = `timed out after ${hardTimeout}ms`;
        this.emitFailure(safeUrl, template, started, null, detail);
        throw new Error(`POST ${safeUrl} failed: ${detail}`, { cause: e });
      }
      if (token.isCancelled() || e instanceof CancelledError) {
        throw new CancelledError();
      }
      if (e instanceof HttpStatusError) throw e;
      const detail = redactSecrets(formatTransportError(e, hardTimeout), this.config.apiKey);
      this.emitFailure(safeUrl, template, started, null, detail);
      throw new Error(`POST ${safeUrl} failed: ${detail}`, { cause: e });
    } finally {
      clearTimeout(timer);
    }
  }

  async testConnection(): Promise<ProviderResponse> {
    return this.complete(this.probeRequest(), new CancellationToken(), this.settingsTimeoutMs());
  }

  async probeTemplate(template: PromptTemplateId): Promise<TemplateProbeResult> {
    const concrete =
      template === "AUTO" ? this.resolveTemplate(this.config) : template;
    const probeConfig: ProviderConfig = {
      ...this.config,
      promptTemplate: concrete,
      requestStyle: "AUTO",
    };
    const client = new HttpCompletionClient(
      probeConfig,
      "template_probe",
      this.onLog,
      this.fetchImpl,
    );
    const path = pathFor(concrete, probeConfig);
    const resolvedUrl = redactUrl(joinUrl(probeConfig.baseUrl, path));
    const started = Date.now();
    try {
      const resp = await client.complete(
        this.probeRequest(),
        new CancellationToken(),
        this.settingsTimeoutMs(),
      );
      const latency = Date.now() - started;
      const preview = resp.text.replace(/\n/g, " ").trim().slice(0, 80);
      if (!resp.text.trim()) {
        return {
          template: concrete,
          status: "EMPTY",
          httpStatus: resp.rawStatus,
          latencyMs: latency,
          preview,
          resolvedPath: path,
          resolvedUrl,
          error: resp.emptyReason || "empty completion",
        };
      }
      return {
        template: concrete,
        status: "SUCCESS",
        httpStatus: resp.rawStatus,
        latencyMs: latency,
        preview,
        resolvedPath: path,
        resolvedUrl,
      };
    } catch (e) {
      const status = e instanceof HttpStatusError ? e.status : null;
      const wf = wireFormat(concrete);
      const hint =
        wf !== "CHAT_MESSAGES" && wf !== "RESPONSES_API" && isChatEndpointPath(path)
          ? " (hint: FIM path override points to /chat/completions; clear FIM path or use CHAT/RESPONSES template)"
          : "";
      return {
        template: concrete,
        status: "FAILED",
        httpStatus: status,
        latencyMs: Date.now() - started,
        error:
          redactSecrets(
            e instanceof Error ? e.message || e.name : String(e),
            this.config.apiKey,
          ) + hint,
        resolvedPath: path,
        resolvedUrl,
      };
    }
  }

  async probeAllTemplates(): Promise<TemplateProbeResult[]> {
    const results: TemplateProbeResult[] = [];
    for (const t of probeCandidates()) {
      results.push(await this.probeTemplate(t));
    }
    return results;
  }

  async listModels(): Promise<RemoteModel[]> {
    validateBaseUrl(this.config.baseUrl, this.config.allowRemote !== false);
    const hardTimeout = this.settingsTimeoutMs();
    const paths = modelPaths(this.config.baseUrl);
    let lastFailure: Error | null = null;
    for (const path of paths) {
      const url = joinUrl(this.config.baseUrl, path);
      const safeUrl = redactUrl(url);
      const started = Date.now();
      this.emitLog({
        level: "INFO",
        operation: "list_models",
        method: "GET",
        url: safeUrl,
        message: `request start timeoutMs=${hardTimeout}`,
      });
      const headers: Record<string, string> = {};
      applyExtraHeaders(headers, this.config.extraHeadersJson ?? "{}");
      headers.Accept = "application/json";
      applyAuth(headers, this.config);

      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, hardTimeout);
      try {
        const res = await this.fetchImpl(url, {
          method: "GET",
          headers,
          signal: controller.signal,
        });
        if (timedOut) {
          throw new Error(`timed out after ${hardTimeout}ms`);
        }
        const body = await res.text();
        if (res.ok) {
          const models = parseModels(body);
          this.emitLog({
            level: "INFO",
            operation: "list_models",
            method: "GET",
            url: safeUrl,
            status: res.status,
            latencyMs: Date.now() - started,
            responseChars: body.length,
            message: `models=${models.length} withContext=${models.filter((m) => m.contextLength != null).length}`,
          });
          return models;
        }
        const preview = redactSecrets(body.slice(0, 300), this.config.apiKey);
        const failure = new HttpStatusError(
          res.status,
          `GET ${safeUrl} -> HTTP ${res.status}: ${preview}`,
        );
        this.emitLog({
          level: res.status === 401 || res.status === 403 ? "ERROR" : "WARN",
          operation: "list_models",
          method: "GET",
          url: safeUrl,
          status: res.status,
          latencyMs: Date.now() - started,
          responseChars: body.length,
          error: preview,
          message:
            path === paths[paths.length - 1]
              ? "request failed"
              : "endpoint unavailable; trying fallback",
        });
        if ((res.status !== 404 && res.status !== 405) || path === paths[paths.length - 1]) {
          throw failure;
        }
        lastFailure = failure;
      } catch (e) {
        if (e instanceof HttpStatusError) throw e;
        const detail = timedOut
          ? `timed out after ${hardTimeout}ms`
          : redactSecrets(formatTransportError(e, hardTimeout), this.config.apiKey);
        this.emitLog({
          level: "WARN",
          operation: "list_models",
          method: "GET",
          url: safeUrl,
          latencyMs: Date.now() - started,
          error: detail,
          message: "request failed",
        });
        throw new Error(`GET ${safeUrl} failed: ${detail}`, { cause: e });
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastFailure ?? new Error("No model endpoint available");
  }

  private probeRequest(): ProviderRequest {
    return {
      model: this.config.model,
      prefix: "def add(a, b):\n    ",
      suffix: "\n",
      maxTokens: clamp(this.config.maxTokens ?? 128, 16, 1024),
      temperature: 0,
      stream: Boolean(this.config.stream),
    };
  }

  private resolveTemplate(cfg: ProviderConfig): PromptTemplateId {
    let stored: PromptTemplateId = cfg.promptTemplate ?? "AUTO";
    if (stored === "AUTO") {
      const style = (cfg.requestStyle ?? "AUTO") as RequestStyle;
      if (style === "FIM") stored = "CODESTRAL_API";
      else if (style === "CHAT") stored = "CHAT";
    }
    return resolveTemplate(stored, cfg.model, cfg.kind, cfg.baseUrl);
  }

  private completionTimeoutMs(): number {
    return clamp(this.config.timeoutMs ?? TIMEOUT.DEFAULT_MS, TIMEOUT.MIN_MS, TIMEOUT.MAX_MS);
  }

  private settingsTimeoutMs(): number {
    return clamp(
      this.config.settingsTimeoutMs ?? TIMEOUT.DEFAULT_SETTINGS_MS,
      TIMEOUT.MIN_SETTINGS_MS,
      TIMEOUT.MAX_SETTINGS_MS,
    );
  }

  private async readStream(
    res: Response,
    wire: WireFormat,
    token: CancellationToken,
    stopAtNewline: boolean,
    controller: AbortController,
  ): Promise<{
    text: string;
    usage: Usage | null;
    emptyReason: string | null;
    streamError: string | null;
  }> {
    if (!res.body) {
      return { text: "", usage: null, emptyReason: "empty completion", streamError: null };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let out = "";
    let usage: Usage | null = null;
    let doneReading = false;
    let streamFinishReason = "";
    let streamSawReasoning = false;
    let streamReasoningTokens = 0;
    let streamError: string | null = null;

    const processLine = (rawLine: string): boolean => {
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      const trimmedStart = line.trimStart();
      if (!trimmedStart.startsWith("data:")) return false;
      const data = trimmedStart.slice(5).trim();
      if (!data) return false;
      if (data === "[DONE]") {
        doneReading = true;
        return true;
      }
      let parsed: Record<string, unknown>;
      try {
        const v: unknown = JSON.parse(data);
        if (!v || typeof v !== "object" || Array.isArray(v)) return false;
        parsed = v as Record<string, unknown>;
      } catch {
        return false;
      }
      const eventType = typeof parsed.type === "string" ? parsed.type.toLowerCase() : "";
      const chunkUsage = parseUsageObj(parsed);
      if (chunkUsage) usage = chunkUsage;
      const chunkReasoningTokens = extractReasoningTokensObj(parsed);
      if (chunkReasoningTokens > streamReasoningTokens) {
        streamReasoningTokens = chunkReasoningTokens;
      }
      if (chunkHasReasoningObj(parsed)) streamSawReasoning = true;
      const fr = extractFinishReasonObj(parsed);
      if (fr) streamFinishReason = fr;

      if (eventType === "response.failed" || eventType === "error") {
        const respObj = parsed.response as Record<string, unknown> | undefined;
        const errObj = (respObj?.error ?? parsed.error) as Record<string, unknown> | undefined;
        streamError =
          (typeof errObj?.message === "string" && errObj.message.trim()) ||
          "response stream failed";
        doneReading = true;
        return true;
      }

      const delta = parseStreamDeltaObj(wire, parsed);
      if (delta) {
        out += delta;
        if (stopAtNewline) {
          const firstNonWs = out.search(/\S/);
          if (firstNonWs >= 0) {
            const nlIdx = out.indexOf("\n", firstNonWs);
            if (nlIdx >= 0) {
              out = out.slice(0, nlIdx).replace(/\r$/, "");
              doneReading = true;
              controller.abort();
              return true;
            }
          }
        }
      }
      if (eventType === "response.completed" || eventType === "response.incomplete") {
        if (!out) {
          const respObj = parsed.response as Record<string, unknown> | undefined;
          if (respObj && typeof respObj === "object" && !Array.isArray(respObj)) {
            out = extractResponsesApiText(respObj);
          }
        }
        doneReading = true;
        return true;
      }
      return false;
    };

    try {
      while (!doneReading) {
        token.throwIfCancelled();
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (processLine(line)) break;
        }
      }
      if (!doneReading) {
        buf += decoder.decode();
        if (buf) {
          for (const line of buf.split("\n")) {
            if (processLine(line)) break;
          }
        }
      }
      const emptyReason = out.trim()
        ? null
        : formatEmptyDiagnostic(
            streamFinishReason,
            streamSawReasoning || streamReasoningTokens > 0,
            streamReasoningTokens,
            "",
          );
      return { text: out, usage, emptyReason, streamError };
    } finally {
      await reader.cancel().catch(() => {});
      try {
        reader.releaseLock();
      } catch {
        /* ignore */
      }
    }
  }

  private emitSuccess(
    url: string,
    template: PromptTemplateId,
    started: number,
    status: number,
    rawResponseChars: number | null,
    completionChars: number,
    emptyReason?: string | null,
  ): void {
    const reasonSuffix = emptyReason ? ` detail=${emptyReason}` : "";
    this.emitLog({
      level: "INFO",
      operation: this.operation,
      method: "POST",
      url,
      model: this.config.model,
      requestStyle: template,
      status,
      latencyMs: Date.now() - started,
      responseChars: rawResponseChars,
      message: `request succeeded completionChars=${completionChars} template=${shortLabel(template)}${reasonSuffix}`,
    });
  }

  private emitFailure(
    url: string,
    template: PromptTemplateId,
    started: number,
    status: number | null,
    error: string,
    responseChars?: number | null,
  ): void {
    this.emitLog({
      level: status === 401 || status === 403 ? "ERROR" : "WARN",
      operation: this.operation,
      method: "POST",
      url,
      model: this.config.model,
      requestStyle: template,
      status,
      latencyMs: Date.now() - started,
      responseChars,
      error,
      message: `request failed template=${shortLabel(template)}`,
    });
  }

  private emitLog(event: HttpLogEvent): void {
    try {
      this.onLog(event);
    } catch {
      /* ignore */
    }
  }
}

export function joinUrl(base: string, path: string): string {
  const trimmedBase = base.trim();
  const trimmedPath = path.trim();
  const normalizedPath = trimmedPath.startsWith("/") ? trimmedPath : `/${trimmedPath}`;
  try {
    const u = new URL(trimmedBase);
    const qIdx = normalizedPath.indexOf("?");
    const pathPart = qIdx >= 0 ? normalizedPath.slice(0, qIdx) : normalizedPath;
    const pathQuery = qIdx >= 0 ? normalizedPath.slice(qIdx + 1) : "";
    const basePath = u.pathname.replace(/\/+$/, "");
    u.pathname = `${basePath}${pathPart}`;
    if (pathQuery) {
      const extra = new URLSearchParams(pathQuery);
      for (const [k, v] of extra.entries()) {
        u.searchParams.set(k, v);
      }
    }
    return u.toString();
  } catch {
    const b = trimmedBase.replace(/\/+$/, "");
    return b + normalizedPath;
  }
}

export function defaultOpenAiRelativePath(baseUrl: string, v1Suffix: string): string {
  const suffix = v1Suffix.startsWith("/") ? v1Suffix : `/${v1Suffix}`;
  let basePath = "";
  try {
    basePath = new URL(baseUrl.trim()).pathname.replace(/\/+$/, "");
  } catch {
    basePath = "";
  }
  return basePath === "" ? `/v1${suffix}` : suffix;
}

export function validateBaseUrl(baseUrl: string, allowRemote: boolean): void {
  const trimmed = baseUrl.trim();
  let uri: URL;
  try {
    uri = new URL(trimmed);
  } catch {
    throw new Error(`Invalid baseUrl: ${redactUrl(trimmed)}`);
  }
  if (!uri.protocol) {
    throw new Error(`Invalid baseUrl: ${redactUrl(trimmed)}`);
  }
  if (uri.protocol !== "http:" && uri.protocol !== "https:") {
    throw new Error(`Invalid baseUrl scheme: ${uri.protocol}`);
  }
  if (!uri.hostname) {
    throw new Error(`Invalid baseUrl: ${redactUrl(trimmed)}`);
  }
  if (uri.username || uri.password) {
    throw new Error("baseUrl must not contain user-info credentials");
  }
  if (!allowRemote && !isLocalHostname(uri.hostname)) {
    throw new Error("allowRemote=false but baseUrl is not localhost");
  }
}

export function redactUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed);
    const hadUserInfo = Boolean(u.username || u.password);
    if (hadUserInfo) {
      u.username = "";
      u.password = "";
    }
    for (const key of [...u.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEY_RE.test(key)) {
        u.searchParams.set(key, "***");
      }
    }
    return u.toString();
  } catch {
    return trimmed
      .replace(/([a-z][a-z0-9+.-]*:\/\/)([^/\s@]+)@/gi, "$1***@")
      .replace(
        /([?&](?:api[-_]?key|key|access[-_]?token|token|auth|secret|sig|signature)=)([^&\s"']+)/gi,
        "$1***",
      );
  }
}

export function redactSecrets(text: string, apiKey?: string): string {
  let out = text;
  const key = apiKey?.trim();
  if (key && key.length >= 4) {
    out = out.split(key).join("[REDACTED]");
  }
  out = out.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{6,}/gi, "$1[REDACTED]");
  out = out.replace(/(Basic\s+)[A-Za-z0-9+/=]{6,}/gi, "$1[REDACTED]");
  out = out.replace(/([a-z][a-z0-9+.-]*:\/\/)([^/\s@]+)@/gi, "$1***@");
  out = out.replace(
    /([?&](?:api[-_]?key|key|access[-_]?token|token|auth|secret|sig|signature)=)([^&\s"']+)/gi,
    "$1***",
  );
  return out;
}

export function resolveTemplateForConfig(cfg: ProviderConfig): PromptTemplateId {
  let stored: PromptTemplateId = cfg.promptTemplate ?? "AUTO";
  if (stored === "AUTO") {
    const style = (cfg.requestStyle ?? "AUTO") as RequestStyle;
    if (style === "FIM") stored = "CODESTRAL_API";
    else if (style === "CHAT") stored = "CHAT";
  }
  return resolveTemplate(stored, cfg.model, cfg.kind, cfg.baseUrl);
}

export function resolveUrl(template: PromptTemplateId, cfg: ProviderConfig): string {
  return joinUrl(cfg.baseUrl, pathFor(template, cfg));
}

export function isChatEndpointPath(path: string): boolean {
  const clean = path.trim().split("?")[0].replace(/\/+$/, "").toLowerCase();
  return clean === "/chat/completions" || clean.endsWith("/chat/completions");
}

export function pathFor(template: PromptTemplateId, cfg: ProviderConfig): string {
  switch (wireFormat(template)) {
    case "FIM_FIELDS": {
      const custom = cfg.fimPath?.trim();
      if (custom) return custom;
      if (isDeepSeekBetaUrl(cfg.baseUrl)) {
        return defaultOpenAiRelativePath(cfg.baseUrl, "/completions");
      }
      return defaultOpenAiRelativePath(cfg.baseUrl, "/fim/completions");
    }
    case "COMPLETION_PROMPT": {
      const customComp = cfg.completionsPath?.trim();
      if (customComp) return customComp;
      const customFim = cfg.fimPath?.trim();
      if (customFim && !isChatEndpointPath(customFim)) return customFim;
      return defaultOpenAiRelativePath(cfg.baseUrl, "/completions");
    }
    case "CHAT_MESSAGES": {
      const custom = cfg.chatPath?.trim();
      return custom || defaultOpenAiRelativePath(cfg.baseUrl, "/chat/completions");
    }
    case "RESPONSES_API": {
      const custom = cfg.responsesPath?.trim();
      return custom || defaultOpenAiRelativePath(cfg.baseUrl, "/responses");
    }
  }
}

function modelPaths(baseUrl: string): string[] {
  let path = "";
  try {
    path = new URL(baseUrl.trim()).pathname.replace(/\/+$/, "");
  } catch {
    path = "";
  }
  if (path === "") return ["/v1/models", "/models"];
  if (path.endsWith("/v1")) return ["/models"];
  return ["/models", "/v1/models"];
}

export function parseStopSequences(raw: string | null | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is string => typeof v === "string" && v.length > 0);
      }
    } catch {
      // fall through to newline split
    }
  }
  return raw
    .split(/\r?\n/)
    .map((s) => s.replace(/\\n/g, "\n").replace(/\\t/g, "\t"))
    .filter((s) => s.length > 0);
}

export function bodyFor(
  template: PromptTemplateId,
  request: ProviderRequest,
  cfg: ProviderConfig,
  stream: boolean,
): string {
  const model = request.model || cfg.model;
  const maxTokens = Math.max(1, request.maxTokens);
  let body: Record<string, unknown>;
  const stops: string[] = [];

  switch (wireFormat(template)) {
    case "FIM_FIELDS":
      body = {
        model,
        prompt: request.prefix,
        suffix: request.suffix,
        max_tokens: maxTokens,
        temperature: request.temperature,
        stream,
      };
      break;
    case "COMPLETION_PROMPT": {
      const prompt = formatTokenPrompt(template, request.prefix, request.suffix);
      stops.push(...stopTokens(template));
      body = {
        model,
        prompt,
        max_tokens: maxTokens,
        temperature: request.temperature,
        stream,
      };
      break;
    }
    case "CHAT_MESSAGES":
      body = {
        model,
        messages: [
          {
            role: "system",
            content: STRICT_COMPLETION_INSTRUCTIONS,
          },
          {
            role: "user",
            content: chatUserContent(request.prefix, request.suffix),
          },
        ],
        max_tokens: maxTokens,
        temperature: request.temperature,
        stream,
      };
      break;
    case "RESPONSES_API":
      body = {
        model,
        instructions: STRICT_COMPLETION_INSTRUCTIONS,
        input: chatUserContent(request.prefix, request.suffix),
        max_output_tokens: maxTokens,
        store: false,
        stream,
      };
      // Omit default temperature=0 and stop on Responses API for compatibility with reasoning models.
      if (request.temperature > 0) {
        body.temperature = request.temperature;
      }
      break;
  }

  const allowStop = wireFormat(template) !== "RESPONSES_API";

  // Safely merge optional extraBodyJson without overwriting protected keys.
  if (cfg.extraBodyJson?.trim()) {
    try {
      const extra: unknown = JSON.parse(cfg.extraBodyJson);
      if (extra !== null && typeof extra === "object" && !Array.isArray(extra)) {
        for (const [k, v] of Object.entries(extra as Record<string, unknown>)) {
          if (PROTECTED_BODY_KEYS.has(k)) continue;
          if (k === "stop") {
            if (!allowStop) continue;
            if (typeof v === "string" && v.length > 0) {
              stops.push(v);
            } else if (Array.isArray(v)) {
              for (const item of v) {
                if (typeof item === "string" && item.length > 0) stops.push(item);
              }
            }
            continue;
          }
          body[k] = v;
        }
      }
    } catch {
      /* ignore invalid extraBodyJson */
    }
  }

  if (allowStop) {
    for (const seq of parseStopSequences(cfg.stopSequences)) {
      stops.push(seq);
    }

    if (stops.length > 0) {
      body.stop = [...new Set(stops)];
    }
  }

  return JSON.stringify(body);
}

function extractTextValue(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    let out = "";
    for (const part of raw) {
      if (typeof part === "string") {
        out += part;
      } else if (part && typeof part === "object" && !Array.isArray(part)) {
        const obj = part as Record<string, unknown>;
        const type = typeof obj.type === "string" ? obj.type.toLowerCase() : "";
        if (type && type !== "text" && type !== "output_text" && type !== "input_text") {
          continue;
        }
        if (typeof obj.text === "string" && obj.text.length > 0) {
          out += obj.text;
        }
      }
    }
    return out;
  }
  return "";
}

function extractResponsesApiText(json: Record<string, unknown>): string {
  const direct = extractTextValue(json.output_text);
  if (direct.length > 0) return direct;
  if (!Array.isArray(json.output)) return "";
  let out = "";
  for (const item of json.output) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const type = typeof obj.type === "string" ? obj.type.toLowerCase() : "";
    if (type === "reasoning") continue;
    const piece = extractTextValue(obj.content) || extractTextValue(obj.text);
    if (piece.length > 0) out += piece;
  }
  return out;
}

function extractFinishReasonObj(json: Record<string, unknown>): string {
  const choices = json.choices as unknown[] | undefined;
  const first = (choices?.[0] ?? null) as Record<string, unknown> | null;
  const respObj = json.response as Record<string, unknown> | undefined;
  const incomplete = (respObj?.incomplete_details ?? json.incomplete_details) as
    | Record<string, unknown>
    | undefined;
  const status = respObj?.status ?? json.status;
  return (
    (typeof first?.finish_reason === "string" && first.finish_reason.trim()) ||
    (typeof incomplete?.reason === "string" && incomplete.reason.trim()) ||
    (status === "incomplete" ? "incomplete" : "")
  );
}

function chunkHasReasoningObj(json: Record<string, unknown>): boolean {
  const eventType = typeof json.type === "string" ? json.type.toLowerCase() : "";
  if (eventType.includes("reasoning")) return true;
  const choices = json.choices as unknown[] | undefined;
  const first = (choices?.[0] ?? null) as Record<string, unknown> | null;
  const msg = (first?.message ?? null) as Record<string, unknown> | null;
  const delta = (first?.delta ?? null) as Record<string, unknown> | null;
  return [
    msg?.reasoning_content,
    msg?.reasoning,
    delta?.reasoning_content,
    delta?.reasoning,
    first?.reasoning,
  ].some((v) => typeof v === "string" && v.trim().length > 0);
}

function extractReasoningTokensObj(json: Record<string, unknown>): number {
  const respObj = json.response as Record<string, unknown> | undefined;
  const usage = (respObj?.usage ?? json.usage) as Record<string, unknown> | undefined;
  const details = (usage?.completion_tokens_details ?? usage?.output_tokens_details) as
    | Record<string, unknown>
    | undefined;
  return numberOrNull(details?.reasoning_tokens) ?? 0;
}

function formatEmptyDiagnostic(
  finishReason: string,
  reasoningConsumed: boolean,
  reasoningTokens: number,
  refusal: string,
): string {
  if (refusal) {
    return `empty completion (refusal: ${refusal.slice(0, 120)})`;
  }
  if (reasoningConsumed) {
    const meta: string[] = [];
    if (finishReason) meta.push(`finish_reason=${finishReason}`);
    if (reasoningTokens > 0) meta.push(`reasoning_tokens=${reasoningTokens}`);
    const prefix = meta.length > 0 ? `${meta.join(", ")}; ` : "";
    return `empty completion (${prefix}reasoning consumed output budget — increase maxTokens or disable reasoning in extraBodyJson)`;
  }
  if (finishReason === "length" || finishReason === "max_output_tokens") {
    return `empty completion (finish_reason=${finishReason} — increase maxTokens)`;
  }
  if (finishReason && finishReason !== "stop") {
    return `empty completion (finish_reason=${finishReason})`;
  }
  return "empty completion";
}

export function diagnoseEmptyResponse(body: string): string {
  let json: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return "empty completion";
    }
    json = parsed as Record<string, unknown>;
  } catch {
    return "empty completion";
  }
  const choices = json.choices as unknown[] | undefined;
  const first = (choices?.[0] ?? null) as Record<string, unknown> | null;
  const msg = (first?.message ?? null) as Record<string, unknown> | null;
  const refusal = typeof msg?.refusal === "string" ? msg.refusal.trim() : "";
  const finishReason = extractFinishReasonObj(json);
  const hasReasoningText = chunkHasReasoningObj(json);
  const reasoningTokens = extractReasoningTokensObj(json);
  return formatEmptyDiagnostic(
    finishReason,
    hasReasoningText || reasoningTokens > 0,
    reasoningTokens,
    refusal,
  );
}

export function parseText(wire: WireFormat, body: string): string {
  let json: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "";
    json = parsed as Record<string, unknown>;
  } catch {
    return "";
  }
  const choices = json.choices as unknown[] | undefined;
  const first = (choices?.[0] ?? null) as Record<string, unknown> | null;
  let extracted = "";
  if (wire === "RESPONSES_API") {
    const msg = first?.message as Record<string, unknown> | undefined;
    extracted =
      extractResponsesApiText(json) ||
      extractTextValue(msg?.content) ||
      extractTextValue(first?.text);
  } else if (wire === "CHAT_MESSAGES") {
    const msg = first?.message as Record<string, unknown> | undefined;
    extracted = extractTextValue(msg?.content) || extractTextValue(first?.text);
  } else {
    extracted =
      extractTextValue(first?.text) ||
      extractTextValue((first?.message as Record<string, unknown> | undefined)?.content) ||
      extractTextValue(json.text);
  }
  if (extracted.length > 0) return extracted;
  return extractResponsesApiText(json);
}

function parseStreamDeltaObj(wire: WireFormat, json: Record<string, unknown>): string {
  const eventType = typeof json.type === "string" ? json.type.toLowerCase() : "";
  if (eventType === "response.output_text.delta") {
    return extractTextValue(json.delta);
  }
  const choices = json.choices as unknown[] | undefined;
  const first = (choices?.[0] ?? null) as Record<string, unknown> | null;
  if (first) {
    if (wire === "CHAT_MESSAGES" || wire === "RESPONSES_API") {
      const delta = first.delta as Record<string, unknown> | undefined;
      return extractTextValue(delta?.content) || extractTextValue(first.text);
    }
    const delta = first.delta as Record<string, unknown> | undefined;
    return extractTextValue(first.text) || extractTextValue(delta?.content);
  }
  return "";
}

function parseUsage(body: string): Usage | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parseUsageObj(parsed as Record<string, unknown>);
  } catch {
    return null;
  }
}

function parseUsageObj(json: Record<string, unknown>): Usage | null {
  const respObj = json.response as Record<string, unknown> | undefined;
  const usage = respObj?.usage ?? json.usage;
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;
  const u = usage as Record<string, unknown>;
  const inputTokens = numberOrNull(u.prompt_tokens ?? u.input_tokens);
  const outputTokens = numberOrNull(u.completion_tokens ?? u.output_tokens);
  if (inputTokens == null && outputTokens == null) return null;
  return { inputTokens, outputTokens };
}

function parseModels(body: string): RemoteModel[] {
  const json = JSON.parse(body) as Record<string, unknown>;
  const raw = (json.data ?? json.models ?? []) as unknown[];
  const models: RemoteModel[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      models.push({ id: item });
      continue;
    }
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const obj = item as Record<string, unknown>;
      const id = [obj.id, obj.name, obj.model]
        .map((v) => (v == null ? "" : String(v).trim()))
        .find((v) => v);
      if (!id) continue;
      models.push({
        id,
        contextLength: contextTokensFromModelObject(obj),
      });
    }
  }
  const seen = new Set<string>();
  return models
    .filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function numberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

function applyAuth(headers: Record<string, string>, cfg: ProviderConfig): void {
  const key = cfg.apiKey?.trim() ?? "";
  if (!key) return;
  const template = cfg.authHeaderTemplate?.trim() || "Authorization: Bearer ${apiKey}";
  if (hasCrlf(template) || hasCrlf(key)) return;
  const rendered = template.replace(/\$\{apiKey\}/g, key).replace(/\{\{apiKey\}\}/g, key);
  if (hasCrlf(rendered)) return;
  const idx = rendered.indexOf(":");
  if (idx <= 0) {
    headers.Authorization = rendered;
    return;
  }
  const name = rendered.slice(0, idx).trim();
  const value = rendered.slice(idx + 1).trim();
  if (name && value) headers[name] = value;
}

export function applyExtraHeaders(headers: Record<string, string>, json: string): void {
  if (!json.trim()) return;
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return;
    for (const [rawKey, rawVal] of Object.entries(parsed as Record<string, unknown>)) {
      const k = rawKey.trim();
      const text = rawVal == null ? "" : String(rawVal).trim();
      if (!k || !text) continue;
      if (hasCrlf(k) || hasCrlf(text)) continue;
      if (isBlockedExtraHeaderName(k)) continue;
      headers[k] = text;
    }
  } catch {
    /* ignore */
  }
}

function isSettingsOperation(op: string): boolean {
  return [
    "connection_test",
    "list_models",
    "template_probe",
    "template_probe_all",
    "format_test",
  ].includes(op);
}

function formatTransportError(e: unknown, timeoutMs: number): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (
    (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError")) ||
    /timed out|TimeoutError|aborted/i.test(msg)
  ) {
    return `timed out after ${timeoutMs}ms`;
  }
  return msg || (e instanceof Error ? e.name : "error");
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

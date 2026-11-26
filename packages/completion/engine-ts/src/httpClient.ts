import {
  CancellationToken,
  CancelledError,
  HttpStatusError,
} from "./errorBackoff.js";
import { contextTokensFromModelObject } from "./modelLimits.js";
import { chatUserContent } from "./promptBuilder.js";
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
  "stream",
  "__proto__",
  "constructor",
  "prototype",
]);

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
        const text = await res.text().catch(() => "");
        const preview = redactSecrets(text.slice(0, 300), this.config.apiKey);
        this.emitFailure(safeUrl, template, started, res.status, preview, text.length);
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
        this.emitSuccess(safeUrl, template, started, res.status, null, streamed.text.length);
        return { text: streamed.text, usage: streamed.usage, rawStatus: res.status };
      }
      const raw = await res.text();
      const parsedText = parseText(wire, raw);
      const usage = parseUsage(raw);
      this.emitSuccess(safeUrl, template, started, res.status, raw.length, parsedText.length);
      return { text: parsedText, usage, rawStatus: res.status };
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
          error: "empty completion",
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
      return {
        template: concrete,
        status: "FAILED",
        httpStatus: status,
        latencyMs: Date.now() - started,
        error: redactSecrets(
          e instanceof Error ? e.message || e.name : String(e),
          this.config.apiKey,
        ),
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
      maxTokens: Math.min(this.config.maxTokens ?? 128, 16),
      temperature: 0,
      stream: false,
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
  ): Promise<{ text: string; usage: Usage | null }> {
    if (!res.body) return { text: "", usage: null };
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let out = "";
    let usage: Usage | null = null;
    let doneReading = false;

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
      const chunkUsage = parseUsageObj(parsed);
      if (chunkUsage) usage = chunkUsage;
      const delta = parseStreamDeltaObj(wire, parsed);
      if (delta) {
        if (stopAtNewline) {
          const nlIdx = delta.indexOf("\n");
          if (nlIdx >= 0) {
            const firstLine = (out + delta.slice(0, nlIdx)).replace(/\r$/, "");
            if (firstLine.trim().length > 0) {
              out = firstLine;
              doneReading = true;
              controller.abort();
              return true;
            }
          }
        }
        out += delta;
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
      return { text: out, usage };
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
  ): void {
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
      message: `request succeeded completionChars=${completionChars} template=${shortLabel(template)}`,
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
    case "COMPLETION_PROMPT":
      return (
        cfg.completionsPath?.trim() ||
        cfg.fimPath?.trim() ||
        defaultOpenAiRelativePath(cfg.baseUrl, "/completions")
      );
    case "CHAT_MESSAGES": {
      const custom = cfg.chatPath?.trim();
      return custom || defaultOpenAiRelativePath(cfg.baseUrl, "/chat/completions");
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
            content:
              "You are a code completion engine. Continue the code at the cursor. Output only the completion text, no markdown.",
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
  }

  // Safely merge optional extraBodyJson without overwriting protected keys.
  if (cfg.extraBodyJson?.trim()) {
    try {
      const extra: unknown = JSON.parse(cfg.extraBodyJson);
      if (extra !== null && typeof extra === "object" && !Array.isArray(extra)) {
        for (const [k, v] of Object.entries(extra as Record<string, unknown>)) {
          if (PROTECTED_BODY_KEYS.has(k)) continue;
          if (k === "stop") {
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

  for (const seq of parseStopSequences(cfg.stopSequences)) {
    stops.push(seq);
  }

  if (stops.length > 0) {
    body.stop = [...new Set(stops)];
  }

  return JSON.stringify(body);
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
  if (wire === "CHAT_MESSAGES") {
    const msg = first?.message as Record<string, unknown> | undefined;
    if (typeof msg?.content === "string" && msg.content.length > 0) return msg.content;
    if (typeof first?.text === "string" && first.text.length > 0) return first.text;
    return "";
  }
  if (typeof first?.text === "string" && first.text.length > 0) return first.text;
  const msg = first?.message as Record<string, unknown> | undefined;
  if (typeof msg?.content === "string" && msg.content.length > 0) return msg.content;
  if (typeof json.text === "string" && json.text.length > 0) return json.text;
  return "";
}

function parseStreamDeltaObj(wire: WireFormat, json: Record<string, unknown>): string {
  const choices = json.choices as unknown[] | undefined;
  const first = (choices?.[0] ?? null) as Record<string, unknown> | null;
  if (!first) return "";
  if (wire === "CHAT_MESSAGES") {
    const delta = first.delta as Record<string, unknown> | undefined;
    if (typeof delta?.content === "string" && delta.content.length > 0) return delta.content;
    if (typeof first.text === "string" && first.text.length > 0) return first.text;
    return "";
  }
  if (typeof first.text === "string" && first.text.length > 0) return first.text;
  const delta = first.delta as Record<string, unknown> | undefined;
  if (typeof delta?.content === "string" && delta.content.length > 0) return delta.content;
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
  const usage = json.usage;
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

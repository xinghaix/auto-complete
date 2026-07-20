import {
  CancellationToken,
  CancelledError,
  HttpStatusError,
} from "./errorBackoff.js";
import { chatUserContent } from "./promptBuilder.js";
import {
  formatTokenPrompt,
  probeCandidates,
  resolveTemplate,
  shortLabel,
  stopTokens,
  wireFormat,
} from "./promptTemplate.js";
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
}

export type CompletionClient = {
  complete(request: ProviderRequest, token: CancellationToken): Promise<ProviderResponse>;
};

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
    const body = bodyFor(template, request, this.config, useStream);
    const settingsOp = isSettingsOperation(this.operation);
    this.emitLog({
      level: settingsOp ? "INFO" : "DEBUG",
      operation: this.operation,
      method: "POST",
      url,
      model: request.model || this.config.model,
      requestStyle: `${template}/${wire}`,
      message: `request start stream=${useStream} template=${shortLabel(template)} timeoutMs=${hardTimeout} settingsOp=${settingsOp}`,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: useStream ? "text/event-stream" : "application/json",
    };
    applyAuth(headers, this.config);
    applyExtraHeaders(headers, this.config.extraHeadersJson ?? "{}");

    const controller = new AbortController();
    token.onCancel(() => controller.abort());
    const timer = setTimeout(() => controller.abort(), hardTimeout);
    const started = Date.now();
    try {
      token.throwIfCancelled();
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
      token.throwIfCancelled();
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        this.emitFailure(url, template, started, res.status, text.slice(0, 300), text.length);
        throw new HttpStatusError(
          res.status,
          `POST ${url} -> HTTP ${res.status}: ${text.slice(0, 300)}`,
        );
      }
      if (useStream) {
        const text = await this.readStream(res, wire, token);
        this.emitSuccess(url, template, started, res.status, null, text.length);
        return { text, rawStatus: res.status };
      }
      const raw = await res.text();
      const parsedText = parseText(wire, raw);
      const usage = parseUsage(raw);
      this.emitSuccess(url, template, started, res.status, raw.length, parsedText.length);
      return { text: parsedText, usage, rawStatus: res.status };
    } catch (e) {
      if (token.isCancelled() || (e instanceof Error && e.name === "AbortError")) {
        throw new CancelledError();
      }
      if (e instanceof HttpStatusError || e instanceof CancelledError) throw e;
      const detail = formatTransportError(e, hardTimeout);
      this.emitFailure(url, template, started, null, detail);
      throw new Error(`POST ${url} failed: ${detail}`, { cause: e });
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
      };
    } catch (e) {
      const status = e instanceof HttpStatusError ? e.status : null;
      return {
        template: concrete,
        status: "FAILED",
        httpStatus: status,
        latencyMs: Date.now() - started,
        error: e instanceof Error ? e.message || e.name : String(e),
        resolvedPath: path,
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
      const started = Date.now();
      this.emitLog({
        level: "INFO",
        operation: "list_models",
        method: "GET",
        url,
        message: `request start timeoutMs=${hardTimeout}`,
      });
      const headers: Record<string, string> = { Accept: "application/json" };
      applyAuth(headers, this.config);
      applyExtraHeaders(headers, this.config.extraHeadersJson ?? "{}");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), hardTimeout);
      try {
        const res = await this.fetchImpl(url, {
          method: "GET",
          headers,
          signal: controller.signal,
        });
        const body = await res.text();
        if (res.ok) {
          const models = parseModels(body);
          this.emitLog({
            level: "INFO",
            operation: "list_models",
            method: "GET",
            url,
            status: res.status,
            latencyMs: Date.now() - started,
            responseChars: body.length,
            message: `models=${models.length} withContext=${models.filter((m) => m.contextLength != null).length}`,
          });
          return models;
        }
        const failure = new HttpStatusError(
          res.status,
          `GET ${url} -> HTTP ${res.status}: ${body.slice(0, 300)}`,
        );
        this.emitLog({
          level: res.status === 401 || res.status === 403 ? "ERROR" : "WARN",
          operation: "list_models",
          method: "GET",
          url,
          status: res.status,
          latencyMs: Date.now() - started,
          responseChars: body.length,
          error: body.slice(0, 300),
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
        const detail = formatTransportError(e, hardTimeout);
        this.emitLog({
          level: "WARN",
          operation: "list_models",
          method: "GET",
          url,
          latencyMs: Date.now() - started,
          error: detail,
          message: "request failed",
        });
        throw new Error(`GET ${url} failed: ${detail}`, { cause: e });
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
    return resolveTemplate(stored, cfg.model, cfg.kind);
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
  ): Promise<string> {
    if (!res.body) return "";
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let out = "";
    while (true) {
      token.throwIfCancelled();
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        out += parseStreamDelta(wire, data);
      }
    }
    return out;
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
  const b = base.trim().replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return b + p;
}

export function defaultOpenAiRelativePath(baseUrl: string, v1Suffix: string): string {
  const suffix = v1Suffix.startsWith("/") ? v1Suffix : `/${v1Suffix}`;
  let basePath = "";
  try {
    basePath = new URL(baseUrl.trim()).pathname.replace(/\/+$/, "");
  } catch {
    basePath = "";
  }
  return basePath.endsWith("/v1") ? suffix : `/v1${suffix}`;
}

export function validateBaseUrl(baseUrl: string, allowRemote: boolean): void {
  let uri: URL;
  try {
    uri = new URL(baseUrl.trim());
  } catch {
    throw new Error(`Invalid baseUrl: ${baseUrl.trim()}`);
  }
  if (!uri.protocol || !uri.hostname) {
    throw new Error(`Invalid baseUrl: ${baseUrl.trim()}`);
  }
  if (!allowRemote) {
    const host = uri.hostname.toLowerCase();
    const local =
      host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0";
    if (!local) throw new Error("allowRemote=false but baseUrl is not localhost");
  }
}

function modelPaths(baseUrl: string): string[] {
  let path = "";
  try {
    path = new URL(baseUrl.trim()).pathname.replace(/\/+$/, "");
  } catch {
    path = "";
  }
  return path.endsWith("/v1") ? ["/models"] : ["/models", "/v1/models"];
}

function pathFor(template: PromptTemplateId, cfg: ProviderConfig): string {
  switch (wireFormat(template)) {
    case "FIM_FIELDS":
      return cfg.fimPath?.trim()
        ? cfg.fimPath
        : defaultOpenAiRelativePath(cfg.baseUrl, "/fim/completions");
    case "COMPLETION_PROMPT":
      return (
        cfg.completionsPath?.trim() ||
        cfg.fimPath?.trim() ||
        defaultOpenAiRelativePath(cfg.baseUrl, "/completions")
      );
    case "CHAT_MESSAGES":
      return cfg.chatPath?.trim()
        ? cfg.chatPath
        : defaultOpenAiRelativePath(cfg.baseUrl, "/chat/completions");
  }
}

export function bodyFor(
  template: PromptTemplateId,
  request: ProviderRequest,
  cfg: ProviderConfig,
  stream: boolean,
): string {
  const model = request.model || cfg.model;
  const maxTokens = Math.max(1, request.maxTokens);
  switch (wireFormat(template)) {
    case "FIM_FIELDS":
      return JSON.stringify({
        model,
        prompt: request.prefix,
        suffix: request.suffix,
        max_tokens: maxTokens,
        temperature: request.temperature,
        stream,
      });
    case "COMPLETION_PROMPT": {
      const prompt = formatTokenPrompt(template, request.prefix, request.suffix);
      const stops = stopTokens(template);
      const body: Record<string, unknown> = {
        model,
        prompt,
        max_tokens: maxTokens,
        temperature: request.temperature,
        stream,
      };
      if (stops.length) body.stop = stops;
      return JSON.stringify(body);
    }
    case "CHAT_MESSAGES":
      return JSON.stringify({
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
      });
  }
}

export function parseText(wire: WireFormat, body: string): string {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return "";
  }
  const choices = json.choices as unknown[] | undefined;
  const first = (choices?.[0] ?? null) as Record<string, unknown> | null;
  if (wire === "CHAT_MESSAGES") {
    const msg = first?.message as Record<string, unknown> | undefined;
    return (
      String(msg?.content ?? "") ||
      String(first?.text ?? "")
    );
  }
  return (
    String(first?.text ?? "") ||
    String((first?.message as Record<string, unknown> | undefined)?.content ?? "") ||
    String(json.text ?? "")
  );
}

function parseStreamDelta(wire: WireFormat, data: string): string {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return "";
  }
  const choices = json.choices as unknown[] | undefined;
  const first = (choices?.[0] ?? null) as Record<string, unknown> | null;
  if (!first) return "";
  if (wire === "CHAT_MESSAGES") {
    const delta = first.delta as Record<string, unknown> | undefined;
    return String(delta?.content ?? "") || String(first.text ?? "");
  }
  return (
    String(first.text ?? "") ||
    String((first.delta as Record<string, unknown> | undefined)?.content ?? "")
  );
}

function parseUsage(body: string): Usage | null {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    const usage = json.usage as Record<string, unknown> | undefined;
    if (!usage) return null;
    return {
      inputTokens: numberOrNull(usage.prompt_tokens),
      outputTokens: numberOrNull(usage.completion_tokens),
    };
  } catch {
    return null;
  }
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
    if (item && typeof item === "object") {
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

function contextTokensFromModelObject(obj: Record<string, unknown>): number | null {
  for (const key of ["context_length", "contextLength", "max_model_len", "max_tokens"]) {
    const n = numberOrNull(obj[key]);
    if (n != null && n > 0) return n;
  }
  return null;
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
  const rendered = template.replace(/\$\{apiKey\}/g, key).replace(/\{\{apiKey\}\}/g, key);
  const idx = rendered.indexOf(":");
  if (idx <= 0) {
    headers.Authorization = rendered;
    return;
  }
  const name = rendered.slice(0, idx).trim();
  const value = rendered.slice(idx + 1).trim();
  if (name && value) headers[name] = value;
}

function applyExtraHeaders(headers: Record<string, string>, json: string): void {
  if (!json.trim()) return;
  try {
    const obj = JSON.parse(json) as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      const text = v == null ? "" : String(v);
      if (k && text) headers[k] = text;
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
    (e instanceof Error && e.name === "AbortError") ||
    /timed out|TimeoutError|aborted/i.test(msg)
  ) {
    return `timed out after ${timeoutMs}ms`;
  }
  return msg || (e instanceof Error ? e.name : "error");
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

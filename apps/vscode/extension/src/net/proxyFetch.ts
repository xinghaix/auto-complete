import * as http from "node:http";
import * as https from "node:https";
import * as tls from "node:tls";
import type * as net from "node:net";
import { getVscode } from "../vscodeApi";

export interface ProxyFetchConfig {
  /** Explicit proxy URL (from VS Code `http.proxy` or env). Empty/undefined = direct. */
  proxyUrl?: string;
  /** Whether `proxyUrl` came from an explicit IDE setting vs environment variable. */
  proxyFromEnv?: boolean;
  /** Whether VS Code proxy support is explicitly disabled (`http.proxySupport === "off"`). */
  proxyDisabled?: boolean;
  /** TLS certificate verification flag (`http.proxyStrictSSL`, default true). */
  proxyStrictSSL?: boolean;
  /** Optional `Proxy-Authorization` header value (`http.proxyAuthorization`). */
  proxyAuthorization?: string;
  /** Comma-separated bypass rules (`NO_PROXY` / `no_proxy`). */
  noProxy?: string;
}

export interface ParsedProxy {
  protocol: "http:" | "https:";
  host: string;
  hostname: string;
  port: number;
  authorization?: string;
}

export function parseProxyUrl(raw: string | undefined | null): ParsedProxy | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;

  let authorization: string | undefined;
  if (url.username || url.password) {
    const user = decodeURIComponent(url.username);
    const pass = decodeURIComponent(url.password);
    authorization = `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;
  }

  return {
    protocol: url.protocol,
    host: url.host,
    hostname: url.hostname.replace(/^\[|\]$/g, ""),
    port,
    authorization,
  };
}

function isLoopbackHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0.0.0.0";
}

/**
 * Evaluates standard `NO_PROXY` / `no_proxy` rules against a target URL.
 */
export function shouldBypassProxy(targetUrl: string, noProxy?: string): boolean {
  const raw = (noProxy ?? "").trim();
  if (!raw) return false;
  let target: URL;
  try {
    target = new URL(targetUrl);
  } catch {
    return false;
  }
  const host = target.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const port = target.port || (target.protocol === "https:" ? "443" : "80");

  for (const token of raw.split(",")) {
    const rule = token.trim().toLowerCase();
    if (!rule) continue;
    if (rule === "*") return true;

    let ruleHost = rule;
    let rulePort = "";
    const ipv6Match = /^\[([^\]]+)\](?::(\d+))?$/.exec(rule);
    if (ipv6Match) {
      ruleHost = ipv6Match[1]!;
      rulePort = ipv6Match[2] ?? "";
    } else {
      const colon = rule.lastIndexOf(":");
      if (colon > 0 && /^\d+$/.test(rule.slice(colon + 1))) {
        ruleHost = rule.slice(0, colon);
        rulePort = rule.slice(colon + 1);
      }
    }
    if (rulePort && rulePort !== port) continue;

    if (ruleHost.startsWith(".")) {
      const suffix = ruleHost.slice(1);
      if (host === suffix || host.endsWith(ruleHost)) return true;
    } else if (ruleHost.startsWith("*.")) {
      const suffix = ruleHost.slice(2);
      if (host === suffix || host.endsWith(`.${suffix}`)) return true;
    } else if (host === ruleHost || host.endsWith(`.${ruleHost}`)) {
      return true;
    }
  }
  return false;
}

/**
 * Resolves the effective proxy configuration for a given target URL.
 * Returns `null` when traffic should go directly without a proxy.
 */
export function resolveEffectiveProxy(
  targetUrl: string,
  config: ProxyFetchConfig,
): ParsedProxy | null {
  if (config.proxyDisabled) return null;
  const parsed = parseProxyUrl(config.proxyUrl);
  if (!parsed) return null;
  if (shouldBypassProxy(targetUrl, config.noProxy)) return null;
  if (config.proxyFromEnv) {
    try {
      const u = new URL(targetUrl);
      if (isLoopbackHost(u.hostname)) return null;
    } catch {
      /* ignore */
    }
  }
  return parsed;
}

/** Reads VS Code's `http.*` settings with environment proxy fallbacks. */
export function readVsCodeHttpProxyConfig(targetUrl?: string): ProxyFetchConfig {
  const vscode = getVscode();
  const cfg = vscode.workspace.getConfiguration("http");
  const support = (cfg.get<string>("proxySupport") ?? "override").toLowerCase();
  const proxyDisabled = support === "off";
  const strictSSL = cfg.get<boolean>("proxyStrictSSL", true);
  const proxyAuthorization = (cfg.get<string>("proxyAuthorization") ?? "").trim() || undefined;
  const ideProxy = (cfg.get<string>("proxy") ?? "").trim();
  const noProxy = process.env.NO_PROXY || process.env.no_proxy || "";

  if (ideProxy) {
    return {
      proxyUrl: ideProxy,
      proxyFromEnv: false,
      proxyDisabled,
      proxyStrictSSL: strictSSL,
      proxyAuthorization,
      noProxy,
    };
  }

  const isHttps = targetUrl ? targetUrl.trim().toLowerCase().startsWith("https:") : true;
  const envProxy = isHttps
    ? process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy ||
      ""
    : process.env.HTTP_PROXY || process.env.http_proxy || "";

  return {
    proxyUrl: envProxy.trim() || undefined,
    proxyFromEnv: Boolean(envProxy.trim()),
    proxyDisabled,
    proxyStrictSSL: strictSSL,
    proxyAuthorization,
    noProxy,
  };
}

/**
 * Creates a `fetch`-compatible function honoring enterprise HTTP(S) proxy and
 * `http.proxyStrictSSL` settings using only Node built-ins.
 * Falls back directly to `fallbackFetch` (`globalThis.fetch`) when no proxy
 * applies and strict SSL is enabled.
 */
export function createProxyFetch(
  getConfig: (targetUrl: string) => ProxyFetchConfig,
  fallbackFetch: typeof fetch = globalThis.fetch.bind(globalThis),
): typeof fetch {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const urlStr =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const cfg = getConfig(urlStr);
    const proxy = resolveEffectiveProxy(urlStr, cfg);
    const strictSSL = cfg.proxyStrictSSL !== false;
    const isHttpsTarget = urlStr.trim().toLowerCase().startsWith("https:");

    // Fast path: standard direct request with default strict TLS verification.
    if (!proxy && (strictSSL || !isHttpsTarget)) {
      return fallbackFetch(input, init);
    }

    return nodeProxyRequest(urlStr, init, proxy, strictSSL, cfg.proxyAuthorization);
  };
}

/** Creates a proxy-aware `fetch` backed by live VS Code `http.*` configuration. */
export function createVsCodeProxyFetch(
  fallbackFetch: typeof fetch = globalThis.fetch.bind(globalThis),
): typeof fetch {
  return createProxyFetch((url) => readVsCodeHttpProxyConfig(url), fallbackFetch);
}

function makeAbortError(): Error {
  const err = new Error("The operation was aborted.");
  err.name = "AbortError";
  return err;
}

function normalizeHeaders(input: RequestInit["headers"] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;
  if (input instanceof Headers) {
    input.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }
  if (Array.isArray(input)) {
    for (const [k, v] of input) {
      out[k] = v;
    }
    return out;
  }
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) out[k] = String(v);
  }
  return out;
}

async function readBodyBuffer(
  body: RequestInit["body"] | null | undefined,
): Promise<Buffer | undefined> {
  if (body == null) return undefined;
  if (typeof body === "string") return Buffer.from(body, "utf8");
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }
  if (body instanceof URLSearchParams) return Buffer.from(body.toString(), "utf8");
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return Buffer.from(await body.arrayBuffer());
  }
  return Buffer.from(String(body), "utf8");
}

function toWebResponse(res: http.IncomingMessage, signal?: AbortSignal | null): Response {
  const headers = new Headers();
  for (const [k, v] of Object.entries(res.headers)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      for (const item of v) headers.append(k, item);
    } else {
      headers.set(k, v);
    }
  }

  const status = res.statusCode ?? 500;
  const statusText = res.statusMessage ?? "";
  // Status codes without a body per Fetch spec.
  if (status === 204 || status === 205 || status === 304) {
    res.resume();
    return new Response(null, { status, statusText, headers });
  }

  let abortListener: (() => void) | null = null;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const cleanup = () => {
        if (abortListener && signal) {
          signal.removeEventListener("abort", abortListener);
          abortListener = null;
        }
      };
      if (signal) {
        if (signal.aborted) {
          res.destroy();
          controller.error(makeAbortError());
          return;
        }
        abortListener = () => {
          cleanup();
          res.destroy();
          try {
            controller.error(makeAbortError());
          } catch {
            /* already closed */
          }
        };
        signal.addEventListener("abort", abortListener, { once: true });
      }
      res.on("data", (chunk: Buffer | string) => {
        try {
          controller.enqueue(
            typeof chunk === "string" ? Buffer.from(chunk, "utf8") : new Uint8Array(chunk),
          );
        } catch {
          res.destroy();
        }
      });
      res.on("end", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
      res.on("error", (err) => {
        cleanup();
        try {
          controller.error(err);
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      if (abortListener && signal) {
        signal.removeEventListener("abort", abortListener);
        abortListener = null;
      }
      res.destroy();
    },
  });

  return new Response(body, { status, statusText, headers });
}

function openConnectTunnel(
  proxy: ParsedProxy,
  targetHost: string,
  targetPort: number,
  strictSSL: boolean,
  proxyAuth: string | undefined,
  signal?: AbortSignal | null,
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(makeAbortError());
      return;
    }
    const connectHeaders: Record<string, string> = {
      Host: `${targetHost}:${targetPort}`,
    };
    const auth = proxyAuth || proxy.authorization;
    if (auth) connectHeaders["Proxy-Authorization"] = auth;

    const connectReq =
      proxy.protocol === "https:"
        ? https.request({
            host: proxy.hostname,
            port: proxy.port,
            method: "CONNECT",
            path: `${targetHost}:${targetPort}`,
            headers: connectHeaders,
            rejectUnauthorized: strictSSL,
          })
        : http.request({
            host: proxy.hostname,
            port: proxy.port,
            method: "CONNECT",
            path: `${targetHost}:${targetPort}`,
            headers: connectHeaders,
          });

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener("abort", onAbort);
      fn();
    };
    const onAbort = () => {
      connectReq.destroy();
      finish(() => reject(makeAbortError()));
    };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });

    connectReq.on("connect", (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        finish(() =>
          reject(new Error(`Proxy CONNECT ${targetHost}:${targetPort} failed: HTTP ${res.statusCode ?? 0}`)),
        );
        return;
      }
      finish(() => resolve(socket));
    });
    connectReq.on("error", (err) => {
      finish(() => reject(err));
    });
    connectReq.end();
  });
}

async function nodeProxyRequest(
  urlStr: string,
  init: RequestInit | undefined,
  proxy: ParsedProxy | null,
  strictSSL: boolean,
  proxyAuthorization: string | undefined,
): Promise<Response> {
  const signal = init?.signal;
  if (signal?.aborted) throw makeAbortError();

  const target = new URL(urlStr);
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = normalizeHeaders(init?.headers);
  const bodyBuf = await readBodyBuffer(init?.body);
  if (bodyBuf && !Object.keys(headers).some((k) => k.toLowerCase() === "content-length")) {
    headers["Content-Length"] = String(bodyBuf.byteLength);
  }

  const isHttps = target.protocol === "https:";
  const targetPort = target.port ? Number(target.port) : isHttps ? 443 : 80;
  const targetHostname = target.hostname.replace(/^\[|\]$/g, "");

  // Case 1: HTTPS target through HTTP/HTTPS proxy via CONNECT tunnel.
  if (proxy && isHttps) {
    const tunnelSocket = await openConnectTunnel(
      proxy,
      targetHostname,
      targetPort,
      strictSSL,
      proxyAuthorization,
      signal,
    );
    return new Promise<Response>((resolve, reject) => {
      if (signal?.aborted) {
        tunnelSocket.destroy();
        reject(makeAbortError());
        return;
      }
      const tlsSocket = tls.connect({
        socket: tunnelSocket,
        servername: targetHostname,
        rejectUnauthorized: strictSSL,
      });
      const req = https.request(
        {
          host: targetHostname,
          port: targetPort,
          path: `${target.pathname}${target.search}`,
          method,
          headers: { Host: target.host, ...headers },
          agent: false,
          createConnection: () => tlsSocket,
        },
        (res) => {
          cleanup();
          resolve(toWebResponse(res, signal));
        },
      );
      const onAbort = () => {
        cleanup();
        req.destroy();
        tlsSocket.destroy();
        tunnelSocket.destroy();
        reject(makeAbortError());
      };
      const cleanup = () => {
        if (signal) signal.removeEventListener("abort", onAbort);
      };
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      req.on("error", (err) => {
        cleanup();
        tlsSocket.destroy();
        tunnelSocket.destroy();
        reject(err);
      });
      if (bodyBuf) req.write(bodyBuf);
      req.end();
    });
  }

  // Case 2: HTTP target through HTTP/HTTPS proxy (absolute-URI forwarding).
  if (proxy && !isHttps) {
    const reqHeaders: Record<string, string> = {
      Host: target.host,
      ...headers,
    };
    const auth = proxyAuthorization || proxy.authorization;
    if (auth) reqHeaders["Proxy-Authorization"] = auth;

    return new Promise<Response>((resolve, reject) => {
      if (signal?.aborted) {
        reject(makeAbortError());
        return;
      }
      const req =
        proxy.protocol === "https:"
          ? https.request(
              {
                host: proxy.hostname,
                port: proxy.port,
                path: target.toString(),
                method,
                headers: reqHeaders,
                rejectUnauthorized: strictSSL,
              },
              (res) => {
                cleanup();
                resolve(toWebResponse(res, signal));
              },
            )
          : http.request(
              {
                host: proxy.hostname,
                port: proxy.port,
                path: target.toString(),
                method,
                headers: reqHeaders,
              },
              (res) => {
                cleanup();
                resolve(toWebResponse(res, signal));
              },
            );
      const onAbort = () => {
        cleanup();
        req.destroy();
        reject(makeAbortError());
      };
      const cleanup = () => {
        if (signal) signal.removeEventListener("abort", onAbort);
      };
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      req.on("error", (err) => {
        cleanup();
        reject(err);
      });
      if (bodyBuf) req.write(bodyBuf);
      req.end();
    });
  }

  // Case 3: Direct HTTPS with `proxyStrictSSL === false` (custom/self-signed enterprise CA).
  return new Promise<Response>((resolve, reject) => {
    if (signal?.aborted) {
      reject(makeAbortError());
      return;
    }
    const req = https.request(
      {
        host: targetHostname,
        port: targetPort,
        path: `${target.pathname}${target.search}`,
        method,
        headers: { Host: target.host, ...headers },
        rejectUnauthorized: strictSSL,
      },
      (res) => {
        cleanup();
        resolve(toWebResponse(res, signal));
      },
    );
    const onAbort = () => {
      cleanup();
      req.destroy();
      reject(makeAbortError());
    };
    const cleanup = () => {
      if (signal) signal.removeEventListener("abort", onAbort);
    };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
    req.on("error", (err) => {
      cleanup();
      reject(err);
    });
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

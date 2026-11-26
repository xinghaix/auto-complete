import assert from "node:assert/strict";
import * as http from "node:http";
import { describe, it } from "node:test";
import {
  createProxyFetch,
  parseProxyUrl,
  resolveEffectiveProxy,
  shouldBypassProxy,
} from "./proxyFetch.js";

describe("proxyFetch", () => {
  it("parses valid http/https proxy URLs including credentials and rejects invalid ones", () => {
    const p1 = parseProxyUrl("http://proxy.corp.local:8080");
    assert.deepEqual(p1, {
      protocol: "http:",
      host: "proxy.corp.local:8080",
      hostname: "proxy.corp.local",
      port: 8080,
      authorization: undefined,
    });

    const p2 = parseProxyUrl("https://alice:s3cr3t@proxy.corp.local");
    assert.equal(p2?.protocol, "https:");
    assert.equal(p2?.port, 443);
    assert.equal(
      p2?.authorization,
      `Basic ${Buffer.from("alice:s3cr3t", "utf8").toString("base64")}`,
    );

    assert.equal(parseProxyUrl(""), null);
    assert.equal(parseProxyUrl("socks5://127.0.0.1:1080"), null);
    assert.equal(parseProxyUrl("not a url"), null);
  });

  it("evaluates NO_PROXY rules and env loopback bypass accurately", () => {
    assert.equal(shouldBypassProxy("https://internal.corp.local/v1", "corp.local"), true);
    assert.equal(shouldBypassProxy("https://api.openai.com/v1", "corp.local"), false);
    assert.equal(shouldBypassProxy("https://sub.example.com:8443/v1", ".example.com:8443"), true);
    assert.equal(shouldBypassProxy("https://sub.example.com:443/v1", ".example.com:8443"), false);
    assert.equal(shouldBypassProxy("http://any.host/v1", "*"), true);

    // Env proxy bypasses localhost; explicit IDE proxy does not unless in NO_PROXY.
    assert.equal(
      resolveEffectiveProxy("http://127.0.0.1:11434/v1", {
        proxyUrl: "http://proxy.local:8080",
        proxyFromEnv: true,
      }),
      null,
    );
    assert.notEqual(
      resolveEffectiveProxy("http://127.0.0.1:11434/v1", {
        proxyUrl: "http://proxy.local:8080",
        proxyFromEnv: false,
      }),
      null,
    );
    assert.equal(
      resolveEffectiveProxy("https://api.example.com/v1", {
        proxyUrl: "http://proxy.local:8080",
        proxyDisabled: true,
      }),
      null,
    );
  });

  it("falls back directly to global/fallback fetch when no proxy is configured and proxyStrictSSL is true", async () => {
    let fallbackCalled = 0;
    const fakeFallback: typeof fetch = async (input) => {
      fallbackCalled += 1;
      return new Response(`direct:${String(input)}`, { status: 200 });
    };

    const fetcher = createProxyFetch(() => ({ proxyStrictSSL: true }), fakeFallback);
    const res = await fetcher("https://api.example.test/v1/models");
    assert.equal(fallbackCalled, 1);
    assert.equal(await res.text(), "direct:https://api.example.test/v1/models");
  });

  it("routes HTTP traffic through a configured HTTP proxy with Proxy-Authorization header", async () => {
    let seenUrl = "";
    let seenProxyAuth = "";
    let seenBody = "";
    const proxyServer = http.createServer((req, res) => {
      seenUrl = req.url ?? "";
      seenProxyAuth = String(req.headers["proxy-authorization"] ?? "");
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        seenBody = Buffer.concat(chunks).toString("utf8");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });

    await new Promise<void>((resolve) => proxyServer.listen(0, "127.0.0.1", () => resolve()));
    const addr = proxyServer.address() as { port: number };
    try {
      const fetcher = createProxyFetch(() => ({
        proxyUrl: `http://user:pass@127.0.0.1:${addr.port}`,
        proxyFromEnv: false,
        proxyStrictSSL: true,
      }));
      const res = await fetcher("http://upstream.example.test/v1/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"prompt":"hi"}',
      });
      assert.equal(res.status, 200);
      assert.equal(await res.text(), '{"ok":true}');
      assert.equal(seenUrl, "http://upstream.example.test/v1/completions");
      assert.equal(
        seenProxyAuth,
        `Basic ${Buffer.from("user:pass", "utf8").toString("base64")}`,
      );
      assert.equal(seenBody, '{"prompt":"hi"}');
    } finally {
      await new Promise<void>((resolve) => proxyServer.close(() => resolve()));
    }
  });
});

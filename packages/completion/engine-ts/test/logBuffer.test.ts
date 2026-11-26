import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatLogSummary,
  isEnabledBy,
  LogBuffer,
  parseLogLevel,
  type LogEntry,
} from "../src/logBuffer.js";

describe("LogBuffer", () => {
  it("parses log levels and compares thresholds", () => {
    assert.equal(parseLogLevel("debug"), "DEBUG");
    assert.equal(parseLogLevel("WARN"), "WARN");
    assert.equal(parseLogLevel("unknown"), "INFO");
    assert.equal(isEnabledBy("DEBUG", "info"), false);
    assert.equal(isEnabledBy("INFO", "info"), true);
    assert.equal(isEnabledBy("ERROR", "warn"), true);
  });

  it("clamps retention, trims old entries, and supports clear", () => {
    const buf = new LogBuffer(10); // clamps to MIN_RETENTION = 50
    assert.equal(buf.getRetention(), LogBuffer.MIN_RETENTION);
    for (let i = 0; i < 60; i++) {
      buf.append({ time: `t${i}`, level: "INFO", message: `m${i}` });
    }
    assert.equal(buf.snapshot().length, 50);
    assert.equal(buf.snapshot()[0]?.message, "m10");
    buf.clear();
    assert.equal(buf.snapshot().length, 0);
  });

  it("dispatches listeners safely even when a listener throws or unsubscribes itself", () => {
    const buf = new LogBuffer();
    const seen: string[] = [];
    const selfRemoving = (e: LogEntry) => {
      seen.push(`self:${e.message}`);
      buf.removeListener(selfRemoving);
    };
    buf.addListener(() => {
      throw new Error("boom");
    });
    buf.addListener(selfRemoving);
    buf.addListener((e) => seen.push(`second:${e.message}`));

    buf.appendIfEnabled({ time: "t1", level: "DEBUG", message: "skip" }, "info");
    buf.appendIfEnabled({ time: "t2", level: "INFO", message: "one" }, "info");
    buf.appendIfEnabled({ time: "t3", level: "WARN", message: "two" }, "info");

    assert.deepEqual(seen, ["self:one", "second:one", "second:two"]);
  });

  it("formats structured log summaries", () => {
    const s = formatLogSummary({
      time: "2026-01-01T00:00:00Z",
      level: "INFO",
      requestId: "r1",
      file: "/a/b/main.ts",
      trigger: "AUTO",
      operation: "completion",
      method: "POST",
      url: "http://127.0.0.1:11434/v1/completions",
      model: "qwen2.5-coder:7b",
      status: 200,
      latencyMs: 42,
      message: "ok",
    });
    assert.ok(s.includes("main.ts"));
    assert.ok(s.includes("http=200"));
    assert.ok(s.includes("42ms"));
  });
});

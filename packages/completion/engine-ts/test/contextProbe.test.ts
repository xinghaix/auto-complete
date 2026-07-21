import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspectContext } from "../src/contextProbe.ts";

describe("inspectContext", () => {
  it("detects // line comments in TypeScript", () => {
    const r = inspectContext("const x = 1;\n// note", "typescript");
    assert.equal(r.inComment, true);
    assert.equal(r.inString, false);
  });

  it("detects block comments", () => {
    const r = inspectContext("/* open\nstill", "java");
    assert.equal(r.inComment, true);
  });

  it("detects double-quoted strings", () => {
    const r = inspectContext('const s = "hello', "javascript");
    assert.equal(r.inString, true);
    assert.equal(r.inComment, false);
  });

  it("detects # comments in Python", () => {
    const r = inspectContext("x = 1\n# todo", "python");
    assert.equal(r.inComment, true);
  });

  it("returns false outside comment/string", () => {
    const r = inspectContext("function foo() {\n  ", "typescript");
    assert.equal(r.inComment, false);
    assert.equal(r.inString, false);
  });

  it("handles escaped quotes inside strings", () => {
    const r = inspectContext('const s = "a\\"b', "javascript");
    assert.equal(r.inString, true);
  });
});

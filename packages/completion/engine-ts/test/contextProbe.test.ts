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

  it("recognizes lines starting with // or # inside multiline strings as strings, not comments", () => {
    const tsTemplate = inspectContext("const s = `hello\n// not a comment", "typescript");
    assert.equal(tsTemplate.inString, true);
    assert.equal(tsTemplate.inComment, false);

    const pyTriple = inspectContext('doc = """line1\n# still docstring', "python");
    assert.equal(pyTriple.inString, true);
    assert.equal(pyTriple.inComment, false);

    const pySingleTriple = inspectContext("doc = '''line1\n# still docstring", "python");
    assert.equal(pySingleTriple.inString, true);
    assert.equal(pySingleTriple.inComment, false);
  });

  it("ignores Rust lifetimes and closed char literals without poisoning subsequent code", () => {
    const r = inspectContext(
      "fn first<'a>(x: &'a str, y: &'static str) -> &'a str {\n  let c = 'z';\n  let out = ",
      "rust",
    );
    assert.equal(r.inString, false);
    assert.equal(r.inComment, false);
  });

  it("resets unclosed single-line quotes on newline", () => {
    const r = inspectContext('const broken = "unclosed\nconst ok = ', "typescript");
    assert.equal(r.inString, false);
    assert.equal(r.inComment, false);
  });

  it("supports SQL -- line comments and HTML <!-- --> comments", () => {
    const sql = inspectContext("SELECT 1;\n-- filter active", "sql");
    assert.equal(sql.inComment, true);
    assert.equal(sql.inString, false);

    const htmlOpen = inspectContext("<div>\n<!-- pending", "html");
    assert.equal(htmlOpen.inComment, true);

    const htmlClosed = inspectContext("<!-- done -->\n<div>", "html");
    assert.equal(htmlClosed.inComment, false);
  });
});

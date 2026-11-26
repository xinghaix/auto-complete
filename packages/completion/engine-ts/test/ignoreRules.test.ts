import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_GLOBS, IgnoreRules } from "../src/ignoreRules.js";

describe("IgnoreRules", () => {
  it("never falsely ignores rebuild, builder, build.gradle.kts, redist, or my.logger", () => {
    const rules = new IgnoreRules([...DEFAULT_GLOBS, "build", "*.log"], false);
    assert.equal(rules.isIgnored("/proj/src/rebuild/app.ts", "src/rebuild/app.ts"), false);
    assert.equal(rules.isIgnored("/proj/src/builder.ts", "src/builder.ts"), false);
    assert.equal(rules.isIgnored("/proj/build.gradle.kts", "build.gradle.kts"), false);
    assert.equal(rules.isIgnored("/proj/src/redist/a.ts", "src/redist/a.ts"), false);
    assert.equal(rules.isIgnored("/proj/src/my.logger.ts", "src/my.logger.ts"), false);

    assert.equal(rules.isIgnored("/proj/build/out.js", "build/out.js"), true);
    assert.equal(rules.isIgnored("/proj/packages/ui/dist/app.js", "packages/ui/dist/app.js"), true);
    assert.equal(rules.isIgnored("/proj/logs/debug.log", "logs/debug.log"), true);
  });

  it("normalizes trailing-slash dir/ to match nested directory contents", () => {
    const rules = new IgnoreRules(["build/", "cache/"], false);
    assert.equal(rules.isIgnored("/proj/build/a.js", "build/a.js"), true);
    assert.equal(rules.isIgnored("/proj/sub/build/a.js", "sub/build/a.js"), true);
    assert.equal(rules.isIgnored("/proj/src/cache/item.json", "src/cache/item.json"), true);
    assert.equal(rules.isIgnored("/proj/src/build.ts", "src/build.ts"), false);
    assert.equal(rules.isIgnored("/proj/src/rebuild/a.ts", "src/rebuild/a.ts"), false);
  });

  it("respects root-anchored /foo rules against relative paths", () => {
    const rules = new IgnoreRules(["/dist/", "/secret.env"], false);
    assert.equal(rules.isIgnored("/proj/dist/bundle.js", "dist/bundle.js"), true);
    assert.equal(rules.isIgnored("/proj/packages/a/dist/bundle.js", "packages/a/dist/bundle.js"), false);
    assert.equal(rules.isIgnored("/proj/secret.env", "secret.env"), true);
    assert.equal(rules.isIgnored("/proj/sub/secret.env", "sub/secret.env"), false);
  });

  it("supports ! negation rules in globs and parsed .gitignore", () => {
    const parsed = IgnoreRules.parseGitignore("# comment\n*.log\n!important.log\nbuild/\n");
    const rules = new IgnoreRules([], true, parsed);
    assert.equal(rules.isIgnored("/proj/app.log", "app.log"), true);
    assert.equal(rules.isIgnored("/proj/important.log", "important.log"), false);
    assert.equal(rules.isIgnored("/proj/build/out.txt", "build/out.txt"), true);
  });

  it("handles empty globs cleanly without forcing DEFAULT_GLOBS", () => {
    const rules = new IgnoreRules([], false);
    assert.equal(rules.isIgnored("/proj/build/app.ts", "build/app.ts"), false);
    assert.equal(rules.isIgnored("/proj/dist/app.ts", "dist/app.ts"), false);
    // Hard-ignored VCS/deps still protected
    assert.equal(rules.isIgnored("/proj/node_modules/pkg/index.js"), true);
    assert.equal(rules.isIgnored("/proj/.git/config"), true);
  });
});

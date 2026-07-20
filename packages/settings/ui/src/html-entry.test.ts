import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { ensureScriptAfterRoot, scriptsRunAfterRoot } from "./html-entry.ts";

const here = dirname(fileURLToPath(import.meta.url));
const distHtml = join(here, "../dist/index.html");
const pluginHtml = join(
  here,
  "../../../apps/jetbrains/plugin/src/main/resources/settings-ui/index.html",
);

describe("ensureScriptAfterRoot", () => {
  it("moves head script after #root and strips type=module", () => {
    const broken = `<!DOCTYPE html>
<html>
  <head>
    <script type="module" crossorigin src="./assets/index.js"></script>
    <link rel="stylesheet" href="./assets/style.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;
    const fixed = ensureScriptAfterRoot(broken);
    assert.equal(scriptsRunAfterRoot(fixed), true);
    assert.ok(!/type="module"/.test(fixed));
    assert.ok(!/crossorigin/.test(fixed));
    const rootPos = fixed.indexOf('id="root"');
    const scriptPos = fixed.indexOf("assets/index.js");
    assert.ok(rootPos >= 0 && scriptPos > rootPos, "script must follow #root");
  });

  it("built dist/index.html has script after #root (real ship artifact)", () => {
    assert.ok(existsSync(distHtml), "run build:settings-ui first so dist exists");
    const html = readFileSync(distHtml, "utf8");
    assert.equal(scriptsRunAfterRoot(html), true);
    assert.ok(!/type="module"/.test(html));
    assert.match(html, /<div id="root"><\/div>/);
    assert.match(html, /assets\/index\.js/);
  });

  it("plugin copy of index.html also has script after #root", () => {
    if (!existsSync(pluginHtml)) {
      // copySettingsUi may not have run in pure unit env
      return;
    }
    const html = readFileSync(pluginHtml, "utf8");
    assert.equal(scriptsRunAfterRoot(html), true);
  });
});

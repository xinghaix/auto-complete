import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("./App.vue", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

test("About card version matches the settings-ui package version", () => {
  assert.match(appSource, new RegExp(`const appVersion = "${packageJson.version}";`));
});

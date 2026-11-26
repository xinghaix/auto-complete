import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

type PackageManifest = {
  version: string;
};

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8")) as T;
}

const rootPackage = readJson<PackageManifest>("../../../../package.json");
const vscodePackage = readJson<PackageManifest>("../../../../apps/vscode/extension/package.json");
const settingsUiPackage = readJson<PackageManifest>("../package.json");
const engineTsPackage = readJson<PackageManifest>("../../../completion/engine-ts/package.json");
const contractsPackage = readJson<PackageManifest>("../../../completion/contracts/package.json");

const appSource = readFileSync(new URL("./App.vue", import.meta.url), "utf8");
const gradleProperties = readFileSync(new URL("../../../../gradle.properties", import.meta.url), "utf8");
const changelog = readFileSync(new URL("../../../../CHANGELOG.md", import.meta.url), "utf8");

test("release versions stay aligned across all manifests, App.vue, gradle.properties, and CHANGELOG.md", () => {
  const expected = rootPackage.version;
  assert.match(expected, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);

  const gradleMatch = gradleProperties.match(/^pluginVersion=(.+)$/m);
  assert.ok(gradleMatch, "gradle.properties must define pluginVersion");
  assert.equal(gradleMatch[1].trim(), expected, "gradle.properties pluginVersion");

  assert.equal(vscodePackage.version, expected, "apps/vscode/extension/package.json");
  assert.equal(settingsUiPackage.version, expected, "packages/settings/ui/package.json");
  assert.equal(engineTsPackage.version, expected, "packages/completion/engine-ts/package.json");
  assert.equal(contractsPackage.version, expected, "packages/completion/contracts/package.json");

  const appMatch = appSource.match(/const (?:appVersion|APP_VERSION)\s*=\s*"([^"]+)";/);
  assert.ok(appMatch, "packages/settings/ui/src/App.vue must define appVersion / APP_VERSION");
  assert.equal(appMatch[1], expected, "packages/settings/ui/src/App.vue version");

  const changelogMatch = changelog.match(/^## \[(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\]/m);
  assert.ok(changelogMatch, "CHANGELOG.md must have a released version heading ## [X.Y.Z]");
  assert.equal(changelogMatch[1], expected, "CHANGELOG.md top released version heading");
});

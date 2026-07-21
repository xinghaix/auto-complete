/**
 * Build extension + package .vsix into dist-vsix/auto-complete-<version>.vsix
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const monorepoRoot = join(root, "../../..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = pkg.version || "0.0.0";
const outDir = join(root, "dist-vsix");
const outFile = join(outDir, `auto-complete-${version}.vsix`);
const rootLicense = join(monorepoRoot, "LICENSE");
const extLicense = join(root, "LICENSE");

mkdirSync(outDir, { recursive: true });

function run(cmd, args, cwd = root) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// vsce looks for LICENSE next to package.json; monorepo keeps the canonical file at repo root.
if (!existsSync(rootLicense)) {
  console.error(`Missing monorepo LICENSE at ${rootLicense}`);
  process.exit(1);
}
copyFileSync(rootLicense, extLicense);

run("node", [join(root, "scripts/build.mjs")]);
run(
  "npx",
  ["--yes", "@vscode/vsce", "package", "--no-dependencies", "-o", outFile],
  root,
);

console.log(`VS Code VSIX -> ${outFile}`);

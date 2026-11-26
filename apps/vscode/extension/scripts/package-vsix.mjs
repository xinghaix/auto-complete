/**
 * Build extension + package .vsix into dist-vsix/auto-complete-<version>.vsix
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const PINNED_VSCE = "@vscode/vsce@3.2.2";

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

function findLocalVsce() {
  const binName = process.platform === "win32" ? "vsce.cmd" : "vsce";
  const candidates = [
    join(root, "node_modules", ".bin", binName),
    join(monorepoRoot, "node_modules", ".bin", binName),
  ];
  return candidates.find((p) => existsSync(p));
}

// vsce looks for LICENSE next to package.json; monorepo keeps the canonical file at repo root.
if (!existsSync(rootLicense)) {
  console.error(`Missing monorepo LICENSE at ${rootLicense}`);
  process.exit(1);
}
copyFileSync(rootLicense, extLicense);

run("node", [join(root, "scripts/build.mjs")]);

const localVsce = findLocalVsce();
if (localVsce) {
  run(localVsce, ["package", "--no-dependencies", "-o", outFile], root);
} else {
  run("npx", ["--yes", PINNED_VSCE, "package", "--no-dependencies", "-o", outFile], root);
}

console.log(`VS Code VSIX -> ${outFile}`);

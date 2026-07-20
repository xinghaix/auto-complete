import * as esbuild from "esbuild";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

await esbuild.build({
  entryPoints: [join(root, "src/extension.ts")],
  bundle: true,
  outfile: join(root, "dist/extension.js"),
  external: ["vscode"],
  platform: "node",
  format: "cjs",
  target: "node18",
  sourcemap: true,
  // Resolve workspace TypeScript package source
  alias: {
    "@auto-complete/core-ts": join(root, "../../../packages/completion/engine-ts/src/index.ts"),
  },
});

const uiDist = join(root, "../../../packages/settings/ui/dist");
const dest = join(root, "dist/webview");
if (existsSync(uiDist)) {
  // Replace webview tree so stale hashed assets are not packaged into .vsix
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(uiDist, dest, { recursive: true });
  console.log("copied settings-ui -> dist/webview");
} else {
  console.log("settings-ui dist missing; webview uses embedded fallback");
}

console.log("vscode extension bundled -> dist/extension.js");

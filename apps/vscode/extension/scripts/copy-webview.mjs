import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "../../../packages/settings/ui/dist");
const dest = join(root, "dist/webview");

if (existsSync(src)) {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log("copied settings-ui dist -> apps/vscode/extension/dist/webview");
} else {
  console.log("settings-ui dist not found; using embedded fallback HTML");
}

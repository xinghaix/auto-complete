import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { ensureScriptAfterRoot } from "./src/html-entry";

/**
 * IIFE + classic script tags so the bundle runs under JCEF `file://`
 * (Chromium blocks ES modules as cross-origin on file URLs → blank page).
 * VS Code Webview also accepts classic scripts with relative base.
 *
 * Script must appear AFTER #root: sync IIFE in <head> runs before body parses,
 * getElementById("root") is null, and the settings page stays blank.
 */
export default defineConfig({
  plugins: [
    vue(),
    {
      name: "jcef-classic-scripts",
      transformIndexHtml: {
        order: "post",
        handler(html) {
          return ensureScriptAfterRoot(html);
        },
      },
    },
  ],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsDir: "assets",
    cssCodeSplit: false,
    modulePreload: false,
    target: "es2020",
    rollupOptions: {
      output: {
        format: "iife",
        name: "AutoCompleteSettingsUi",
        inlineDynamicImports: true,
        entryFileNames: "assets/index.js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
  server: {
    port: 5173,
  },
});

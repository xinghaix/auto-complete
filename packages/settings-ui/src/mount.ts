import { createApp, type App as VueApp, type Component } from "vue";

export type CreateAppFn = typeof createApp;

/**
 * Mount the settings App onto #root.
 * - If #root exists now (script after body root): mount immediately.
 * - If not yet (script still in head before body parses): wait for DOMContentLoaded.
 */
export function mountSettingsApp(
  App: Component,
  doc: Document = document,
  createAppFn: CreateAppFn = createApp,
): VueApp | null {
  const tryMount = (): VueApp | null => {
    const root = doc.getElementById("root");
    if (!root) return null;
    const marker = root as HTMLElement & { __acMounted?: boolean };
    if (marker.__acMounted) return null;
    const app = createAppFn(App);
    app.mount(root);
    marker.__acMounted = true;
    return app;
  };

  const existing = tryMount();
  if (existing) return existing;

  if (doc.readyState === "loading") {
    doc.addEventListener(
      "DOMContentLoaded",
      () => {
        tryMount();
      },
      { once: true },
    );
  }
  return null;
}

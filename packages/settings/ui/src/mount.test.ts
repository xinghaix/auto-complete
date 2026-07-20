import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Component } from "vue";
import { mountSettingsApp, type CreateAppFn } from "./mount.ts";

/** Minimal Document stub — drives real mountSettingsApp without Vue DOM. */
function makeDoc(opts: {
  root: boolean;
  readyState: DocumentReadyState;
}): {
  doc: Document;
  fireDomContentLoaded: () => void;
  mountCalls: { app: Component; el: HTMLElement }[];
  rootEl: HTMLElement | null;
} {
  const mountCalls: { app: Component; el: HTMLElement }[] = [];
  let rootEl: HTMLElement | null = opts.root
    ? ({ id: "root", __acMounted: false } as unknown as HTMLElement)
    : null;
  const listeners = new Map<string, Set<EventListener>>();

  const doc = {
    readyState: opts.readyState,
    getElementById(id: string) {
      return id === "root" ? rootEl : null;
    },
    addEventListener(type: string, fn: EventListener, _opts?: unknown) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: EventListener) {
      listeners.get(type)?.delete(fn);
    },
  } as unknown as Document;

  const createAppFn = ((App: Component) => ({
    mount(el: Element) {
      mountCalls.push({ app: App, el: el as HTMLElement });
      return this;
    },
    unmount() {},
  })) as unknown as CreateAppFn;

  return {
    doc,
    rootEl,
    mountCalls,
    fireDomContentLoaded() {
      // Simulate body parse: root appears then DOMContentLoaded
      if (!rootEl) {
        rootEl = { id: "root", __acMounted: false } as unknown as HTMLElement;
        // update getElementById closure
        (doc as unknown as { getElementById: (id: string) => HTMLElement | null }).getElementById =
          (id: string) => (id === "root" ? rootEl : null);
      }
      for (const fn of listeners.get("DOMContentLoaded") ?? []) {
        fn(new Event("DOMContentLoaded"));
      }
    },
    // expose factory for tests
    createAppFn,
  } as {
    doc: Document;
    fireDomContentLoaded: () => void;
    mountCalls: { app: Component; el: HTMLElement }[];
    rootEl: HTMLElement | null;
    createAppFn: CreateAppFn;
  };
}

const StubApp = { name: "Stub" } as Component;

describe("mountSettingsApp", () => {
  it("mounts immediately when #root exists (shipped path: script after root)", () => {
    const env = makeDoc({ root: true, readyState: "complete" });
    const app = mountSettingsApp(StubApp, env.doc, env.createAppFn);
    assert.ok(app, "returns app instance");
    assert.equal(env.mountCalls.length, 1);
    assert.equal(env.mountCalls[0].el.id, "root");
    assert.equal(env.mountCalls[0].app, StubApp);
  });

  it("defers until DOMContentLoaded when #root missing (script-in-head race)", () => {
    const env = makeDoc({ root: false, readyState: "loading" });
    const immediate = mountSettingsApp(StubApp, env.doc, env.createAppFn);
    assert.equal(immediate, null);
    assert.equal(env.mountCalls.length, 0);

    env.fireDomContentLoaded();
    assert.equal(env.mountCalls.length, 1);
    assert.equal(env.mountCalls[0].el.id, "root");
  });

  it("does not double-mount the same root", () => {
    const env = makeDoc({ root: true, readyState: "complete" });
    mountSettingsApp(StubApp, env.doc, env.createAppFn);
    const second = mountSettingsApp(StubApp, env.doc, env.createAppFn);
    assert.equal(second, null);
    assert.equal(env.mountCalls.length, 1);
  });
});

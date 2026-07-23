import type { Profile, UiTheme } from "../types";

export const LEVEL_ORDER = ["debug", "info", "warn", "error"] as const;
export const AUTOSAVE_DELAY = 800;

export type MainTab = "general" | "config" | "behavior" | "performance" | "logs";
export type SaveState = "idle" | "saving" | "saved" | "error";

export const DEFAULT_IGNORE_GLOBS = [
  "**/.git/**",
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/target/**",
  "**/.idea/**",
  "**/.gradle/**",
  "**/vendor/**",
].join("\n");

export function normalizeUiTheme(raw: unknown): UiTheme {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "light" || v === "dark") return v;
  return "auto";
}

/** Map host theme push / getPlatform theme to a concrete CSS data-theme value. */
export function normalizeHostTheme(raw?: string | null): "light" | "dark" | "high-contrast" {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "light") return "light";
  if (v === "high-contrast" || v === "highcontrast") return "high-contrast";
  return "dark";
}

export function applyResolvedTheme(preference: UiTheme, hostTheme: string): void {
  const root = document.documentElement;
  const resolved = preference === "auto" ? normalizeHostTheme(hostTheme) : preference;
  root.dataset.themePref = preference;
  root.dataset.theme = resolved;
}

export function normalizeTab(raw: string | undefined | null): MainTab {
  const v = (raw ?? "").toLowerCase();
  if (v === "logs" || v === "log") return "logs";
  if (v === "behavior" || v === "behaviour") return "behavior";
  if (v === "performance" || v === "perf") return "performance";
  if (v === "general") return "general";
  return "config";
}

export function numOr(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function ignoreGlobsFromSnapshot(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw.map((x) => String(x)).join("\n");
  return DEFAULT_IGNORE_GLOBS;
}

export function disabledLanguagesFromSnapshot(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw.map((x) => String(x)).join(", ");
  return "";
}

/** Client-side validation mirroring SettingsValidation.kt */
export function validateForm(form: Profile, hasProfiles: boolean): string[] {
  const errors: string[] = [];
  const base = (form.baseUrl ?? "").trim();
  if (hasProfiles && !base) errors.push("baseUrl is required");
  if (base) {
    try {
      const u = new URL(base);
      if (!u.protocol || !u.host) errors.push("baseUrl must be a valid URL");
    } catch {
      errors.push("baseUrl must be a valid URL");
    }
  }
  if (hasProfiles && !(form.model ?? "").trim()) errors.push("model is required");
  const timeout = form.timeoutMs ?? 3000;
  if (timeout < 500 || timeout > 60000) errors.push("timeoutMs must be 500..60000");
  const st = form.settingsTimeoutMs ?? 15000;
  if (st < 1000 || st > 60000) errors.push("settingsTimeoutMs must be 1000..60000");
  const mt = form.maxTokens ?? 128;
  if (mt < 16 || mt > 1024) errors.push("maxTokens must be 16..1024");
  if ((form.maxPrefixChars ?? 8000) <= 0) errors.push("maxPrefixChars must be > 0");
  if ((form.maxSuffixChars ?? 2000) <= 0) errors.push("maxSuffixChars must be > 0");
  const eh = form.extraHeadersJson ?? "";
  if (eh.trim()) {
    try {
      const parsed = JSON.parse(eh);
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        Object.keys(parsed).some((key) =>
          [
            "authorization",
            "proxy-authorization",
            "cookie",
            "set-cookie",
            "x-api-key",
            "api-key",
            "x-auth-token",
            "x-access-token",
          ].includes(key.trim().toLowerCase()),
        )
      ) {
        errors.push("extraHeadersJson must not contain credential headers");
      }
    } catch {
      errors.push("extraHeadersJson must be a JSON object");
    }
  }
  return errors;
}

/** Measure longest property-row label and set --label-w on the card element. */
export function measureSharedLabelWidth(card: HTMLElement): void {
  if (window.matchMedia("(max-width: 560px)").matches) {
    card.style.removeProperty("--label-w");
    return;
  }
  const labels = card.querySelectorAll<HTMLElement>(".row:not(.full) > .row-label");
  let max = 0;
  labels.forEach((el) => {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.style.cssText =
      "position:absolute;visibility:hidden;height:auto;width:auto;max-width:none;" +
      "white-space:nowrap;overflow:visible;pointer-events:none;left:-9999px;top:0";
    document.body.appendChild(clone);
    max = Math.max(max, clone.getBoundingClientRect().width);
    document.body.removeChild(clone);
  });
  if (max > 0) {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const cap = Math.min(window.innerWidth * 0.42, 16 * rem);
    const next = `${Math.min(Math.ceil(max), Math.floor(cap))}px`;
    if (card.style.getPropertyValue("--label-w") !== next) {
      card.style.setProperty("--label-w", next);
    }
  }
}

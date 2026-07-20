import { en, ja, ko, zh, type MessageKey, type Messages } from "./messages";

/**
 * UI locales for settings-ui.
 * Matches JetBrains Swing bundle coverage: English, Chinese, Japanese, Korean.
 */
export type Locale = "en" | "zh" | "ja" | "ko";

export type { MessageKey, Messages };

const dict: Record<Locale, Messages> = { en, zh, ja, ko };

const SUPPORTED: Locale[] = ["en", "zh", "ja", "ko"];

export function supportedLocales(): Locale[] {
  return [...SUPPORTED];
}

export function t(locale: Locale, key: MessageKey): string {
  return dict[locale]?.[key] ?? dict.en[key] ?? key;
}

/**
 * Map IDE / browser language tags to a supported UI locale.
 *
 * Examples:
 * - VS Code: `zh-cn`, `zh-tw`, `ja`, `ko`, `en`
 * - JetBrains: `zh-CN`, `ja-JP`, `ko-KR`, `en-US`
 * - BCP-47: `zh-Hans-CN`, `pt-BR` → fallback `en`
 */
export function detectLocale(raw?: string | null): Locale {
  if (!raw?.trim()) return "en";
  const tag = raw.trim().replace(/_/g, "-").toLowerCase();

  // Exact / prefix matches
  if (tag === "zh" || tag.startsWith("zh-")) return "zh";
  if (tag === "ja" || tag.startsWith("ja-") || tag === "jp" || tag.startsWith("jp-")) return "ja";
  if (tag === "ko" || tag.startsWith("ko-") || tag === "kr" || tag.startsWith("kr-")) return "ko";
  if (tag === "en" || tag.startsWith("en-")) return "en";

  // Primary subtag only
  const primary = tag.split("-")[0] ?? "";
  if (primary === "zh") return "zh";
  if (primary === "ja" || primary === "jp") return "ja";
  if (primary === "ko" || primary === "kr") return "ko";
  if (primary === "en") return "en";

  return "en";
}

/** Human-readable locale label (shown in native language). */
export function localeLabel(locale: Locale): string {
  switch (locale) {
    case "zh":
      return "中文";
    case "ja":
      return "日本語";
    case "ko":
      return "한국어";
    default:
      return "English";
  }
}

export function hostLabel(locale: Locale, platform: string): string {
  switch (platform) {
    case "jetbrains":
      return t(locale, "hostJetbrains");
    case "vscode":
      return t(locale, "hostVscode");
    case "mock":
      return t(locale, "hostMock");
    default:
      return platform || "?";
  }
}

/** Apply locale to document for accessibility / font fallback. */
export function applyDocumentLocale(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang =
    locale === "zh" ? "zh-CN" : locale === "ja" ? "ja" : locale === "ko" ? "ko" : "en";
}

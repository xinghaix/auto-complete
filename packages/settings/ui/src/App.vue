<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { bridge } from "./bridge/client";
import CheckRow from "./components/CheckRow.vue";
import GroupCard from "./components/GroupCard.vue";
import PropertyRow from "./components/PropertyRow.vue";
import ModelCombo from "./components/ModelCombo.vue";
import ProfileCombo from "./components/ProfileCombo.vue";
import SelectCombo from "./components/SelectCombo.vue";
import {
  applyDocumentLocale,
  detectLocale,
  localeLabel,
  supportedLocales,
  t,
  type Locale,
} from "./i18n";
import type { LogEntry, ProbeResult, Profile, Snapshot, UiTheme } from "./types";
import {
  AUTOSAVE_DELAY,
  DEFAULT_IGNORE_GLOBS,
  LEVEL_ORDER,
  applyResolvedTheme,
  disabledLanguagesFromSnapshot,
  ignoreGlobsFromSnapshot,
  normalizeHostTheme,
  normalizeTab,
  normalizeUiLocale,
  normalizeUiTheme,
  numOr,
  validateForm,
  type MainTab,
  type SaveState,
} from "./utils/helpers";

declare global {
  interface Window {
    __acPreferredTab?: string;
    __acSetTab?: (tab: string) => void;
    __acOpenTab?: (tab: string) => void;
  }
}

const tab = ref<MainTab>("config");
const locale = ref<Locale>(
  detectLocale(typeof navigator !== "undefined" ? navigator.language : "en"),
);
const localeFollowIde = ref(true);
const ideLocaleTag = ref("");
const profiles = ref<Profile[]>([]);
const activeId = ref("");
const form = ref<Profile>({ id: "", name: "" });
const apiKey = ref("");
const enabled = ref(true);
const autoTrigger = ref(true);
const enableInComments = ref(true);
const enableInStrings = ref(true);
const firstLineOnly = ref(true);
const sendFilePath = ref(true);
const showStatusBar = ref(true);
const respectGitignore = ref(true);
const ignoreGlobs = ref(DEFAULT_IGNORE_GLOBS);
const disabledLanguages = ref("");
const debounceMinMs = ref(150);
const debounceInitialMs = ref(300);
const debounceMaxMs = ref(1000);
const maxPrefixChars = ref(8000);
const maxSuffixChars = ref(2000);
const maxInFlight = ref(1);
const cacheSize = ref(20);
const lruSize = ref(64);
const maxFileSizeKb = ref(512);
const enableRecentFileContext = ref(false);
const recentFileLimit = ref(3);
const recentFileMaxChars = ref(1200);
const logLevel = ref("info");
const logPromptBodies = ref(false);
const logRetention = ref(1000);
const notifyOnFatalError = ref(true);
const showCostApprox = ref(false);
const uiTheme = ref<UiTheme>("auto");
const ideTheme = ref("dark");
const probeText = ref("");
const probeKind = ref<"ok" | "err" | "warn" | "">("");
const modelOptions = ref<string[]>([]);
const modelsFetching = ref(false);
/** Blocks Test template / Try all while a probe is in flight (anti double-click). */
const probeBusy = ref(false);
/** Which probe button is running: one | all | "" */
const probeBusyKind = ref<"" | "one" | "all">("");
const modelStatusText = ref("");
const modelStatusKind = ref<"ok" | "err" | "warn" | "">("");
const logs = ref<LogEntry[]>([]);
const logFilter = ref("info");
const renameValue = ref("");
const advancedOpen = ref(false);
const deleteConfirming = ref(false);
const saveState = ref<SaveState>("idle");
const saveMsg = ref("");

const loaded = ref(false);
/** In-panel import dialog (avoid window.prompt — ugly under JCEF). */
const importModalOpen = ref(false);
const importJsonText = ref("");

/** Public GitHub project (About card). Keep in sync with package homepage. */
const GITHUB_REPO_URL = "https://github.com/xinghaix/auto-complete";
const GITHUB_ISSUES_URL = "https://github.com/xinghaix/auto-complete/issues";
/** UI package version; monorepo keeps hosts aligned at release. */
const appVersion = "0.2.0";

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveStatusTimer: ReturnType<typeof setTimeout> | null = null;
let modelStatusTimer: ReturnType<typeof setTimeout> | null = null;
let probeStatusTimer: ReturnType<typeof setTimeout> | null = null;
const apiKeyPending = ref("");
const uiThemeLive = ref<UiTheme>("auto");
const ideThemeLive = ref("dark");

let unsubPush: (() => void) | null = null;

/** Auto-hide (ms). Longer because banners have a manual × dismiss. */
const STATUS_HIDE_MS = { ok: 5000, warn: 8000, err: 15000 } as const;

function clearModelStatus() {
  if (modelStatusTimer) {
    clearTimeout(modelStatusTimer);
    modelStatusTimer = null;
  }
  modelStatusText.value = "";
  modelStatusKind.value = "";
}

function clearProbeStatus() {
  if (probeStatusTimer) {
    clearTimeout(probeStatusTimer);
    probeStatusTimer = null;
  }
  probeText.value = "";
  probeKind.value = "";
}

/**
 * Show inline status. sticky=true keeps "processing…" until the next update.
 * Otherwise auto-hides (ok faster, err slower). User can always dismiss with ×.
 */
function setModelStatus(kind: "ok" | "err" | "warn", text: string, sticky = false) {
  if (modelStatusTimer) {
    clearTimeout(modelStatusTimer);
    modelStatusTimer = null;
  }
  modelStatusKind.value = kind;
  modelStatusText.value = text;
  if (sticky) return;
  const ms =
    kind === "ok" ? STATUS_HIDE_MS.ok : kind === "err" ? STATUS_HIDE_MS.err : STATUS_HIDE_MS.warn;
  modelStatusTimer = setTimeout(() => clearModelStatus(), ms);
}

function setProbeStatus(kind: "ok" | "err" | "warn", text: string, sticky = false) {
  if (probeStatusTimer) {
    clearTimeout(probeStatusTimer);
    probeStatusTimer = null;
  }
  probeKind.value = kind;
  probeText.value = text;
  if (sticky) return;
  const ms =
    kind === "ok" ? STATUS_HIDE_MS.ok : kind === "err" ? STATUS_HIDE_MS.err : STATUS_HIDE_MS.warn;
  probeStatusTimer = setTimeout(() => clearProbeStatus(), ms);
}

function tr(key: Parameters<typeof t>[1]): string {
  return t(locale.value, key);
}

const languageSelectValue = computed(() => (localeFollowIde.value ? "auto" : locale.value));
const connDisabled = computed(() => !activeId.value);

const filteredLogs = computed(() => {
  const min = LEVEL_ORDER.indexOf(logFilter.value as (typeof LEVEL_ORDER)[number]);
  return logs.value.filter((e) => {
    const lv = (e.level ?? "info").toLowerCase();
    const idx = LEVEL_ORDER.indexOf(lv as (typeof LEVEL_ORDER)[number]);
    return idx < 0 || idx >= min;
  });
});

const logText = computed(() =>
  filteredLogs.value
    .map(
      (e) =>
        `${e.time ?? ""} ${e.level ?? ""} ${e.operation ? `op=${e.operation}` : ""} ${e.message ?? e.error ?? ""}`.trim(),
    )
    .join("\n"),
);

const languageOptions = computed(() => [
  {
    value: "auto",
    label: `${tr("languageAuto")}${ideLocaleTag.value ? ` · ${ideLocaleTag.value}` : ""}`,
  },
  ...supportedLocales().map((loc) => ({ value: loc, label: localeLabel(loc) })),
]);

const templateOptions = computed(() => [
  { value: "AUTO", label: tr("templateAuto") },
  { value: "CODESTRAL_API", label: tr("templateCodestral") },
  { value: "QWEN", label: tr("templateQwen") },
  { value: "DEEPSEEK", label: tr("templateDeepseek") },
  { value: "STARCODER", label: tr("templateStarcoder") },
  { value: "CHAT", label: tr("templateChat") },
]);

const themeOptions = computed(() => [
  { value: "auto", label: tr("themeAuto") },
  { value: "light", label: tr("themeLight") },
  { value: "dark", label: tr("themeDark") },
]);

const levelOptions = [
  { value: "debug", label: "debug" },
  { value: "info", label: "info" },
  { value: "warn", label: "warn" },
  { value: "error", label: "error" },
];

function setLocaleFromIde(raw?: string | null) {
  const next = detectLocale(raw);
  ideLocaleTag.value = raw?.trim() || "";
  locale.value = next;
  applyDocumentLocale(next);
}

function openTab(raw: string) {
  const next = normalizeTab(raw);
  tab.value = next;
  if (next === "logs") {
    void bridge.request("subscribeLogs").then((res) => {
      const entries = (res.payload as { entries?: LogEntry[] } | undefined)?.entries;
      if (entries?.length) logs.value = entries.slice(-2000);
    });
  }
}

function applySnapshot(s: Snapshot) {
  const list = s.profiles ?? [];
  profiles.value = list;
  const id = s.activeProfileId || list[0]?.id || "";
  // Clear model suggestions when switching profiles / reloading snapshot
  if (id !== activeId.value) {
    modelOptions.value = [];
    clearModelStatus();
    clearProbeStatus();
  }
  activeId.value = id;
  const p = list.find((x) => x.id === id) ?? list[0];
  if (p) {
    form.value = { ...p };
    renameValue.value = p.name;
  } else {
    form.value = { id: "", name: "" };
    renameValue.value = "";
  }
  enabled.value = s.enabled !== false;
  autoTrigger.value = s.autoTrigger !== false;
  enableInComments.value = s.enableInComments !== false;
  enableInStrings.value = s.enableInStrings !== false;
  firstLineOnly.value = s.firstLineOnlyWhenMidLine !== false;
  sendFilePath.value = s.sendFilePath !== false;
  showStatusBar.value = s.showStatusBar !== false;
  respectGitignore.value = s.respectGitignore !== false;
  ignoreGlobs.value = ignoreGlobsFromSnapshot(s.ignoreGlobs);
  disabledLanguages.value = disabledLanguagesFromSnapshot(s.disabledLanguages);
  debounceMinMs.value = numOr(s.debounceMinMs, 150);
  debounceInitialMs.value = numOr(s.debounceInitialMs, 300);
  debounceMaxMs.value = numOr(s.debounceMaxMs, 1000);
  maxPrefixChars.value = numOr(s.maxPrefixChars, 8000);
  maxSuffixChars.value = numOr(s.maxSuffixChars, 2000);
  maxInFlight.value = numOr(s.maxInFlight, 1);
  cacheSize.value = numOr(s.cacheSize, 20);
  lruSize.value = numOr(s.lruSize, 64);
  maxFileSizeKb.value = numOr(s.maxFileSizeKb, 512);
  enableRecentFileContext.value = s.enableRecentFileContext === true;
  recentFileLimit.value = numOr(s.recentFileLimit, 3);
  recentFileMaxChars.value = numOr(s.recentFileMaxChars, 1200);
  logLevel.value = s.logLevel ?? "info";
  logPromptBodies.value = s.logPromptBodies === true;
  logRetention.value = numOr(s.logRetention, 1000);
  notifyOnFatalError.value = s.notifyOnFatalError !== false;
  showCostApprox.value = s.showCostApprox === true;
  uiTheme.value = normalizeUiTheme(s.uiTheme);
  const loc = normalizeUiLocale(s.uiLocale);
  if (loc === "auto") {
    localeFollowIde.value = true;
    // IDE locale applied via loadPlatform / localeChanged push
  } else {
    localeFollowIde.value = false;
    locale.value = loc as Locale;
    applyDocumentLocale(loc as Locale);
  }
  loaded.value = true;
}

async function loadPlatform() {
  const platformRes = await bridge.request("getPlatform");
  if (platformRes.ok && platformRes.payload) {
    const p = platformRes.payload as { locale?: string; platform?: string; theme?: string };
    if (p.theme) {
      const host = normalizeHostTheme(p.theme);
      ideTheme.value = host;
      ideThemeLive.value = host;
      applyResolvedTheme(uiThemeLive.value, host);
    }
    if (localeFollowIde.value) setLocaleFromIde(p.locale);
    else ideLocaleTag.value = p.locale?.trim() || "";
  }
}

async function load() {
  await loadPlatform();
  const res = await bridge.request("getSnapshot");
  if (!res.ok) {
    saveState.value = "error";
    saveMsg.value = res.error || tr("loadFailed");
    return;
  }
  applySnapshot(res.payload as Snapshot);
}

function patchForm(partial: Partial<Profile>) {
  form.value = { ...form.value, ...partial };
}

async function onSelectProfile(id: string) {
  if (!id || id === activeId.value) return;
  const res = await bridge.request("selectProfile", { profileId: id });
  if (res.ok && res.payload) applySnapshot(res.payload as Snapshot);
  else await load();
}

async function onCreate() {
  const res = await bridge.request("createProfile", {});
  if (res.ok && res.payload) applySnapshot(res.payload as Snapshot);
  else await load();
}

function onDelete() {
  if (!activeId.value) return;
  deleteConfirming.value = true;
}

async function doDelete() {
  deleteConfirming.value = false;
  if (!activeId.value) return;
  const res = await bridge.request("deleteProfile", { profileId: activeId.value });
  if (res.ok && res.payload) applySnapshot(res.payload as Snapshot);
  else await load();
}

async function commitRename() {
  if (!activeId.value) return;
  const next = renameValue.value.trim();
  const current = profiles.value.find((p) => p.id === activeId.value)?.name ?? "";
  if (!next || next === current) {
    renameValue.value = current;
    return;
  }
  const res = await bridge.request("renameProfile", {
    profileId: activeId.value,
    name: next,
  });
  if (res.ok && res.payload) applySnapshot(res.payload as Snapshot);
  else await load();
}

function formatMsg(template: string, ...args: Array<string | number>): string {
  let s = template;
  args.forEach((a, i) => {
    s = s.replace(new RegExp(`\\{${i}\\}`, "g"), String(a));
  });
  return s;
}

/** Fetch OpenAI-compatible model list (also validates baseUrl/key connectivity). */
async function onFetchModels() {
  if (!activeId.value || modelsFetching.value) return;
  modelsFetching.value = true;
  setModelStatus("warn", tr("fetchingModels"), true);
  try {
    // Persist current form first so host listModels uses latest baseUrl/key
    await doSave();
    const res = await bridge.request("listModels", { profileId: activeId.value });
    if (!res.ok) {
      setModelStatus("err", formatMsg(tr("modelsFailed"), res.error || tr("failed")));
      return;
    }
    const raw = (res.payload as { models?: Array<{ id?: string } | string> })?.models ?? [];
    const ids = raw
      .map((m) => (typeof m === "string" ? m : m?.id ?? ""))
      .map((s) => s.trim())
      .filter(Boolean);
    // Dedupe preserve order
    const seen = new Set<string>();
    const list: string[] = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      list.push(id);
    }
    modelOptions.value = list;
    if (list.length === 0) {
      setModelStatus("warn", tr("modelsEmpty"));
    } else {
      setModelStatus("ok", formatMsg(tr("modelsLoaded"), list.length));
      // If current model empty, pick first; typed value not in list is kept as-is
      const cur = (form.value.model ?? "").trim();
      if (!cur) patchForm({ model: list[0] });
    }
  } catch (e) {
    setModelStatus(
      "err",
      formatMsg(tr("modelsFailed"), e instanceof Error ? e.message : String(e)),
    );
  } finally {
    modelsFetching.value = false;
  }
}

/** Keep busy UI visible even when the probe returns in <100ms (matches fetch-models feel). */
const PROBE_BUSY_MIN_MS = 450;

async function runProbe(
  kind: "one" | "all",
  work: () => Promise<void>,
): Promise<void> {
  if (probeBusy.value || connDisabled.value) return;
  probeBusy.value = true;
  probeBusyKind.value = kind;
  setProbeStatus("warn", tr("testing"), true);
  const started = Date.now();
  try {
    await work();
  } catch (e) {
    setProbeStatus("err", e instanceof Error ? e.message : tr("failed"));
  } finally {
    const left = PROBE_BUSY_MIN_MS - (Date.now() - started);
    if (left > 0) await new Promise((r) => setTimeout(r, left));
    probeBusy.value = false;
    probeBusyKind.value = "";
  }
}

async function onProbeOne() {
  await runProbe("one", async () => {
    const res = await bridge.request("probeTemplate", {
      profileId: activeId.value,
      template: form.value.promptTemplate || "AUTO",
    });
    if (!res.ok) {
      setProbeStatus("err", res.error || tr("failed"));
      return;
    }
    const p = (res.payload ?? {}) as ProbeResult;
    const line = `${p.template ?? form.value.promptTemplate}: ${p.status} ${p.latencyMs ?? 0}ms ${p.preview ?? p.error ?? ""}`;
    const ok = p.status === "SUCCESS";
    setProbeStatus(ok ? "ok" : "err", line);
  });
}

async function onProbeAll() {
  await runProbe("all", async () => {
    const res = await bridge.request("probeAllTemplates", { profileId: activeId.value });
    if (!res.ok && !res.payload) {
      setProbeStatus("err", res.error || tr("failed"));
      return;
    }
    const results = ((res.payload as { results?: ProbeResult[] })?.results ?? []) as ProbeResult[];
    const text =
      results
        .map((r) => `${r.template}: ${r.status} ${r.latencyMs ?? 0}ms ${r.preview ?? r.error ?? ""}`)
        .join("\n") || (res.error ?? tr("failed"));
    const ok = results.some((r) => r.status === "SUCCESS");
    setProbeStatus(ok ? "ok" : "err", text);
  });
}

async function onClearKey() {
  if (!activeId.value) return;
  await bridge.request("clearSecret", { profileId: activeId.value });
  await load();
}

function onLanguageChange(value: string) {
  if (value === "auto") {
    localeFollowIde.value = true;
    setLocaleFromIde(
      ideLocaleTag.value || (typeof navigator !== "undefined" ? navigator.language : "en"),
    );
    void loadPlatform();
    scheduleSave();
    return;
  }
  localeFollowIde.value = false;
  locale.value = value as Locale;
  applyDocumentLocale(value as Locale);
  scheduleSave();
}

async function onExport() {
  try {
    const res = await bridge.request("exportSettings");
    if (!res.ok) {
      saveState.value = "error";
      saveMsg.value = res.error || tr("exportFailed");
      return;
    }
    const json = (res.payload as { json?: string } | undefined)?.json ?? "";
    if (!json) {
      saveState.value = "error";
      saveMsg.value = tr("exportFailed");
      return;
    }
    await navigator.clipboard.writeText(json);
    saveState.value = "saved";
    saveMsg.value = tr("exportOk");
  } catch (e) {
    saveState.value = "error";
    saveMsg.value = e instanceof Error ? e.message : tr("exportFailed");
  }
}

function openImportModal() {
  importJsonText.value = "";
  importModalOpen.value = true;
}

function closeImportModal() {
  importModalOpen.value = false;
  importJsonText.value = "";
}

async function confirmImport() {
  const json = importJsonText.value.trim();
  if (!json) {
    saveState.value = "error";
    saveMsg.value = tr("importEmpty");
    return;
  }
  try {
    const res = await bridge.request("importSettings", { json });
    if (!res.ok) {
      saveState.value = "error";
      saveMsg.value = res.error || tr("importFailed");
      return;
    }
    closeImportModal();
    await load();
    saveState.value = "saved";
    saveMsg.value = tr("importOk");
  } catch (e) {
    saveState.value = "error";
    saveMsg.value = e instanceof Error ? e.message : tr("importFailed");
  }
}

/** Open https links via host (JCEF/Webview-safe); fall back to window.open. */
async function openExternal(url: string) {
  try {
    const res = await bridge.request("openExternal", { url });
    if (res.ok) return;
  } catch {
    /* fall through */
  }
  try {
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (w) return;
  } catch {
    /* fall through */
  }
  saveState.value = "error";
  saveMsg.value = tr("aboutOpenFailed");
}

function onThemeChange(value: string) {
  const next = normalizeUiTheme(value);
  uiTheme.value = next;
  applyResolvedTheme(next, ideThemeLive.value);
}

async function doSave() {
  if (!loaded.value) return;
  const keyPending = apiKeyPending.value.trim();
  if (keyPending && activeId.value) {
    await bridge.request("setSecret", { profileId: activeId.value, secret: keyPending });
    apiKeyPending.value = "";
    apiKey.value = "";
  }
  const vErrs = validateForm(form.value, profiles.value.length > 0);
  if (vErrs.length) {
    saveState.value = "error";
    saveMsg.value = vErrs[0];
    return;
  }
  const nextProfiles = profiles.value.map((p) =>
    p.id === form.value.id ? { ...p, ...form.value, hasApiKey: undefined } : p,
  );
  const payload: Snapshot = {
    schemaVersion: 1,
    enabled: enabled.value,
    autoTrigger: autoTrigger.value,
    activeProfileId: activeId.value,
    profiles: nextProfiles,
    enableInComments: enableInComments.value,
    enableInStrings: enableInStrings.value,
    firstLineOnlyWhenMidLine: firstLineOnly.value,
    sendFilePath: sendFilePath.value,
    showStatusBar: showStatusBar.value,
    respectGitignore: respectGitignore.value,
    ignoreGlobs: ignoreGlobs.value,
    disabledLanguages: disabledLanguages.value,
    debounceMinMs: debounceMinMs.value,
    debounceInitialMs: debounceInitialMs.value,
    debounceMaxMs: debounceMaxMs.value,
    maxPrefixChars: maxPrefixChars.value,
    maxSuffixChars: maxSuffixChars.value,
    maxInFlight: maxInFlight.value,
    cacheSize: cacheSize.value,
    lruSize: lruSize.value,
    maxFileSizeKb: maxFileSizeKb.value,
    enableRecentFileContext: enableRecentFileContext.value,
    recentFileLimit: recentFileLimit.value,
    recentFileMaxChars: recentFileMaxChars.value,
    logLevel: logLevel.value,
    logPromptBodies: logPromptBodies.value,
    logRetention: logRetention.value,
    notifyOnFatalError: notifyOnFatalError.value,
    showCostApprox: showCostApprox.value,
    uiTheme: uiTheme.value,
    uiLocale: localeFollowIde.value ? "auto" : locale.value,
  };
  saveState.value = "saving";
  saveMsg.value = tr("saving");
  const res = await bridge.request("applySettings", payload);
  if (res.ok) {
    saveState.value = "saved";
    saveMsg.value = tr("saved");
  } else {
    saveState.value = "error";
    saveMsg.value = res.error || tr("saveError");
  }
}

function scheduleSave() {
  if (!loaded.value) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void doSave(), AUTOSAVE_DELAY);
}

function onHostOpenTab(ev: Event) {
  const tabName = (ev as CustomEvent<{ tab?: string }>).detail?.tab;
  if (tabName) openTab(tabName);
}

watch(locale, (v) => applyDocumentLocale(v));

watch([uiTheme, ideTheme], ([pref, host]) => {
  uiThemeLive.value = pref;
  ideThemeLive.value = host;
  applyResolvedTheme(pref, host);
});

watch(apiKey, (v) => {
  apiKeyPending.value = v;
});

watch(saveState, (st) => {
  if (saveStatusTimer) clearTimeout(saveStatusTimer);
  if (st === "idle") return;
  saveStatusTimer = setTimeout(
    () => {
      saveState.value = "idle";
      saveMsg.value = "";
    },
    st === "error" ? 5000 : 2000,
  );
});

// Debounced auto-save on settings fields
watch(
  [
    form,
    enabled,
    autoTrigger,
    enableInComments,
    enableInStrings,
    firstLineOnly,
    sendFilePath,
    showStatusBar,
    respectGitignore,
    ignoreGlobs,
    disabledLanguages,
    debounceMinMs,
    debounceInitialMs,
    debounceMaxMs,
    maxPrefixChars,
    maxSuffixChars,
    maxInFlight,
    cacheSize,
    lruSize,
    maxFileSizeKb,
    enableRecentFileContext,
    recentFileLimit,
    recentFileMaxChars,
    logLevel,
    logPromptBodies,
    logRetention,
    notifyOnFatalError,
    showCostApprox,
    uiTheme,
  ],
  () => scheduleSave(),
  { deep: true },
);

onMounted(() => {
  window.__acSetTab = openTab;
  window.addEventListener("ac-open-tab", onHostOpenTab as EventListener);
  const preferred =
    window.__acPreferredTab ||
    (typeof location !== "undefined" ? location.hash.replace(/^#/, "") : "");
  if (preferred) openTab(preferred);

  void load();
  unsubPush = bridge.onPush((msg) => {
    if (msg.type === "logBatch") {
      const entries = (msg.payload as { entries?: LogEntry[] })?.entries ?? [];
      logs.value = [...logs.value, ...entries].slice(-2000);
    }
    if (msg.type === "snapshot" || msg.type === "settingsChanged") {
      if (msg.payload) applySnapshot(msg.payload as Snapshot);
      else void load();
    }
    if (msg.type === "themeChanged") {
      const theme = (msg.payload as { theme?: string })?.theme;
      if (theme) {
        const host = normalizeHostTheme(theme);
        ideTheme.value = host;
        ideThemeLive.value = host;
        applyResolvedTheme(uiThemeLive.value, host);
      }
    }
    if (msg.type === "localeChanged") {
      const raw = (msg.payload as { locale?: string })?.locale;
      if (localeFollowIde.value) setLocaleFromIde(raw);
      else ideLocaleTag.value = raw?.trim() || "";
    }
    if (msg.type === "openTab") {
      const tabName = (msg.payload as { tab?: string })?.tab;
      if (tabName) openTab(tabName);
    }
  });
});

onUnmounted(() => {
  window.removeEventListener("ac-open-tab", onHostOpenTab as EventListener);
  delete window.__acSetTab;
  if (saveTimer) clearTimeout(saveTimer);
  if (saveStatusTimer) clearTimeout(saveStatusTimer);
  if (modelStatusTimer) clearTimeout(modelStatusTimer);
  if (probeStatusTimer) clearTimeout(probeStatusTimer);
  unsubPush?.();
});

function onRenameKey(e: KeyboardEvent) {
  const target = e.target as HTMLInputElement;
  if (e.key === "Enter") {
    e.preventDefault();
    void commitRename();
    target.blur();
  } else if (e.key === "Escape") {
    e.preventDefault();
    const current = profiles.value.find((p) => p.id === activeId.value)?.name ?? "";
    renameValue.value = current;
    target.blur();
  }
}

function clearLogs() {
  void bridge.request("clearLogs");
  logs.value = [];
}

function copyLogs() {
  void navigator.clipboard.writeText(logText.value);
}
</script>

<template>
  <div class="app">
    <header class="header">
      <div class="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          :class="{ active: tab === 'config' }"
          :aria-selected="tab === 'config'"
          @click="openTab('config')"
        >
          {{ tr("tabConfig") }}
        </button>
        <button
          type="button"
          role="tab"
          :class="{ active: tab === 'behavior' }"
          :aria-selected="tab === 'behavior'"
          @click="openTab('behavior')"
        >
          {{ tr("tabBehavior") }}
        </button>
        <button
          type="button"
          role="tab"
          :class="{ active: tab === 'performance' }"
          :aria-selected="tab === 'performance'"
          @click="openTab('performance')"
        >
          {{ tr("tabPerformance") }}
        </button>
        <button
          type="button"
          role="tab"
          :class="{ active: tab === 'general' }"
          :aria-selected="tab === 'general'"
          @click="openTab('general')"
        >
          {{ tr("tabGeneral") }}
        </button>
        <button
          type="button"
          role="tab"
          :class="{ active: tab === 'logs' }"
          :aria-selected="tab === 'logs'"
          @click="openTab('logs')"
        >
          {{ tr("tabLogs") }}
        </button>
      </div>
    </header>

    <div class="scroll">
      <!-- Config -->
      <template v-if="tab === 'config'">
        <GroupCard :title="tr('sectionProvider')" :measure-key="locale">
          <template #toolbar>
            <ProfileCombo
              :model-value="activeId"
              :options="profiles"
              :rename-value="renameValue"
              :disabled="!activeId"
              :aria-label="tr('profiles')"
              :placeholder="tr('noProfiles')"
              @update:rename-value="(v) => (renameValue = v)"
              @select="(id) => void onSelectProfile(id)"
              @commit-rename="void commitRename()"
              @rename-keydown="onRenameKey"
            />
            <button type="button" class="btn btn-secondary" @click="onCreate()">
              {{ tr("newProfile") }}
            </button>
            <span v-if="deleteConfirming" class="delete-confirm">
              <span class="delete-confirm-text">{{ tr("confirmDeleteInline") }}</span>
              <button type="button" class="btn btn-danger" @click="doDelete()">
                {{ tr("confirmDeleteYes") }}
              </button>
              <button type="button" class="btn btn-ghost" @click="deleteConfirming = false">
                {{ tr("confirmDeleteCancel") }}
              </button>
            </span>
            <button
              v-else
              type="button"
              class="btn btn-danger"
              :disabled="!activeId"
              @click="onDelete()"
            >
              {{ tr("deleteProfile") }}
            </button>
            <p class="toolbar-help">{{ tr("helpProfile") }}</p>
          </template>

          <fieldset :disabled="connDisabled" style="border: 0; margin: 0; padding: 0">
            <PropertyRow :label="tr('baseUrl')" :help="tr('helpBaseUrl')" required>
              <input
                type="text"
                :value="form.baseUrl ?? ''"
                placeholder="http://127.0.0.1:11434/v1"
                spellcheck="false"
                @input="patchForm({ baseUrl: ($event.target as HTMLInputElement).value })"
              />
            </PropertyRow>
            <PropertyRow :label="tr('apiKey')" :help="tr('helpApiKey')">
              <div class="hstack">
                <input
                  type="password"
                  v-model="apiKey"
                  placeholder="••••••••"
                  autocomplete="off"
                />
                <span class="pill" :class="{ on: form.hasApiKey }">
                  {{ form.hasApiKey ? tr("keyConfigured") : tr("keyMissing") }}
                </span>
                <button
                  type="button"
                  class="btn btn-ghost"
                  :disabled="!activeId"
                  @click="onClearKey()"
                >
                  {{ tr("clearKey") }}
                </button>
              </div>
              <p class="row-help">{{ tr("secretHint") }}</p>
            </PropertyRow>
            <PropertyRow :label="tr('model')" :help="tr('helpModel')" required>
              <ModelCombo
                :model-value="form.model ?? ''"
                :options="modelOptions"
                :disabled="connDisabled"
                placeholder="qwen2.5-coder:7b"
                :aria-label="tr('model')"
                :fetching="modelsFetching"
                :fetch-label="tr('fetchModels')"
                :fetching-label="tr('fetchingModels')"
                @update:model-value="(v) => patchForm({ model: v })"
                @fetch="onFetchModels()"
              />
              <div
                v-if="modelStatusText"
                class="result result-banner"
                :class="modelStatusKind"
                role="status"
              >
                <div class="result-body">{{ modelStatusText }}</div>
                <button
                  v-if="modelStatusKind !== 'warn' || !modelsFetching"
                  type="button"
                  class="result-dismiss"
                  :aria-label="tr('confirmDeleteCancel')"
                  @click="clearModelStatus()"
                >
                  ×
                </button>
              </div>
            </PropertyRow>
            <PropertyRow :label="tr('promptTemplate')" :help="tr('helpTemplate')">
              <SelectCombo
                :model-value="form.promptTemplate ?? 'AUTO'"
                :options="templateOptions"
                @update:model-value="(v) => patchForm({ promptTemplate: v })"
              />
              <div class="hstack">
                <button
                  type="button"
                  class="btn btn-secondary"
                  :disabled="probeBusy || connDisabled"
                  :aria-busy="probeBusyKind === 'one'"
                  @click="void onProbeOne()"
                >
                  {{ probeBusyKind === "one" ? tr("testing") : tr("tryTemplate") }}
                </button>
                <button
                  type="button"
                  class="btn btn-secondary"
                  :disabled="probeBusy || connDisabled"
                  :aria-busy="probeBusyKind === 'all'"
                  @click="void onProbeAll()"
                >
                  {{ probeBusyKind === "all" ? tr("testing") : tr("tryAllTemplates") }}
                </button>
              </div>
              <div
                v-if="probeText"
                class="result result-banner"
                :class="probeKind"
                role="status"
              >
                <div class="result-body">
                  <strong v-if="probeKind !== 'warn'">{{ tr("probeResults") }}</strong>
                  <pre>{{ probeText }}</pre>
                </div>
                <button
                  v-if="probeKind !== 'warn' || probeText !== tr('testing')"
                  type="button"
                  class="result-dismiss"
                  :aria-label="tr('confirmDeleteCancel')"
                  @click="clearProbeStatus()"
                >
                  ×
                </button>
              </div>
            </PropertyRow>
            <PropertyRow :label="tr('maxTokens')" :help="tr('helpMaxTokens')">
              <input
                type="number"
                :value="form.maxTokens ?? 128"
                @input="patchForm({ maxTokens: Number(($event.target as HTMLInputElement).value) })"
              />
            </PropertyRow>
            <PropertyRow :label="tr('timeoutMs')" :help="tr('helpTimeout')">
              <input
                type="number"
                :value="form.timeoutMs ?? 3000"
                @input="patchForm({ timeoutMs: Number(($event.target as HTMLInputElement).value) })"
              />
            </PropertyRow>

            <div class="advanced-toggle">
              <button
                type="button"
                class="advanced-toggle-btn"
                :aria-expanded="advancedOpen"
                @click="advancedOpen = !advancedOpen"
              >
                <span class="advanced-chevron" :class="{ open: advancedOpen }">▶</span>
                {{ tr("sectionAdvanced") }}
              </button>
            </div>
            <div v-if="advancedOpen" class="advanced-body">
              <PropertyRow :label="tr('settingsTimeoutMs')" :help="tr('helpSettingsTimeout')">
                <input
                  type="number"
                  :value="form.settingsTimeoutMs ?? 15000"
                  @input="
                    patchForm({
                      settingsTimeoutMs: Number(($event.target as HTMLInputElement).value),
                    })
                  "
                />
              </PropertyRow>
              <PropertyRow :label="tr('temperature')" :help="tr('helpTemperature')">
                <input
                  type="number"
                  step="0.1"
                  :value="form.temperature ?? 0"
                  @input="
                    patchForm({ temperature: Number(($event.target as HTMLInputElement).value) })
                  "
                />
              </PropertyRow>
              <CheckRow
                :model-value="!!form.stream"
                :label="tr('stream')"
                :help="tr('helpStream')"
                @update:model-value="(v) => patchForm({ stream: v })"
              />
              <PropertyRow :label="tr('authHeader')" :help="tr('helpAuthHeader')">
                <input
                  type="text"
                  :value="form.authHeaderTemplate ?? 'Authorization: Bearer ***'"
                  spellcheck="false"
                  @input="
                    patchForm({
                      authHeaderTemplate: ($event.target as HTMLInputElement).value,
                    })
                  "
                />
              </PropertyRow>
              <PropertyRow :label="tr('fimPath')" :help="tr('helpFimPath')">
                <input
                  type="text"
                  :value="form.fimPath ?? ''"
                  spellcheck="false"
                  @input="patchForm({ fimPath: ($event.target as HTMLInputElement).value })"
                />
              </PropertyRow>
              <PropertyRow :label="tr('chatPath')" :help="tr('helpChatPath')">
                <input
                  type="text"
                  :value="form.chatPath ?? '/chat/completions'"
                  spellcheck="false"
                  @input="patchForm({ chatPath: ($event.target as HTMLInputElement).value })"
                />
              </PropertyRow>
              <PropertyRow :label="tr('completionsPath')" :help="tr('helpCompletionsPath')">
                <input
                  type="text"
                  :value="form.completionsPath ?? ''"
                  spellcheck="false"
                  @input="
                    patchForm({ completionsPath: ($event.target as HTMLInputElement).value })
                  "
                />
              </PropertyRow>
              <PropertyRow :label="tr('extraHeaders')" :help="tr('helpExtraHeaders')">
                <textarea
                  rows="2"
                  :value="form.extraHeadersJson ?? '{}'"
                  spellcheck="false"
                  @input="
                    patchForm({
                      extraHeadersJson: ($event.target as HTMLTextAreaElement).value,
                    })
                  "
                />
              </PropertyRow>
              <CheckRow
                :model-value="!!form.overrideContextBudget"
                :label="tr('overrideBudget')"
                :help="tr('helpOverrideBudget')"
                @update:model-value="(v) => patchForm({ overrideContextBudget: v })"
              />
              <PropertyRow :label="tr('maxPrefix')" :help="tr('helpMaxPrefix')">
                <input
                  type="number"
                  :value="form.maxPrefixChars ?? 8000"
                  :disabled="!form.overrideContextBudget"
                  @input="
                    patchForm({ maxPrefixChars: Number(($event.target as HTMLInputElement).value) })
                  "
                />
              </PropertyRow>
              <PropertyRow :label="tr('maxSuffix')" :help="tr('helpMaxSuffix')">
                <input
                  type="number"
                  :value="form.maxSuffixChars ?? 2000"
                  :disabled="!form.overrideContextBudget"
                  @input="
                    patchForm({ maxSuffixChars: Number(($event.target as HTMLInputElement).value) })
                  "
                />
              </PropertyRow>
            </div>
          </fieldset>
        </GroupCard>
      </template>

      <!-- Behavior -->
      <template v-if="tab === 'behavior'">
        <GroupCard :title="tr('sectionBehavior')" :measure-key="locale">
          <CheckRow
            v-model="enabled"
            :label="tr('enabled')"
            :help="tr('helpEnabled')"
          />
          <CheckRow
            v-model="autoTrigger"
            :label="tr('autoTrigger')"
            :help="tr('helpAutoTrigger')"
          />
          <CheckRow
            v-model="enableInComments"
            :label="tr('enableInComments')"
            :help="tr('helpInComments')"
          />
          <CheckRow
            v-model="enableInStrings"
            :label="tr('enableInStrings')"
            :help="tr('helpInStrings')"
          />
          <CheckRow
            v-model="firstLineOnly"
            :label="tr('firstLineOnly')"
            :help="tr('helpFirstLineOnly')"
          />
          <CheckRow
            v-model="sendFilePath"
            :label="tr('sendFilePath')"
            :help="tr('helpSendFilePath')"
          />
          <CheckRow
            v-model="showStatusBar"
            :label="tr('showStatusBar')"
            :help="tr('helpShowStatusBar')"
          />
          <PropertyRow :label="tr('disabledLanguages')" :help="tr('helpDisabledLanguages')">
            <input
              type="text"
              v-model="disabledLanguages"
              placeholder="markdown, json"
              spellcheck="false"
            />
          </PropertyRow>
        </GroupCard>
        <GroupCard :title="tr('sectionIgnore')" :measure-key="locale">
          <CheckRow
            v-model="respectGitignore"
            :label="tr('respectGitignore')"
            :help="tr('helpRespectGitignore')"
          />
          <PropertyRow :label="tr('ignoreGlobs')" :help="tr('helpIgnoreGlobs')">
            <textarea rows="6" v-model="ignoreGlobs" spellcheck="false" />
          </PropertyRow>
        </GroupCard>
      </template>

      <!-- Performance -->
      <template v-if="tab === 'performance'">
        <GroupCard :title="tr('sectionDebounce')" :measure-key="locale">
          <p class="hint-block" style="margin: 0 12px 8px">{{ tr("helpDebounce") }}</p>
          <PropertyRow :label="tr('debounceInitial')" :help="tr('helpDebounceInitial')">
            <input type="number" min="0" v-model.number="debounceInitialMs" />
          </PropertyRow>
          <PropertyRow :label="tr('debounceMin')" :help="tr('helpDebounceMin')">
            <input type="number" min="0" v-model.number="debounceMinMs" />
          </PropertyRow>
          <PropertyRow :label="tr('debounceMax')" :help="tr('helpDebounceMax')">
            <input type="number" min="0" v-model.number="debounceMaxMs" />
          </PropertyRow>
        </GroupCard>
        <GroupCard :title="tr('sectionContext')" :measure-key="locale">
          <p class="hint-block" style="margin: 0 12px 8px">{{ tr("helpContextBudget") }}</p>
          <PropertyRow :label="tr('maxPrefix')" :help="tr('helpMaxPrefix')">
            <input type="number" min="1" v-model.number="maxPrefixChars" />
          </PropertyRow>
          <PropertyRow :label="tr('maxSuffix')" :help="tr('helpMaxSuffix')">
            <input type="number" min="1" v-model.number="maxSuffixChars" />
          </PropertyRow>
        </GroupCard>
        <GroupCard :title="tr('sectionEngine')" :measure-key="locale">
          <PropertyRow :label="tr('cacheSize')" :help="tr('helpCacheSize')">
            <input type="number" min="1" v-model.number="cacheSize" />
          </PropertyRow>
          <PropertyRow :label="tr('lruSize')" :help="tr('helpLruSize')">
            <input type="number" min="1" v-model.number="lruSize" />
          </PropertyRow>
          <PropertyRow :label="tr('maxInFlight')" :help="tr('helpMaxInFlight')">
            <input type="number" min="1" v-model.number="maxInFlight" />
          </PropertyRow>
          <PropertyRow :label="tr('maxFileSize')" :help="tr('helpMaxFileSize')">
            <input type="number" min="1" v-model.number="maxFileSizeKb" />
          </PropertyRow>
        </GroupCard>
        <GroupCard :title="tr('sectionRecent')" :measure-key="locale">
          <CheckRow
            v-model="enableRecentFileContext"
            :label="tr('enableRecent')"
            :help="tr('helpEnableRecent')"
          />
          <PropertyRow :label="tr('recentLimit')" :help="tr('helpRecentLimit')">
            <input
              type="number"
              min="0"
              v-model.number="recentFileLimit"
              :disabled="!enableRecentFileContext"
            />
          </PropertyRow>
          <PropertyRow :label="tr('recentMaxChars')" :help="tr('helpRecentMaxChars')">
            <input
              type="number"
              min="1"
              v-model.number="recentFileMaxChars"
              :disabled="!enableRecentFileContext"
            />
          </PropertyRow>
        </GroupCard>
      </template>

      <!-- General -->
      <template v-if="tab === 'general'">
        <GroupCard :title="tr('sectionGeneral')" :measure-key="locale">
          <PropertyRow :label="tr('language')" :help="tr('helpLanguage')">
            <SelectCombo
              :model-value="languageSelectValue"
              :options="languageOptions"
              @update:model-value="onLanguageChange"
            />
          </PropertyRow>
          <PropertyRow :label="tr('theme')" :help="tr('helpTheme')">
            <SelectCombo
              :model-value="uiTheme"
              :options="themeOptions"
              @update:model-value="onThemeChange"
            />
          </PropertyRow>
          <PropertyRow :label="tr('moreActions')">
            <div class="hstack">
              <button type="button" class="btn btn-secondary" @click="void onExport()">
                {{ tr("export") }}
              </button>
              <button type="button" class="btn btn-secondary" @click="openImportModal()">
                {{ tr("import") }}
              </button>
            </div>
            <p class="row-help">{{ tr("helpImportExport") }}</p>
          </PropertyRow>
        </GroupCard>

        <GroupCard :title="tr('sectionAbout')" :measure-key="locale">
          <div class="about-card">
            <p class="about-title">{{ tr("title") }}</p>
            <p class="about-meta">
              <span>{{ tr("aboutVersion") }} {{ appVersion }}</span>
              <span class="about-dot" aria-hidden="true">·</span>
              <span>{{ tr("aboutLicense") }}</span>
            </p>
            <p class="about-blurb">{{ tr("aboutBlurb") }}</p>
            <div class="hstack about-actions">
              <button type="button" class="btn btn-primary" @click="void openExternal(GITHUB_REPO_URL)">
                {{ tr("aboutOpenGithub") }}
              </button>
              <button type="button" class="btn btn-secondary" @click="void openExternal(GITHUB_ISSUES_URL)">
                {{ tr("aboutOpenIssues") }}
              </button>
            </div>
            <p class="row-help about-url">{{ GITHUB_REPO_URL }}</p>
          </div>
        </GroupCard>
      </template>

      <!-- Logs -->
      <template v-if="tab === 'logs'">
        <p class="hint-block">{{ tr("logsHint") }}</p>
        <GroupCard :title="tr('sectionLog')" :measure-key="locale">
          <PropertyRow :label="tr('logLevel')" :help="tr('helpLogLevel')">
            <SelectCombo v-model="logLevel" :options="levelOptions" />
          </PropertyRow>
          <PropertyRow :label="tr('logRetention')" :help="tr('helpLogRetention')">
            <input type="number" min="50" max="10000" v-model.number="logRetention" />
          </PropertyRow>
          <CheckRow
            v-model="logPromptBodies"
            :label="tr('logPromptBodies')"
            :help="tr('helpLogPromptBodies')"
          />
          <CheckRow
            v-model="notifyOnFatalError"
            :label="tr('notifyFatal')"
            :help="tr('helpNotifyFatal')"
          />
          <CheckRow
            v-model="showCostApprox"
            :label="tr('showCost')"
            :help="tr('helpShowCost')"
          />
        </GroupCard>
        <div class="logs-bar">
          <label class="logs-bar-filter">
            {{ tr("logFilter") }}
            <SelectCombo v-model="logFilter" :options="levelOptions" />
          </label>
          <button type="button" class="btn btn-secondary" @click="clearLogs">
            {{ tr("clearLogs") }}
          </button>
          <button type="button" class="btn btn-ghost" @click="copyLogs">
            {{ tr("copyLogs") }}
          </button>
        </div>
        <div class="logs-pane">{{ logText || tr("emptyLogs") }}</div>
      </template>
    </div>

    <div v-if="saveState !== 'idle'" class="save-status" :class="saveState">
      {{ saveMsg }}
    </div>

    <!-- Import settings: in-panel modal (window.prompt is unusable in JCEF) -->
    <Teleport to="body">
      <div
        v-if="importModalOpen"
        class="modal-root"
        role="dialog"
        aria-modal="true"
        :aria-label="tr('importTitle')"
        @keydown.escape.prevent="closeImportModal()"
      >
        <div class="modal-backdrop" @mousedown="closeImportModal()" />
        <div class="modal-panel" @mousedown.stop>
          <h2 class="modal-title">{{ tr("importTitle") }}</h2>
          <p class="modal-help">{{ tr("importPrompt") }}</p>
          <textarea
            v-model="importJsonText"
            class="modal-textarea"
            rows="12"
            spellcheck="false"
            autocomplete="off"
            :placeholder="tr('importPlaceholder')"
          />
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" @click="closeImportModal()">
              {{ tr("confirmDeleteCancel") }}
            </button>
            <button type="button" class="btn btn-primary" @click="void confirmImport()">
              {{ tr("importConfirm") }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

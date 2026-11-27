<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { bridge } from "./bridge/client";
import CheckRow from "./components/CheckRow.vue";
import GroupCard from "./components/GroupCard.vue";
import ModelCombo from "./components/ModelCombo.vue";
import ProfileCombo from "./components/ProfileCombo.vue";
import PropertyRow from "./components/PropertyRow.vue";
import SelectCombo from "./components/SelectCombo.vue";
import {
  applyDocumentLocale,
  detectLocale,
  localeLabel,
  supportedLocales,
  t,
  type Locale,
  type MessageKey,
} from "./i18n";
import type {
  LogEntry,
  ModelOption,
  ProbeResult,
  Profile,
  ServicePreset,
  SessionStats,
  Snapshot,
  UiTheme,
} from "./types";
import {
  AUTOSAVE_DELAY,
  DEFAULT_AUTH_HEADER,
  DEFAULT_IGNORE_GLOBS,
  LEVEL_ORDER,
  SERVICE_PRESETS,
  applyResolvedTheme,
  disabledLanguagesFromSnapshot,
  formatLogLine,
  formatProbeLine,
  ignoreGlobsFromSnapshot,
  isBlankProfileDraft,
  matchesLogQuery,
  mergeLogEntries,
  normalizeHostTheme,
  normalizeTab,
  normalizeUiLocale,
  normalizeUiTheme,
  numOr,
  parseOptionalNumber,
  pickRecommendedTemplate,
  validateGlobalSettings,
  validateProfile,
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

const TAB_ORDER: readonly MainTab[] = ["config", "behavior", "performance", "general", "logs"];

const tab = ref<MainTab>("config");
const tabBtnRefs = ref<Partial<Record<MainTab, HTMLButtonElement | null>>>({});
const locale = ref<Locale>(
  detectLocale(typeof navigator !== "undefined" ? navigator.language : "en"),
);
const localeFollowIde = ref(true);
const ideLocaleTag = ref("");
const profiles = ref<Profile[]>([]);
const activeId = ref("");
const form = ref<Profile>({ id: "", name: "" });
const apiKey = ref("");
const savingKey = ref(false);
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

// Probe & model state
const probeText = ref("");
const probeKind = ref<"ok" | "err" | "warn" | "">("");
const recommendedTemplate = ref("");
const modelOptions = ref<ModelOption[]>([]);
const modelsFetching = ref(false);
/** Blocks connection/template probes while one is in flight (anti double-click). */
const probeBusy = ref(false);
const probeBusyKind = ref<"" | "conn" | "one" | "all">("");
const modelStatusText = ref("");
const modelStatusKind = ref<"ok" | "err" | "warn" | "">("");

// Logs & session stats
const logs = ref<LogEntry[]>([]);
const logFilter = ref("info");
const logSearch = ref("");
const logAutoScroll = ref(true);
const logsPaneRef = ref<HTMLElement | null>(null);
const logsSubscribed = ref(false);
const sessionStats = ref<SessionStats | null>(null);
const clearingCaches = ref(false);

// Profile UI state
const renameValue = ref("");
const advancedOpen = ref(false);
const deleteConfirming = ref(false);
const saveState = ref<SaveState>("idle");
const saveMsg = ref("");
const loaded = ref(false);

// Numeric field drafts (prevents empty input coercing to 0 while typing)
const numericDrafts = ref<Record<string, string>>({});
// Controls when inline profile errors appear (avoid flashing red on brand new blank draft)
const showProfileValidation = ref(false);

// Modals
const importModalOpen = ref(false);
const importJsonText = ref("");
const importModalError = ref("");
const importTextareaRef = ref<HTMLTextAreaElement | null>(null);
const importModalPanelRef = ref<HTMLElement | null>(null);

const copyModalOpen = ref(false);
const copyModalTitle = ref("");
const copyModalText = ref("");
const copyTextareaRef = ref<HTMLTextAreaElement | null>(null);
const copyModalPanelRef = ref<HTMLElement | null>(null);
let modalPreviousFocus: HTMLElement | null = null;

/** Public GitHub project (About card). Keep in sync with package homepage. */
const GITHUB_REPO_URL = "https://github.com/xinghaix/auto-complete";
const GITHUB_ISSUES_URL = "https://github.com/xinghaix/auto-complete/issues";
/** UI package version; monorepo keeps hosts aligned at release. */
const appVersion = "0.2.5";

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveStatusTimer: ReturnType<typeof setTimeout> | null = null;
let modelStatusTimer: ReturnType<typeof setTimeout> | null = null;
let statsPollTimer: ReturnType<typeof setInterval> | null = null;

// Auto-save suppression & dirty/serialization tracking
let suppressAutoSaveCount = 0;
let dirtyProfile = false;
let dirtyGlobal = false;
let inFlightSave: Promise<boolean> | null = null;
let inFlightRename: Promise<void> | null = null;
let subscribeGeneration = 0;
let batchBufferDuringSubscribe: LogEntry[] = [];
let subscribeInFlight = false;

const apiKeyPending = ref("");
const uiThemeLive = ref<UiTheme>("auto");
const ideThemeLive = ref("dark");

let unsubPush: (() => void) | null = null;

/** Auto-hide (ms) for model status banner (probe results stay visible until dismissed). */
const STATUS_HIDE_MS = { ok: 5000, warn: 8000, err: 15000 } as const;

function tr(key: MessageKey): string {
  return t(locale.value, key);
}

function formatMsg(template: string, ...args: Array<string | number>): string {
  let s = template;
  args.forEach((a, i) => {
    s = s.replace(new RegExp(`\\{${i}\\}`, "g"), String(a));
  });
  return s;
}

function runWithoutAutoSave(fn: () => void) {
  suppressAutoSaveCount++;
  try {
    fn();
  } finally {
    void nextTick(() => {
      suppressAutoSaveCount = Math.max(0, suppressAutoSaveCount - 1);
    });
  }
}

function clearModelStatus() {
  if (modelStatusTimer) {
    clearTimeout(modelStatusTimer);
    modelStatusTimer = null;
  }
  modelStatusText.value = "";
  modelStatusKind.value = "";
}

function clearProbeStatus() {
  probeText.value = "";
  probeKind.value = "";
  recommendedTemplate.value = "";
}

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

/** Probe results stay visible until dismissed (×) or replaced by another probe. */
function setProbeStatus(kind: "ok" | "err" | "warn", text: string, recommended = "") {
  probeKind.value = kind;
  probeText.value = text;
  recommendedTemplate.value = recommended;
}

function showToast(state: SaveState, msg: string) {
  saveState.value = state;
  saveMsg.value = msg;
}

const languageSelectValue = computed(() => (localeFollowIde.value ? "auto" : locale.value));
const connDisabled = computed(() => !activeId.value);
const maxLogKeep = computed(() => Math.min(Math.max(50, logRetention.value || 1000), 2000));

const profileIssues = computed(() => validateProfile(form.value, profiles.value.length > 0));
const globalIssues = computed(() =>
  validateGlobalSettings({
    debounceMinMs: debounceMinMs.value,
    debounceInitialMs: debounceInitialMs.value,
    debounceMaxMs: debounceMaxMs.value,
    maxPrefixChars: maxPrefixChars.value,
    maxSuffixChars: maxSuffixChars.value,
    maxInFlight: maxInFlight.value,
    cacheSize: cacheSize.value,
    lruSize: lruSize.value,
    maxFileSizeKb: maxFileSizeKb.value,
    recentFileLimit: recentFileLimit.value,
    recentFileMaxChars: recentFileMaxChars.value,
    logRetention: logRetention.value,
  }),
);

const fieldErrors = computed<Record<string, string>>(() => {
  const out: Record<string, string> = {};
  if (showProfileValidation.value) {
    for (const issue of profileIssues.value) {
      if (!out[issue.field]) out[issue.field] = tr(issue.key);
    }
  }
  for (const issue of globalIssues.value) {
    if (!out[issue.field]) out[issue.field] = tr(issue.key);
  }
  return out;
});

const filteredLogs = computed(() => {
  const min = LEVEL_ORDER.indexOf(logFilter.value as (typeof LEVEL_ORDER)[number]);
  const q = logSearch.value;
  return logs.value.filter((e) => {
    const lv = (e.level ?? "info").toLowerCase();
    const idx = LEVEL_ORDER.indexOf(lv as (typeof LEVEL_ORDER)[number]);
    if (idx >= 0 && idx < min) return false;
    return matchesLogQuery(e, q);
  });
});

const logText = computed(() => filteredLogs.value.map((e) => formatLogLine(e)).join("\n"));

const cacheHitRateText = computed(() => {
  const st = sessionStats.value;
  if (!st || !st.totalRequests) return "0%";
  return `${Math.round((st.cacheHits / st.totalRequests) * 100)}%`;
});

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
  { value: "CODELLAMA", label: tr("templateCodellama") },
  { value: "CHAT", label: tr("templateChat") },
  { value: "RESPONSES", label: tr("templateResponses") },
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

const presetItems = computed(() => [
  { preset: SERVICE_PRESETS[0], label: tr("presetOllama") },
  { preset: SERVICE_PRESETS[1], label: tr("presetDeepseek") },
  { preset: SERVICE_PRESETS[2], label: tr("presetMistral") },
  { preset: SERVICE_PRESETS[3], label: tr("presetVllm") },
]);

function numDisplay(field: string, value: number | undefined, fallback: number): string {
  if (field in numericDrafts.value) return numericDrafts.value[field];
  return String(value ?? fallback);
}

function onNumInput(field: string, raw: string, applyValue: (n: number) => void) {
  const parsed = parseOptionalNumber(raw);
  if (parsed === undefined) {
    numericDrafts.value = { ...numericDrafts.value, [field]: raw };
    return;
  }
  if (field in numericDrafts.value) {
    const next = { ...numericDrafts.value };
    delete next[field];
    numericDrafts.value = next;
  }
  applyValue(parsed);
}

function onNumBlur(field: string) {
  if (field in numericDrafts.value) {
    const next = { ...numericDrafts.value };
    delete next[field];
    numericDrafts.value = next;
  }
}

function setLocaleFromIde(raw?: string | null) {
  const next = detectLocale(raw);
  ideLocaleTag.value = raw?.trim() || "";
  locale.value = next;
  applyDocumentLocale(next);
}

function stopStatsPolling() {
  if (statsPollTimer) {
    clearInterval(statsPollTimer);
    statsPollTimer = null;
  }
}

async function refreshSessionStats() {
  try {
    const res = await bridge.request("getSessionStats");
    if (!res.ok || !res.payload || typeof res.payload !== "object") return;
    const p = res.payload as Partial<SessionStats>;
    if (typeof p.totalRequests === "number") {
      sessionStats.value = {
        totalRequests: p.totalRequests,
        cacheHits: p.cacheHits ?? 0,
        cancelled: p.cancelled ?? 0,
        failed: p.failed ?? 0,
        accepted: p.accepted ?? 0,
        p50LatencyMs: p.p50LatencyMs ?? null,
        p95LatencyMs: p.p95LatencyMs ?? null,
        currentDebounceMs: p.currentDebounceMs ?? null,
        backoffBlocked: Boolean(p.backoffBlocked),
        backoffFatal: Boolean(p.backoffFatal),
      };
    }
  } catch {
    /* optional host capability */
  }
}

async function onClearCaches() {
  if (clearingCaches.value) return;
  clearingCaches.value = true;
  try {
    const res = await bridge.request("clearCaches");
    if (res.ok) {
      showToast("saved", tr("cachesCleared"));
      await refreshSessionStats();
    } else {
      showToast("error", res.error || tr("failed"));
    }
  } catch (e) {
    showToast("error", e instanceof Error ? e.message : tr("failed"));
  } finally {
    clearingCaches.value = false;
  }
}

function leaveLogsTab() {
  stopStatsPolling();
  subscribeGeneration++;
  subscribeInFlight = false;
  batchBufferDuringSubscribe = [];
  if (logsSubscribed.value) {
    logsSubscribed.value = false;
    void bridge.request("unsubscribeLogs");
  }
}

function enterLogsTab() {
  if (!logsSubscribed.value) {
    logsSubscribed.value = true;
    const gen = ++subscribeGeneration;
    subscribeInFlight = true;
    batchBufferDuringSubscribe = [];
    void bridge
      .request("subscribeLogs", {
        level: logFilter.value,
        limit: maxLogKeep.value,
      })
      .then((res) => {
        if (gen !== subscribeGeneration) return;
        subscribeInFlight = false;
        const buffered = batchBufferDuringSubscribe;
        batchBufferDuringSubscribe = [];
        const entries = (res.payload as { entries?: LogEntry[] } | undefined)?.entries;
        if (Array.isArray(entries)) {
          logs.value = mergeLogEntries(entries, buffered, maxLogKeep.value);
        } else if (buffered.length > 0) {
          logs.value = mergeLogEntries(logs.value, buffered, maxLogKeep.value);
        }
        scrollLogsToBottomIfNeeded();
      })
      .catch(() => {
        if (gen === subscribeGeneration) {
          subscribeInFlight = false;
          batchBufferDuringSubscribe = [];
        }
      });
  }
  void refreshSessionStats();
  stopStatsPolling();
  statsPollTimer = setInterval(() => {
    if (tab.value === "logs") void refreshSessionStats();
  }, 5000);
}

function openTab(raw: string) {
  const next = normalizeTab(raw);
  const prev = tab.value;
  if (prev === "logs" && next !== "logs") {
    leaveLogsTab();
  }
  tab.value = next;
  if (next === "logs") {
    enterLogsTab();
  }
}

function onTabListKeydown(e: KeyboardEvent) {
  const idx = TAB_ORDER.indexOf(tab.value);
  if (idx < 0) return;
  let nextIdx = -1;
  if (e.key === "ArrowRight") nextIdx = (idx + 1) % TAB_ORDER.length;
  else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + TAB_ORDER.length) % TAB_ORDER.length;
  else if (e.key === "Home") nextIdx = 0;
  else if (e.key === "End") nextIdx = TAB_ORDER.length - 1;
  if (nextIdx < 0) return;
  e.preventDefault();
  const nextTab = TAB_ORDER[nextIdx];
  openTab(nextTab);
  void nextTick(() => {
    tabBtnRefs.value[nextTab]?.focus();
  });
}

function setTabBtnRef(tName: MainTab, el: unknown) {
  tabBtnRefs.value[tName] = el instanceof HTMLButtonElement ? el : null;
}

function scrollLogsToBottomIfNeeded() {
  if (!logAutoScroll.value) return;
  void nextTick(() => {
    const el = logsPaneRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function onLogsScroll() {
  const el = logsPaneRef.value;
  if (!el) return;
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  if (distanceFromBottom > 24 && logAutoScroll.value) {
    logAutoScroll.value = false;
  } else if (distanceFromBottom <= 12 && !logAutoScroll.value) {
    logAutoScroll.value = true;
  }
}

function onToggleAutoScroll() {
  logAutoScroll.value = !logAutoScroll.value;
  if (logAutoScroll.value) scrollLogsToBottomIfNeeded();
}

function cancelPendingSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  dirtyProfile = false;
  dirtyGlobal = false;
}

function applySnapshot(s: Snapshot) {
  cancelPendingSave();
  runWithoutAutoSave(() => {
    const list = s.profiles ?? [];
    profiles.value = list;
    const id = s.activeProfileId || list[0]?.id || "";
    const switchedProfile = id !== activeId.value;
    if (switchedProfile || !id) {
      // Security (P0-3): never carry unsaved API key across profiles
      apiKey.value = "";
      apiKeyPending.value = "";
      modelOptions.value = [];
      clearModelStatus();
      clearProbeStatus();
    }
    deleteConfirming.value = false;
    numericDrafts.value = {};
    activeId.value = id;
    const p = list.find((x) => x.id === id) ?? list[0];
    if (p) {
      form.value = { ...p };
      renameValue.value = p.name;
      showProfileValidation.value = !isBlankProfileDraft(p);
    } else {
      form.value = { id: "", name: "" };
      renameValue.value = "";
      showProfileValidation.value = false;
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
    } else {
      localeFollowIde.value = false;
      locale.value = loc as Locale;
      applyDocumentLocale(loc as Locale);
    }
    loaded.value = true;
  });
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
    showToast("error", res.error || tr("loadFailed"));
    return;
  }
  applySnapshot(res.payload as Snapshot);
}

function patchForm(partial: Partial<Profile>) {
  showProfileValidation.value = true;
  form.value = { ...form.value, ...partial };
}

/** Explicitly save API key for the active profile and update hasApiKey badge immediately. */
async function onSaveKey(): Promise<boolean> {
  const targetId = activeId.value;
  const secret = apiKey.value.trim();
  if (!targetId || !secret || savingKey.value) return false;
  savingKey.value = true;
  try {
    const res = await bridge.request("setSecret", { profileId: targetId, secret });
    if (!res.ok) {
      showToast("error", res.error || tr("keySaveFailed"));
      return false;
    }
    const payload = (res.payload ?? {}) as { profileId?: string; hasApiKey?: boolean };
    const hasKey = payload.hasApiKey ?? true;
    runWithoutAutoSave(() => {
      profiles.value = profiles.value.map((p) =>
        p.id === targetId ? { ...p, hasApiKey: hasKey } : p,
      );
      if (activeId.value === targetId) {
        form.value = { ...form.value, hasApiKey: hasKey };
      }
      apiKey.value = "";
      apiKeyPending.value = "";
    });
    showToast("saved", tr("keySaved"));
    return true;
  } catch (e) {
    showToast("error", e instanceof Error ? e.message : tr("keySaveFailed"));
    return false;
  } finally {
    savingKey.value = false;
  }
}

async function onClearKey() {
  const targetId = activeId.value;
  if (!targetId) return;
  await flushPendingSave();
  apiKey.value = "";
  apiKeyPending.value = "";
  const res = await bridge.request("clearSecret", { profileId: targetId });
  if (!res.ok) {
    showToast("error", res.error || tr("failed"));
    return;
  }
  const payload = (res.payload ?? {}) as { hasApiKey?: boolean };
  const hasKey = payload.hasApiKey ?? false;
  runWithoutAutoSave(() => {
    profiles.value = profiles.value.map((p) =>
      p.id === targetId ? { ...p, hasApiKey: hasKey } : p,
    );
    if (activeId.value === targetId) {
      form.value = { ...form.value, hasApiKey: hasKey };
    }
  });
  showToast("saved", tr("keyCleared"));
}

async function commitRename(): Promise<void> {
  if (inFlightRename) {
    await inFlightRename;
    return;
  }
  if (!activeId.value) return;
  const targetId = activeId.value;
  const next = renameValue.value.trim();
  const current = profiles.value.find((p) => p.id === targetId)?.name ?? "";
  if (!next || next === current) {
    renameValue.value = current;
    return;
  }
  const task = (async () => {
    await flushPendingSave();
    const res = await bridge.request("renameProfile", {
      profileId: targetId,
      name: next,
    });
    if (res.ok && res.payload) applySnapshot(res.payload as Snapshot);
    else await load();
  })();
  inFlightRename = task;
  try {
    await task;
  } finally {
    if (inFlightRename === task) inFlightRename = null;
  }
}

async function onSelectProfile(id: string) {
  if (!id || id === activeId.value) return;
  deleteConfirming.value = false;
  await commitRename();
  await flushPendingSave();
  // Always clear unsaved API key before switching profile
  apiKey.value = "";
  apiKeyPending.value = "";
  const res = await bridge.request("selectProfile", { profileId: id });
  if (res.ok && res.payload) applySnapshot(res.payload as Snapshot);
  else await load();
}

async function onCreate(presetId?: string, customName?: string) {
  deleteConfirming.value = false;
  await commitRename();
  await flushPendingSave();
  apiKey.value = "";
  apiKeyPending.value = "";
  const payload: { name: string; preset?: string } = {
    name: customName?.trim() || tr("defaultNewProfileName"),
  };
  if (presetId) payload.preset = presetId;
  const res = await bridge.request("createProfile", payload);
  if (res.ok && res.payload) applySnapshot(res.payload as Snapshot);
  else await load();
}

async function onApplyPreset(preset: ServicePreset, label: string) {
  if (!activeId.value) {
    await onCreate(preset.id, label);
    if (!activeId.value) return;
  }
  patchForm({
    baseUrl: preset.baseUrl,
    promptTemplate: preset.promptTemplate,
    fimPath: preset.fimPath,
    chatPath: preset.chatPath,
    completionsPath: preset.completionsPath,
  });
  showToast("saved", formatMsg(tr("presetApplied"), label));
}

function onDelete() {
  if (!activeId.value) return;
  deleteConfirming.value = true;
}

async function doDelete() {
  deleteConfirming.value = false;
  const targetId = activeId.value;
  if (!targetId) return;
  // Flush valid global edits, discard unsaved profile edits for the profile being deleted
  if (dirtyGlobal) {
    dirtyProfile = false;
    await flushPendingSave();
  } else {
    cancelPendingSave();
  }
  apiKey.value = "";
  apiKeyPending.value = "";
  const res = await bridge.request("deleteProfile", { profileId: targetId });
  if (res.ok && res.payload) applySnapshot(res.payload as Snapshot);
  else await load();
}

/** Flush unsaved API key (if entered) and pending form changes before network actions. */
async function flushBeforeProbe(opts?: { allowEmptyModel?: boolean }): Promise<string | null> {
  if (apiKey.value.trim() && activeId.value) {
    const savedKey = await onSaveKey();
    if (!savedKey) return tr("keySaveFailed");
  }
  showProfileValidation.value = true;
  const relevantIssues = opts?.allowEmptyModel
    ? profileIssues.value.filter((i) => i.field !== "model")
    : profileIssues.value;
  if (relevantIssues.length > 0) {
    const msg = tr(relevantIssues[0].key);
    showToast("error", msg);
    return msg;
  }
  await flushPendingSave({ allowEmptyModel: opts?.allowEmptyModel });
  return null;
}

/** Fetch OpenAI-compatible model list (also validates baseUrl/key connectivity). */
async function onFetchModels() {
  if (!activeId.value || modelsFetching.value) return;
  modelsFetching.value = true;
  setModelStatus("warn", tr("fetchingModels"), true);
  try {
    const validationErr = await flushBeforeProbe({ allowEmptyModel: true });
    if (validationErr) {
      setModelStatus("err", validationErr);
      return;
    }
    const res = await bridge.request("listModels", { profileId: activeId.value });
    if (!res.ok) {
      setModelStatus("err", formatMsg(tr("modelsFailed"), res.error || tr("failed")));
      return;
    }
    const raw =
      (res.payload as { models?: Array<{ id?: string; contextLength?: number | null } | string> })
        ?.models ?? [];
    const seen = new Set<string>();
    const list: ModelOption[] = [];
    for (const item of raw) {
      const id = (typeof item === "string" ? item : item?.id ?? "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      list.push({
        id,
        contextLength: typeof item === "string" ? null : item?.contextLength ?? null,
      });
    }
    modelOptions.value = list;
    if (list.length === 0) {
      setModelStatus("warn", tr("modelsEmpty"));
    } else {
      setModelStatus("ok", formatMsg(tr("modelsLoaded"), list.length));
      const cur = (form.value.model ?? "").trim();
      if (!cur) patchForm({ model: list[0].id });
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

/** Keep busy UI visible even when the probe returns in <100ms. */
const PROBE_BUSY_MIN_MS = 450;

async function runProbe(kind: "conn" | "one" | "all", work: () => Promise<void>): Promise<void> {
  if (probeBusy.value || connDisabled.value) return;
  probeBusy.value = true;
  probeBusyKind.value = kind;
  setProbeStatus("warn", tr("testing"));
  const started = Date.now();
  try {
    const validationErr = await flushBeforeProbe();
    if (validationErr) {
      setProbeStatus("err", validationErr);
      return;
    }
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

function probeResultKind(status?: string): "ok" | "warn" | "err" {
  if (status === "SUCCESS") return "ok";
  if (status === "EMPTY") return "warn";
  return "err";
}

async function onTestConnection() {
  await runProbe("conn", async () => {
    const res = await bridge.request("testConnection", { profileId: activeId.value });
    if (!res.ok) {
      setProbeStatus("err", res.error || tr("failed"));
      return;
    }
    const p = (res.payload ?? {}) as ProbeResult;
    setProbeStatus(probeResultKind(p.status), formatProbeLine(p));
  });
}

async function onProbeOne() {
  await runProbe("one", async () => {
    const tpl = form.value.promptTemplate || "AUTO";
    const res = await bridge.request("probeTemplate", {
      profileId: activeId.value,
      template: tpl,
    });
    if (!res.ok) {
      setProbeStatus("err", res.error || tr("failed"));
      return;
    }
    const p = (res.payload ?? {}) as ProbeResult;
    setProbeStatus(probeResultKind(p.status), formatProbeLine(p, tpl));
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
      results.map((r) => formatProbeLine(r)).join("\n") || (res.error ?? tr("failed"));
    const best = pickRecommendedTemplate(results);
    const kind: "ok" | "warn" | "err" = best
      ? "ok"
      : results.some((r) => r.status === "EMPTY")
        ? "warn"
        : "err";
    setProbeStatus(kind, text, best?.template ?? "");
  });
}

function onApplyRecommendedTemplate() {
  const tpl = recommendedTemplate.value;
  if (!tpl) return;
  patchForm({ promptTemplate: tpl });
  recommendedTemplate.value = "";
  showToast("saved", formatMsg(tr("recommendedTemplateApplied"), tpl));
}

function onLanguageChange(value: string) {
  if (value === "auto") {
    localeFollowIde.value = true;
    setLocaleFromIde(
      ideLocaleTag.value || (typeof navigator !== "undefined" ? navigator.language : "en"),
    );
    void loadPlatform();
    dirtyGlobal = true;
    scheduleSave();
    return;
  }
  localeFollowIde.value = false;
  locale.value = value as Locale;
  applyDocumentLocale(value as Locale);
  dirtyGlobal = true;
  scheduleSave();
}

/**
 * Copy text via UiBridge first (JCEF + VS Code reliable), fallback to
 * navigator.clipboard, then open an in-panel read-only textarea modal.
 */
async function copyTextWithFallback(
  text: string,
  okToastKey: MessageKey,
  modalTitleKey: MessageKey,
) {
  try {
    const res = await bridge.request("copyToClipboard", { text });
    const copied = (res.payload as { copied?: boolean } | undefined)?.copied;
    if (res.ok && copied !== false) {
      showToast("saved", tr(okToastKey));
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      showToast("saved", tr(okToastKey));
      return;
    }
  } catch {
    /* fall through */
  }
  openCopyModal(tr(modalTitleKey), text);
}

async function onExport() {
  try {
    await flushPendingSave();
    const res = await bridge.request("exportSettings");
    if (!res.ok) {
      showToast("error", res.error || tr("exportFailed"));
      return;
    }
    const json = (res.payload as { json?: string } | undefined)?.json ?? "";
    if (!json) {
      showToast("error", tr("exportFailed"));
      return;
    }
    await copyTextWithFallback(json, "exportOk", "copyModalTitleExport");
  } catch (e) {
    showToast("error", e instanceof Error ? e.message : tr("exportFailed"));
  }
}

function trapModalFocus(ev: KeyboardEvent, panel: HTMLElement | null) {
  if (ev.key !== "Tab" || !panel) return;
  const focusables = Array.from(
    panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (ev.shiftKey && (active === first || !panel.contains(active))) {
    ev.preventDefault();
    last.focus();
  } else if (!ev.shiftKey && (active === last || !panel.contains(active))) {
    ev.preventDefault();
    first.focus();
  }
}

function onModalDocumentKeydown(ev: KeyboardEvent) {
  if (importModalOpen.value) {
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      closeImportModal();
      return;
    }
    trapModalFocus(ev, importModalPanelRef.value);
  } else if (copyModalOpen.value) {
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      closeCopyModal();
      return;
    }
    trapModalFocus(ev, copyModalPanelRef.value);
  }
}

function attachModalKeyListener() {
  document.addEventListener("keydown", onModalDocumentKeydown, true);
}

function detachModalKeyListener() {
  if (!importModalOpen.value && !copyModalOpen.value) {
    document.removeEventListener("keydown", onModalDocumentKeydown, true);
  }
}

function openImportModal() {
  modalPreviousFocus = document.activeElement as HTMLElement | null;
  importJsonText.value = "";
  importModalError.value = "";
  importModalOpen.value = true;
  attachModalKeyListener();
  void nextTick(() => {
    importTextareaRef.value?.focus();
  });
}

function closeImportModal() {
  importModalOpen.value = false;
  importJsonText.value = "";
  importModalError.value = "";
  detachModalKeyListener();
  modalPreviousFocus?.focus();
  modalPreviousFocus = null;
}

function openCopyModal(title: string, text: string) {
  modalPreviousFocus = document.activeElement as HTMLElement | null;
  copyModalTitle.value = title;
  copyModalText.value = text;
  copyModalOpen.value = true;
  attachModalKeyListener();
  void nextTick(() => {
    copyTextareaRef.value?.focus();
    copyTextareaRef.value?.select();
  });
}

function closeCopyModal() {
  copyModalOpen.value = false;
  copyModalTitle.value = "";
  copyModalText.value = "";
  detachModalKeyListener();
  modalPreviousFocus?.focus();
  modalPreviousFocus = null;
}

async function confirmImport() {
  const json = importJsonText.value.trim();
  if (!json) {
    importModalError.value = tr("importEmpty");
    importTextareaRef.value?.focus();
    return;
  }
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      importModalError.value = tr("importInvalidJson");
      importTextareaRef.value?.focus();
      return;
    }
  } catch {
    importModalError.value = tr("importInvalidJson");
    importTextareaRef.value?.focus();
    return;
  }
  importModalError.value = "";
  try {
    const res = await bridge.request("importSettings", { json });
    if (!res.ok) {
      importModalError.value = res.error || tr("importFailed");
      return;
    }
    closeImportModal();
    await load();
    showToast("saved", tr("importOk"));
  } catch (e) {
    importModalError.value = e instanceof Error ? e.message : tr("importFailed");
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
  showToast("error", tr("aboutOpenFailed"));
}

/** Jump to host IDE Keymap / Keyboard Shortcuts for manual trigger. */
async function openKeymap() {
  try {
    const res = await bridge.request("openKeymap");
    if (res.ok) return;
    showToast("error", res.error?.trim() || tr("openKeymapFailed"));
  } catch {
    showToast("error", tr("openKeymapFailed"));
  }
}

function onThemeChange(value: string) {
  const next = normalizeUiTheme(value);
  uiTheme.value = next;
  applyResolvedTheme(next, ideThemeLive.value);
}

async function doSave(opts?: {
  silentBlankDraft?: boolean;
  allowEmptyModel?: boolean;
}): Promise<boolean> {
  if (!loaded.value) return false;
  if (inFlightSave) await inFlightSave;

  const task = (async (): Promise<boolean> => {
    const gErrs = globalIssues.value;
    if (gErrs.length > 0) {
      showToast("error", tr(gErrs[0].key));
      return false;
    }

    const pErrs = opts?.allowEmptyModel
      ? profileIssues.value.filter((i) => i.field !== "model")
      : profileIssues.value;
    const canSaveProfile = pErrs.length === 0;

    if (!canSaveProfile && !dirtyGlobal) {
      if (opts?.silentBlankDraft && isBlankProfileDraft(form.value)) {
        dirtyProfile = false;
        return true;
      }
      showProfileValidation.value = true;
      showToast("error", tr(pErrs[0].key));
      return false;
    }

    // Decoupled save (P1-2): when global settings changed while the active profile
    // is an incomplete draft, persist global settings with last-saved profiles.
    const nextProfiles = canSaveProfile
      ? profiles.value.map((p) =>
          p.id === form.value.id ? { ...p, ...form.value, hasApiKey: undefined } : p,
        )
      : profiles.value.map((p) => ({ ...p, hasApiKey: undefined }));

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

    const hadDirtyProfile = dirtyProfile;
    dirtyGlobal = false;
    if (canSaveProfile) dirtyProfile = false;

    showToast("saving", tr("saving"));
    const res = await bridge.request("applySettings", payload);
    if (res.ok) {
      if (canSaveProfile) {
        runWithoutAutoSave(() => {
          profiles.value = profiles.value.map((p) =>
            p.id === form.value.id ? { ...p, ...form.value, hasApiKey: p.hasApiKey } : p,
          );
        });
      }
      if (!canSaveProfile && hadDirtyProfile && !(opts?.silentBlankDraft && isBlankProfileDraft(form.value))) {
        showProfileValidation.value = true;
        showToast("error", tr(pErrs[0].key));
      } else {
        showToast("saved", tr("saved"));
      }
      return true;
    }
    showToast("error", res.error || tr("saveError"));
    return false;
  })();

  inFlightSave = task;
  try {
    return await task;
  } finally {
    if (inFlightSave === task) inFlightSave = null;
  }
}

async function flushPendingSave(opts?: { allowEmptyModel?: boolean }): Promise<boolean> {
  const hadTimer = saveTimer !== null;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!hadTimer && !dirtyProfile && !dirtyGlobal) {
    if (inFlightSave) return await inFlightSave;
    return true;
  }
  return await doSave({ silentBlankDraft: true, allowEmptyModel: opts?.allowEmptyModel });
}

function scheduleSave() {
  if (!loaded.value || suppressAutoSaveCount > 0) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void doSave();
  }, AUTOSAVE_DELAY);
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

watch(importJsonText, () => {
  if (importModalError.value) importModalError.value = "";
});

// Automatically lower logFilter when user lowers logLevel (e.g. switches to debug)
watch(logLevel, (nextLevel) => {
  const nextIdx = LEVEL_ORDER.indexOf(nextLevel as (typeof LEVEL_ORDER)[number]);
  const curIdx = LEVEL_ORDER.indexOf(logFilter.value as (typeof LEVEL_ORDER)[number]);
  if (nextIdx >= 0 && curIdx >= 0 && nextIdx < curIdx) {
    logFilter.value = nextLevel;
  }
});

watch(
  () => filteredLogs.value.length,
  () => scrollLogsToBottomIfNeeded(),
);

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

// Profile fields auto-save watcher
watch(
  form,
  () => {
    if (!loaded.value || suppressAutoSaveCount > 0) return;
    dirtyProfile = true;
    scheduleSave();
  },
  { deep: true },
);

// Global settings auto-save watcher (decoupled from profile validation)
watch(
  [
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
  () => {
    if (!loaded.value || suppressAutoSaveCount > 0) return;
    dirtyGlobal = true;
    scheduleSave();
  },
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
      if (entries.length === 0) return;
      if (subscribeInFlight) {
        batchBufferDuringSubscribe.push(...entries);
      } else {
        logs.value = mergeLogEntries(logs.value, entries, maxLogKeep.value);
      }
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
  document.removeEventListener("keydown", onModalDocumentKeydown, true);
  delete window.__acSetTab;
  leaveLogsTab();
  if (saveTimer) clearTimeout(saveTimer);
  if (saveStatusTimer) clearTimeout(saveStatusTimer);
  if (modelStatusTimer) clearTimeout(modelStatusTimer);
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

async function copyLogs() {
  const text = logText.value;
  if (!text) {
    showToast("error", tr("copyLogsEmpty"));
    return;
  }
  await copyTextWithFallback(text, "copyLogsOk", "copyModalTitleLogs");
}

function statusCodeClass(status?: number | null): string {
  if (typeof status !== "number") return "";
  if (status >= 200 && status < 300) return "ok";
  if (status >= 400) return "err";
  return "warn";
}

function logLevelClass(lv?: string): string {
  const v = (lv ?? "info").toLowerCase();
  if (v === "debug" || v === "info" || v === "warn" || v === "error") return v;
  return "info";
}

function compactLogTime(raw?: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  const tIdx = s.indexOf("T");
  if (tIdx > 0) return s.slice(tIdx + 1).replace(/Z$/, "");
  return s;
}
</script>

<template>
  <div class="app">
    <header class="header">
      <div class="tabs" role="tablist" @keydown="onTabListKeydown">
        <button
          :id="'tab-config'"
          :ref="(el) => setTabBtnRef('config', el)"
          type="button"
          role="tab"
          :tabindex="tab === 'config' ? 0 : -1"
          :class="{ active: tab === 'config' }"
          :aria-selected="tab === 'config'"
          :aria-controls="'panel-config'"
          @click="openTab('config')"
        >
          {{ tr("tabConfig") }}
        </button>
        <button
          :id="'tab-behavior'"
          :ref="(el) => setTabBtnRef('behavior', el)"
          type="button"
          role="tab"
          :tabindex="tab === 'behavior' ? 0 : -1"
          :class="{ active: tab === 'behavior' }"
          :aria-selected="tab === 'behavior'"
          :aria-controls="'panel-behavior'"
          @click="openTab('behavior')"
        >
          {{ tr("tabBehavior") }}
        </button>
        <button
          :id="'tab-performance'"
          :ref="(el) => setTabBtnRef('performance', el)"
          type="button"
          role="tab"
          :tabindex="tab === 'performance' ? 0 : -1"
          :class="{ active: tab === 'performance' }"
          :aria-selected="tab === 'performance'"
          :aria-controls="'panel-performance'"
          @click="openTab('performance')"
        >
          {{ tr("tabPerformance") }}
        </button>
        <button
          :id="'tab-general'"
          :ref="(el) => setTabBtnRef('general', el)"
          type="button"
          role="tab"
          :tabindex="tab === 'general' ? 0 : -1"
          :class="{ active: tab === 'general' }"
          :aria-selected="tab === 'general'"
          :aria-controls="'panel-general'"
          @click="openTab('general')"
        >
          {{ tr("tabGeneral") }}
        </button>
        <button
          :id="'tab-logs'"
          :ref="(el) => setTabBtnRef('logs', el)"
          type="button"
          role="tab"
          :tabindex="tab === 'logs' ? 0 : -1"
          :class="{ active: tab === 'logs' }"
          :aria-selected="tab === 'logs'"
          :aria-controls="'panel-logs'"
          @click="openTab('logs')"
        >
          {{ tr("tabLogs") }}
        </button>
      </div>
    </header>

    <div
      :id="`panel-${tab}`"
      class="scroll"
      role="tabpanel"
      :aria-labelledby="`tab-${tab}`"
    >
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
            <button type="button" class="btn btn-secondary" @click="void onCreate()">
              {{ tr("newProfile") }}
            </button>
            <span v-if="deleteConfirming" class="delete-confirm">
              <span class="delete-confirm-text">{{ tr("confirmDeleteInline") }}</span>
              <button type="button" class="btn btn-danger" @click="void doDelete()">
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
            <div class="preset-bar">
              <span class="preset-label">{{ tr("quickPresets") }}</span>
              <div class="preset-chips">
                <button
                  v-for="item in presetItems"
                  :key="item.preset.id"
                  type="button"
                  class="btn btn-ghost preset-btn"
                  @click="void onApplyPreset(item.preset, item.label)"
                >
                  {{ item.label }}
                </button>
              </div>
            </div>
          </template>

          <fieldset :disabled="connDisabled" style="border: 0; margin: 0; padding: 0">
            <PropertyRow
              :label="tr('baseUrl')"
              :help="tr('helpBaseUrl')"
              :error="fieldErrors.baseUrl"
              input-id="field-base-url"
              required
            >
              <input
                id="field-base-url"
                type="text"
                :value="form.baseUrl ?? ''"
                placeholder="http://127.0.0.1:11434/v1"
                spellcheck="false"
                @input="patchForm({ baseUrl: ($event.target as HTMLInputElement).value })"
              />
            </PropertyRow>
            <PropertyRow
              :label="tr('apiKey')"
              :help="tr('helpApiKey')"
              input-id="field-api-key"
            >
              <div class="key-input-row">
                <input
                  id="field-api-key"
                  v-model="apiKey"
                  type="password"
                  placeholder="••••••••"
                  autocomplete="off"
                  @keydown.enter.prevent="void onSaveKey()"
                />
                <button
                  type="button"
                  class="btn btn-primary"
                  :disabled="!activeId || !apiKey.trim() || savingKey"
                  :aria-busy="savingKey"
                  @click="void onSaveKey()"
                >
                  {{ savingKey ? tr("savingKey") : tr("saveKey") }}
                </button>
              </div>
              <div class="key-meta-row">
                <span class="pill" :class="{ on: form.hasApiKey }">
                  {{ form.hasApiKey ? tr("keyConfigured") : tr("keyMissing") }}
                </span>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  :disabled="!activeId"
                  @click="void onClearKey()"
                >
                  {{ tr("clearKey") }}
                </button>
              </div>
              <p class="row-help">{{ tr("secretHint") }}</p>
            </PropertyRow>
            <PropertyRow
              :label="tr('model')"
              :help="tr('helpModel')"
              :error="fieldErrors.model"
              input-id="field-model"
              required
            >
              <ModelCombo
                input-id="field-model"
                :model-value="form.model ?? ''"
                :options="modelOptions"
                :disabled="connDisabled"
                placeholder="qwen2.5-coder:7b"
                :aria-label="tr('model')"
                :fetching="modelsFetching"
                :fetch-label="tr('fetchModels')"
                :fetching-label="tr('fetchingModels')"
                :empty-hint="tr('modelsHintEmpty')"
                :no-match-hint="tr('modelsNoMatch')"
                @update:model-value="(v) => patchForm({ model: v })"
                @fetch="void onFetchModels()"
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
                  :aria-label="tr('dismiss')"
                  @click="clearModelStatus()"
                >
                  ×
                </button>
              </div>
            </PropertyRow>
            <PropertyRow
              :label="tr('promptTemplate')"
              :help="tr('helpTemplate')"
              input-id="field-template"
            >
              <SelectCombo
                id="field-template"
                :model-value="form.promptTemplate ?? 'AUTO'"
                :options="templateOptions"
                :disabled="connDisabled"
                :aria-label="tr('promptTemplate')"
                @update:model-value="(v) => patchForm({ promptTemplate: v })"
              />
              <div class="hstack">
                <button
                  type="button"
                  class="btn btn-primary"
                  :disabled="probeBusy || connDisabled"
                  :aria-busy="probeBusyKind === 'conn'"
                  @click="void onTestConnection()"
                >
                  {{ probeBusyKind === "conn" ? tr("testing") : tr("testConnection") }}
                </button>
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
                  <strong v-if="!probeBusy">{{ tr("probeResults") }}</strong>
                  <pre>{{ probeText }}</pre>
                  <div v-if="recommendedTemplate && !probeBusy" class="probe-apply-row">
                    <button
                      type="button"
                      class="btn btn-primary btn-sm"
                      @click="onApplyRecommendedTemplate()"
                    >
                      {{ formatMsg(tr("applyRecommendedTemplate"), recommendedTemplate) }}
                    </button>
                  </div>
                </div>
                <button
                  v-if="!probeBusy"
                  type="button"
                  class="result-dismiss"
                  :aria-label="tr('dismiss')"
                  @click="clearProbeStatus()"
                >
                  ×
                </button>
              </div>
            </PropertyRow>
            <PropertyRow
              :label="tr('maxTokens')"
              :help="tr('helpMaxTokens')"
              :error="fieldErrors.maxTokens"
              input-id="field-max-tokens"
            >
              <input
                id="field-max-tokens"
                type="number"
                min="16"
                max="1024"
                :value="numDisplay('maxTokens', form.maxTokens, 128)"
                @input="
                  onNumInput('maxTokens', ($event.target as HTMLInputElement).value, (n) =>
                    patchForm({ maxTokens: n }),
                  )
                "
                @blur="onNumBlur('maxTokens')"
              />
            </PropertyRow>
            <PropertyRow
              :label="tr('timeoutMs')"
              :help="tr('helpTimeout')"
              :error="fieldErrors.timeoutMs"
              input-id="field-timeout-ms"
            >
              <input
                id="field-timeout-ms"
                type="number"
                min="500"
                max="30000"
                :value="numDisplay('timeoutMs', form.timeoutMs, 3000)"
                @input="
                  onNumInput('timeoutMs', ($event.target as HTMLInputElement).value, (n) =>
                    patchForm({ timeoutMs: n }),
                  )
                "
                @blur="onNumBlur('timeoutMs')"
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
              <PropertyRow
                :label="tr('settingsTimeoutMs')"
                :help="tr('helpSettingsTimeout')"
                :error="fieldErrors.settingsTimeoutMs"
                input-id="field-settings-timeout-ms"
              >
                <input
                  id="field-settings-timeout-ms"
                  type="number"
                  min="1000"
                  max="120000"
                  :value="numDisplay('settingsTimeoutMs', form.settingsTimeoutMs, 15000)"
                  @input="
                    onNumInput(
                      'settingsTimeoutMs',
                      ($event.target as HTMLInputElement).value,
                      (n) => patchForm({ settingsTimeoutMs: n }),
                    )
                  "
                  @blur="onNumBlur('settingsTimeoutMs')"
                />
              </PropertyRow>
              <PropertyRow
                :label="tr('temperature')"
                :help="tr('helpTemperature')"
                :error="fieldErrors.temperature"
                input-id="field-temperature"
              >
                <input
                  id="field-temperature"
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  :value="numDisplay('temperature', form.temperature, 0)"
                  @input="
                    onNumInput('temperature', ($event.target as HTMLInputElement).value, (n) =>
                      patchForm({ temperature: n }),
                    )
                  "
                  @blur="onNumBlur('temperature')"
                />
              </PropertyRow>
              <CheckRow
                :model-value="!!form.stream"
                :label="tr('stream')"
                :help="tr('helpStream')"
                @update:model-value="(v) => patchForm({ stream: v })"
              />
              <PropertyRow
                :label="tr('authHeader')"
                :help="tr('helpAuthHeader')"
                :error="fieldErrors.authHeaderTemplate"
                input-id="field-auth-header"
              >
                <input
                  id="field-auth-header"
                  type="text"
                  :value="form.authHeaderTemplate ?? DEFAULT_AUTH_HEADER"
                  spellcheck="false"
                  @input="
                    patchForm({
                      authHeaderTemplate: ($event.target as HTMLInputElement).value,
                    })
                  "
                />
              </PropertyRow>
              <PropertyRow
                :label="tr('fimPath')"
                :help="tr('helpFimPath')"
                input-id="field-fim-path"
              >
                <input
                  id="field-fim-path"
                  type="text"
                  :value="form.fimPath ?? ''"
                  spellcheck="false"
                  @input="patchForm({ fimPath: ($event.target as HTMLInputElement).value })"
                />
              </PropertyRow>
              <PropertyRow
                :label="tr('chatPath')"
                :help="tr('helpChatPath')"
                input-id="field-chat-path"
              >
                <input
                  id="field-chat-path"
                  type="text"
                  :value="form.chatPath ?? '/chat/completions'"
                  spellcheck="false"
                  @input="patchForm({ chatPath: ($event.target as HTMLInputElement).value })"
                />
              </PropertyRow>
              <PropertyRow
                :label="tr('completionsPath')"
                :help="tr('helpCompletionsPath')"
                input-id="field-completions-path"
              >
                <input
                  id="field-completions-path"
                  type="text"
                  :value="form.completionsPath ?? ''"
                  spellcheck="false"
                  @input="
                    patchForm({ completionsPath: ($event.target as HTMLInputElement).value })
                  "
                />
              </PropertyRow>
              <PropertyRow
                :label="tr('responsesPath')"
                :help="tr('helpResponsesPath')"
                input-id="field-responses-path"
              >
                <input
                  id="field-responses-path"
                  type="text"
                  :value="form.responsesPath ?? ''"
                  placeholder="/responses"
                  spellcheck="false"
                  @input="
                    patchForm({ responsesPath: ($event.target as HTMLInputElement).value })
                  "
                />
              </PropertyRow>
              <PropertyRow
                :label="tr('extraHeaders')"
                :help="tr('helpExtraHeaders')"
                :error="fieldErrors.extraHeadersJson"
                input-id="field-extra-headers"
              >
                <textarea
                  id="field-extra-headers"
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
              <PropertyRow
                :label="tr('extraBodyJson')"
                :help="tr('helpExtraBodyJson')"
                :error="fieldErrors.extraBodyJson"
                input-id="field-extra-body"
              >
                <textarea
                  id="field-extra-body"
                  rows="2"
                  :value="form.extraBodyJson ?? ''"
                  placeholder='{"top_p": 0.9}'
                  spellcheck="false"
                  @input="
                    patchForm({
                      extraBodyJson: ($event.target as HTMLTextAreaElement).value,
                    })
                  "
                />
              </PropertyRow>
              <PropertyRow
                :label="tr('stopSequences')"
                :help="tr('helpStopSequences')"
                input-id="field-stop-sequences"
              >
                <input
                  id="field-stop-sequences"
                  type="text"
                  :value="form.stopSequences ?? ''"
                  placeholder="```, \n\n"
                  spellcheck="false"
                  @input="patchForm({ stopSequences: ($event.target as HTMLInputElement).value })"
                />
              </PropertyRow>
              <CheckRow
                :model-value="!!form.overrideContextBudget"
                :label="tr('overrideBudget')"
                :help="tr('helpOverrideBudget')"
                @update:model-value="(v) => patchForm({ overrideContextBudget: v })"
              />
              <PropertyRow
                :label="tr('maxPrefix')"
                :help="tr('helpMaxPrefix')"
                :error="fieldErrors.profileMaxPrefixChars"
                input-id="field-profile-max-prefix"
              >
                <input
                  id="field-profile-max-prefix"
                  type="number"
                  min="1"
                  :value="numDisplay('profileMaxPrefixChars', form.maxPrefixChars, 8000)"
                  :disabled="!form.overrideContextBudget"
                  @input="
                    onNumInput(
                      'profileMaxPrefixChars',
                      ($event.target as HTMLInputElement).value,
                      (n) => patchForm({ maxPrefixChars: n }),
                    )
                  "
                  @blur="onNumBlur('profileMaxPrefixChars')"
                />
              </PropertyRow>
              <PropertyRow
                :label="tr('maxSuffix')"
                :help="tr('helpMaxSuffix')"
                :error="fieldErrors.profileMaxSuffixChars"
                input-id="field-profile-max-suffix"
              >
                <input
                  id="field-profile-max-suffix"
                  type="number"
                  min="1"
                  :value="numDisplay('profileMaxSuffixChars', form.maxSuffixChars, 2000)"
                  :disabled="!form.overrideContextBudget"
                  @input="
                    onNumInput(
                      'profileMaxSuffixChars',
                      ($event.target as HTMLInputElement).value,
                      (n) => patchForm({ maxSuffixChars: n }),
                    )
                  "
                  @blur="onNumBlur('profileMaxSuffixChars')"
                />
              </PropertyRow>
            </div>
          </fieldset>
        </GroupCard>
      </template>

      <!-- Behavior -->
      <template v-if="tab === 'behavior'">
        <GroupCard :title="tr('sectionBehavior')" :measure-key="locale">
          <CheckRow v-model="enabled" :label="tr('enabled')" :help="tr('helpEnabled')" />
          <CheckRow
            v-model="autoTrigger"
            :label="tr('autoTrigger')"
            :help="tr('helpAutoTrigger')"
          />
          <PropertyRow
            :label="tr('manualTriggerShortcut')"
            :help="tr('helpManualTriggerShortcut')"
          >
            <button type="button" class="btn btn-secondary" @click="void openKeymap()">
              {{ tr("openKeymap") }}
            </button>
          </PropertyRow>
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
          <PropertyRow
            :label="tr('disabledLanguages')"
            :help="tr('helpDisabledLanguages')"
            input-id="field-disabled-languages"
          >
            <input
              id="field-disabled-languages"
              v-model="disabledLanguages"
              type="text"
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
          <PropertyRow
            :label="tr('ignoreGlobs')"
            :help="tr('helpIgnoreGlobs')"
            input-id="field-ignore-globs"
          >
            <textarea id="field-ignore-globs" v-model="ignoreGlobs" rows="6" spellcheck="false" />
          </PropertyRow>
        </GroupCard>
      </template>

      <!-- Performance -->
      <template v-if="tab === 'performance'">
        <GroupCard :title="tr('sectionDebounce')" :measure-key="locale">
          <p class="hint-block" style="margin: 0 12px 8px">{{ tr("helpDebounce") }}</p>
          <PropertyRow
            :label="tr('debounceInitial')"
            :help="tr('helpDebounceInitial')"
            :error="fieldErrors.debounceInitialMs"
            input-id="field-debounce-initial"
          >
            <input
              id="field-debounce-initial"
              type="number"
              min="0"
              :value="numDisplay('debounceInitialMs', debounceInitialMs, 300)"
              @input="
                onNumInput('debounceInitialMs', ($event.target as HTMLInputElement).value, (n) => {
                  debounceInitialMs = n;
                })
              "
              @blur="onNumBlur('debounceInitialMs')"
            />
          </PropertyRow>
          <PropertyRow
            :label="tr('debounceMin')"
            :help="tr('helpDebounceMin')"
            input-id="field-debounce-min"
          >
            <input
              id="field-debounce-min"
              type="number"
              min="0"
              :value="numDisplay('debounceMinMs', debounceMinMs, 150)"
              @input="
                onNumInput('debounceMinMs', ($event.target as HTMLInputElement).value, (n) => {
                  debounceMinMs = n;
                })
              "
              @blur="onNumBlur('debounceMinMs')"
            />
          </PropertyRow>
          <PropertyRow
            :label="tr('debounceMax')"
            :help="tr('helpDebounceMax')"
            input-id="field-debounce-max"
          >
            <input
              id="field-debounce-max"
              type="number"
              min="0"
              :value="numDisplay('debounceMaxMs', debounceMaxMs, 1000)"
              @input="
                onNumInput('debounceMaxMs', ($event.target as HTMLInputElement).value, (n) => {
                  debounceMaxMs = n;
                })
              "
              @blur="onNumBlur('debounceMaxMs')"
            />
          </PropertyRow>
        </GroupCard>
        <GroupCard :title="tr('sectionContext')" :measure-key="locale">
          <p class="hint-block" style="margin: 0 12px 8px">{{ tr("helpContextBudget") }}</p>
          <PropertyRow
            :label="tr('maxPrefix')"
            :help="tr('helpMaxPrefix')"
            :error="fieldErrors.maxPrefixChars"
            input-id="field-max-prefix"
          >
            <input
              id="field-max-prefix"
              type="number"
              min="1"
              :value="numDisplay('maxPrefixChars', maxPrefixChars, 8000)"
              @input="
                onNumInput('maxPrefixChars', ($event.target as HTMLInputElement).value, (n) => {
                  maxPrefixChars = n;
                })
              "
              @blur="onNumBlur('maxPrefixChars')"
            />
          </PropertyRow>
          <PropertyRow
            :label="tr('maxSuffix')"
            :help="tr('helpMaxSuffix')"
            :error="fieldErrors.maxSuffixChars"
            input-id="field-max-suffix"
          >
            <input
              id="field-max-suffix"
              type="number"
              min="1"
              :value="numDisplay('maxSuffixChars', maxSuffixChars, 2000)"
              @input="
                onNumInput('maxSuffixChars', ($event.target as HTMLInputElement).value, (n) => {
                  maxSuffixChars = n;
                })
              "
              @blur="onNumBlur('maxSuffixChars')"
            />
          </PropertyRow>
        </GroupCard>
        <GroupCard :title="tr('sectionEngine')" :measure-key="locale">
          <PropertyRow
            :label="tr('cacheSize')"
            :help="tr('helpCacheSize')"
            :error="fieldErrors.cacheSize"
            input-id="field-cache-size"
          >
            <input
              id="field-cache-size"
              type="number"
              min="1"
              :value="numDisplay('cacheSize', cacheSize, 20)"
              @input="
                onNumInput('cacheSize', ($event.target as HTMLInputElement).value, (n) => {
                  cacheSize = n;
                })
              "
              @blur="onNumBlur('cacheSize')"
            />
          </PropertyRow>
          <PropertyRow
            :label="tr('lruSize')"
            :help="tr('helpLruSize')"
            :error="fieldErrors.lruSize"
            input-id="field-lru-size"
          >
            <input
              id="field-lru-size"
              type="number"
              min="1"
              :value="numDisplay('lruSize', lruSize, 64)"
              @input="
                onNumInput('lruSize', ($event.target as HTMLInputElement).value, (n) => {
                  lruSize = n;
                })
              "
              @blur="onNumBlur('lruSize')"
            />
          </PropertyRow>
          <PropertyRow
            :label="tr('maxInFlight')"
            :help="tr('helpMaxInFlight')"
            :error="fieldErrors.maxInFlight"
            input-id="field-max-in-flight"
          >
            <input
              id="field-max-in-flight"
              type="number"
              min="1"
              :value="numDisplay('maxInFlight', maxInFlight, 1)"
              @input="
                onNumInput('maxInFlight', ($event.target as HTMLInputElement).value, (n) => {
                  maxInFlight = n;
                })
              "
              @blur="onNumBlur('maxInFlight')"
            />
          </PropertyRow>
          <PropertyRow
            :label="tr('maxFileSize')"
            :help="tr('helpMaxFileSize')"
            :error="fieldErrors.maxFileSizeKb"
            input-id="field-max-file-size"
          >
            <input
              id="field-max-file-size"
              type="number"
              min="1"
              :value="numDisplay('maxFileSizeKb', maxFileSizeKb, 512)"
              @input="
                onNumInput('maxFileSizeKb', ($event.target as HTMLInputElement).value, (n) => {
                  maxFileSizeKb = n;
                })
              "
              @blur="onNumBlur('maxFileSizeKb')"
            />
          </PropertyRow>
        </GroupCard>
        <GroupCard :title="tr('sectionRecent')" :measure-key="locale">
          <CheckRow
            v-model="enableRecentFileContext"
            :label="tr('enableRecent')"
            :help="tr('helpEnableRecent')"
          />
          <PropertyRow
            :label="tr('recentLimit')"
            :help="tr('helpRecentLimit')"
            :error="fieldErrors.recentFileLimit"
            input-id="field-recent-limit"
          >
            <input
              id="field-recent-limit"
              type="number"
              min="0"
              :value="numDisplay('recentFileLimit', recentFileLimit, 3)"
              :disabled="!enableRecentFileContext"
              @input="
                onNumInput('recentFileLimit', ($event.target as HTMLInputElement).value, (n) => {
                  recentFileLimit = n;
                })
              "
              @blur="onNumBlur('recentFileLimit')"
            />
          </PropertyRow>
          <PropertyRow
            :label="tr('recentMaxChars')"
            :help="tr('helpRecentMaxChars')"
            :error="fieldErrors.recentFileMaxChars"
            input-id="field-recent-max-chars"
          >
            <input
              id="field-recent-max-chars"
              type="number"
              min="1"
              :value="numDisplay('recentFileMaxChars', recentFileMaxChars, 1200)"
              :disabled="!enableRecentFileContext"
              @input="
                onNumInput('recentFileMaxChars', ($event.target as HTMLInputElement).value, (n) => {
                  recentFileMaxChars = n;
                })
              "
              @blur="onNumBlur('recentFileMaxChars')"
            />
          </PropertyRow>
        </GroupCard>
      </template>

      <!-- General -->
      <template v-if="tab === 'general'">
        <GroupCard :title="tr('sectionGeneral')" :measure-key="locale">
          <PropertyRow
            :label="tr('language')"
            :help="tr('helpLanguage')"
            input-id="field-language"
          >
            <SelectCombo
              id="field-language"
              :model-value="languageSelectValue"
              :options="languageOptions"
              :aria-label="tr('language')"
              @update:model-value="onLanguageChange"
            />
          </PropertyRow>
          <PropertyRow :label="tr('theme')" :help="tr('helpTheme')" input-id="field-theme">
            <SelectCombo
              id="field-theme"
              :model-value="uiTheme"
              :options="themeOptions"
              :aria-label="tr('theme')"
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
              <button
                type="button"
                class="btn btn-primary"
                @click="void openExternal(GITHUB_REPO_URL)"
              >
                {{ tr("aboutOpenGithub") }}
              </button>
              <button
                type="button"
                class="btn btn-secondary"
                @click="void openExternal(GITHUB_ISSUES_URL)"
              >
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

        <!-- Compact Local Session Stats bar (optional host capability) -->
        <div v-if="sessionStats" class="stats-bar" role="region" :aria-label="tr('statsTitle')">
          <div class="stats-bar-head">
            <span class="stats-bar-title">{{ tr("statsTitle") }}</span>
            <span
              class="pill"
              :class="{
                on: !sessionStats.backoffBlocked && !sessionStats.backoffFatal,
                warn: sessionStats.backoffBlocked && !sessionStats.backoffFatal,
                err: sessionStats.backoffFatal,
              }"
            >
              {{
                sessionStats.backoffFatal
                  ? tr("statsBackoffFatal")
                  : sessionStats.backoffBlocked
                    ? tr("statsBackoffWarn")
                    : tr("statsBackoffOk")
              }}
            </span>
            <div class="stats-bar-actions">
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                @click="void refreshSessionStats()"
              >
                {{ tr("refreshStats") }}
              </button>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                :disabled="clearingCaches"
                @click="void onClearCaches()"
              >
                {{ tr("clearCaches") }}
              </button>
            </div>
          </div>
          <div class="stats-grid">
            <div class="stat-cell">
              <span class="stat-k">{{ tr("statsRequests") }}</span>
              <span class="stat-v">{{ sessionStats.totalRequests }}</span>
            </div>
            <div class="stat-cell">
              <span class="stat-k">{{ tr("statsCacheHits") }}</span>
              <span class="stat-v">{{ sessionStats.cacheHits }} ({{ cacheHitRateText }})</span>
            </div>
            <div class="stat-cell">
              <span class="stat-k">{{ tr("statsAccepted") }}</span>
              <span class="stat-v">{{ sessionStats.accepted }}</span>
            </div>
            <div class="stat-cell">
              <span class="stat-k">{{ tr("statsCancelled") }}</span>
              <span class="stat-v">{{ sessionStats.cancelled }}</span>
            </div>
            <div class="stat-cell">
              <span class="stat-k">{{ tr("statsFailed") }}</span>
              <span class="stat-v">{{ sessionStats.failed }}</span>
            </div>
            <div class="stat-cell">
              <span class="stat-k">{{ tr("statsLatency") }}</span>
              <span class="stat-v">
                {{
                  sessionStats.p50LatencyMs != null || sessionStats.p95LatencyMs != null
                    ? `${sessionStats.p50LatencyMs ?? "—"} / ${sessionStats.p95LatencyMs ?? "—"}ms`
                    : "—"
                }}
              </span>
            </div>
            <div class="stat-cell">
              <span class="stat-k">{{ tr("statsDebounce") }}</span>
              <span class="stat-v">
                {{
                  sessionStats.currentDebounceMs != null
                    ? `${sessionStats.currentDebounceMs}ms`
                    : "—"
                }}
              </span>
            </div>
          </div>
        </div>

        <GroupCard :title="tr('sectionLog')" :measure-key="locale">
          <PropertyRow
            :label="tr('logLevel')"
            :help="tr('helpLogLevel')"
            input-id="field-log-level"
          >
            <SelectCombo
              id="field-log-level"
              v-model="logLevel"
              :options="levelOptions"
              :aria-label="tr('logLevel')"
            />
          </PropertyRow>
          <PropertyRow
            :label="tr('logRetention')"
            :help="tr('helpLogRetention')"
            :error="fieldErrors.logRetention"
            input-id="field-log-retention"
          >
            <input
              id="field-log-retention"
              type="number"
              min="50"
              max="10000"
              :value="numDisplay('logRetention', logRetention, 1000)"
              @input="
                onNumInput('logRetention', ($event.target as HTMLInputElement).value, (n) => {
                  logRetention = n;
                })
              "
              @blur="onNumBlur('logRetention')"
            />
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
          <CheckRow v-model="showCostApprox" :label="tr('showCost')" :help="tr('helpShowCost')" />
        </GroupCard>

        <div class="logs-bar">
          <label class="logs-bar-filter" for="field-log-filter">
            {{ tr("logFilter") }}
            <SelectCombo
              id="field-log-filter"
              v-model="logFilter"
              :options="levelOptions"
              :aria-label="tr('logFilter')"
            />
          </label>
          <input
            v-model="logSearch"
            type="text"
            class="logs-search-input"
            :placeholder="tr('logsSearchPlaceholder')"
            :aria-label="tr('logsSearchPlaceholder')"
            spellcheck="false"
          />
          <span class="pill logs-count-pill">
            {{ formatMsg(tr("logsCount"), filteredLogs.length, logs.length) }}
          </span>
          <button
            type="button"
            class="btn btn-ghost"
            :class="{ 'btn-toggle-on': logAutoScroll }"
            :aria-pressed="logAutoScroll"
            @click="onToggleAutoScroll"
          >
            {{ tr("logsAutoScroll") }}
          </button>
          <button type="button" class="btn btn-secondary" @click="clearLogs">
            {{ tr("clearLogs") }}
          </button>
          <button type="button" class="btn btn-ghost" @click="void copyLogs()">
            {{ tr("copyLogs") }}
          </button>
        </div>

        <div ref="logsPaneRef" class="logs-pane" @scroll="onLogsScroll">
          <template v-if="filteredLogs.length > 0">
            <div v-for="(entry, idx) in filteredLogs" :key="idx" class="log-entry">
              <span v-if="entry.time" class="log-time">{{ compactLogTime(entry.time) }}</span>
              <span class="log-level" :class="logLevelClass(entry.level)">
                {{ (entry.level ?? "info").toUpperCase() }}
              </span>
              <span v-if="entry.operation" class="log-chip">{{ entry.operation }}</span>
              <span v-if="entry.method" class="log-method">{{ entry.method }}</span>
              <span v-if="entry.url" class="log-url">{{ entry.url }}</span>
              <span
                v-if="typeof entry.status === 'number'"
                class="log-status"
                :class="statusCodeClass(entry.status)"
              >
                {{ entry.status }}
              </span>
              <span v-if="typeof entry.latencyMs === 'number'" class="log-meta">
                {{ Math.round(entry.latencyMs) }}ms
              </span>
              <span v-if="entry.model" class="log-meta">model={{ entry.model }}</span>
              <span v-if="entry.requestStyle" class="log-meta">{{ entry.requestStyle }}</span>
              <span v-if="entry.trigger" class="log-meta">{{ entry.trigger }}</span>
              <span v-if="entry.cacheHit" class="log-chip ok">cache</span>
              <span v-if="typeof entry.responseChars === 'number'" class="log-meta">
                {{ entry.responseChars }}ch
              </span>
              <span v-if="entry.file" class="log-meta">{{ entry.file }}</span>
              <span v-if="entry.message?.trim()" class="log-msg">{{ entry.message.trim() }}</span>
              <span
                v-if="entry.error?.trim() && entry.error.trim() !== entry.message?.trim()"
                class="log-err"
              >
                {{ entry.error.trim() }}
              </span>
            </div>
          </template>
          <div v-else class="log-empty">{{ tr("emptyLogs") }}</div>
        </div>
      </template>
    </div>

    <div v-if="saveState !== 'idle'" class="save-status" :class="saveState" role="status">
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
      >
        <div class="modal-backdrop" @click="closeImportModal()" />
        <div ref="importModalPanelRef" class="modal-panel" @click.stop>
          <h2 class="modal-title">{{ tr("importTitle") }}</h2>
          <p class="modal-help">{{ tr("importPrompt") }}</p>
          <div v-if="importModalError" class="result err modal-error" role="alert">
            {{ importModalError }}
          </div>
          <textarea
            ref="importTextareaRef"
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

    <!-- Clipboard fallback modal: read-only textarea when host & navigator clipboard fail -->
    <Teleport to="body">
      <div
        v-if="copyModalOpen"
        class="modal-root"
        role="dialog"
        aria-modal="true"
        :aria-label="copyModalTitle"
      >
        <div class="modal-backdrop" @click="closeCopyModal()" />
        <div ref="copyModalPanelRef" class="modal-panel" @click.stop>
          <h2 class="modal-title">{{ copyModalTitle }}</h2>
          <p class="modal-help">{{ tr("copyModalHint") }}</p>
          <textarea
            ref="copyTextareaRef"
            :value="copyModalText"
            class="modal-textarea"
            rows="12"
            readonly
            spellcheck="false"
            @focus="($event.target as HTMLTextAreaElement).select()"
          />
          <div class="modal-actions">
            <button type="button" class="btn btn-primary" @click="closeCopyModal()">
              {{ tr("copyModalClose") }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

export type Profile = {
  id: string;
  name: string;
  provider?: string;
  baseUrl?: string;
  model?: string;
  promptTemplate?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  settingsTimeoutMs?: number;
  stream?: boolean;
  hasApiKey?: boolean;
  fimPath?: string;
  chatPath?: string;
  completionsPath?: string;
  authHeaderTemplate?: string;
  extraHeadersJson?: string;
  extraBodyJson?: string;
  stopSequences?: string;
  overrideContextBudget?: boolean;
  maxPrefixChars?: number;
  maxSuffixChars?: number;
};

/** Settings UI appearance: follow IDE, or force light/dark. */
export type UiTheme = "auto" | "light" | "dark";

/** Normalized IDE host theme value applied to data-theme. */
export type HostTheme =
  | "light"
  | "dark"
  | "high-contrast-light"
  | "high-contrast-dark"
  | "high-contrast";

export type ModelOption = {
  id: string;
  contextLength?: number | null;
};

export type Snapshot = {
  schemaVersion?: number;
  enabled?: boolean;
  autoTrigger?: boolean;
  activeProfileId?: string;
  profiles?: Profile[];
  // Behavior
  enableInComments?: boolean;
  enableInStrings?: boolean;
  firstLineOnlyWhenMidLine?: boolean;
  sendFilePath?: boolean;
  respectGitignore?: boolean;
  /** Newline-separated globs (host State stores as multi-line string). */
  ignoreGlobs?: string;
  /** Comma/newline-separated language IDs. */
  disabledLanguages?: string;
  showStatusBar?: boolean;
  // Performance (global)
  debounceMinMs?: number;
  debounceInitialMs?: number;
  debounceMaxMs?: number;
  maxPrefixChars?: number;
  maxSuffixChars?: number;
  maxInFlight?: number;
  cacheSize?: number;
  lruSize?: number;
  maxFileSizeKb?: number;
  enableRecentFileContext?: boolean;
  recentFileLimit?: number;
  recentFileMaxChars?: number;
  // Logs / privacy
  logLevel?: string;
  logPromptBodies?: boolean;
  logRetention?: number;
  notifyOnFatalError?: boolean;
  showCostApprox?: boolean;
  /** Settings panel theme preference (not IDE editor theme). */
  uiTheme?: UiTheme;
  /**
   * Settings panel UI locale. `auto` follows IDE language; otherwise
   * `en` | `zh` | `ja` | `ko`. Not the IDE UI language.
   */
  uiLocale?: string;
};

export type ProbeResult = {
  status?: "SUCCESS" | "EMPTY" | "FAILED" | string;
  httpStatus?: number | null;
  latencyMs?: number;
  preview?: string;
  error?: string;
  resolvedPath?: string;
  resolvedUrl?: string;
  template?: string;
};

export type LogEntry = {
  time?: string;
  level?: string;
  requestId?: string;
  file?: string;
  trigger?: string;
  cacheHit?: boolean;
  latencyMs?: number | null;
  status?: number | null;
  error?: string;
  operation?: string;
  method?: string;
  url?: string;
  model?: string;
  requestStyle?: string;
  responseChars?: number | null;
  message?: string;
};

export type SessionStats = {
  totalRequests: number;
  cacheHits: number;
  cancelled: number;
  failed: number;
  accepted: number;
  p50LatencyMs?: number | null;
  p95LatencyMs?: number | null;
  currentDebounceMs?: number | null;
  backoffBlocked?: boolean;
  backoffFatal?: boolean;
};

export type ServicePresetId = "ollama" | "deepseek" | "mistral" | "vllm";

export type ServicePreset = {
  id: ServicePresetId;
  baseUrl: string;
  promptTemplate: string;
  fimPath: string;
  chatPath: string;
  completionsPath: string;
};

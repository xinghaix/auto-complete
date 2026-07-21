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
  overrideContextBudget?: boolean;
  maxPrefixChars?: number;
  maxSuffixChars?: number;
};

/** Settings UI appearance: follow IDE, or force light/dark. */
export type UiTheme = "auto" | "light" | "dark";

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
  status?: string;
  httpStatus?: number | null;
  latencyMs?: number;
  preview?: string;
  error?: string;
  resolvedPath?: string;
  template?: string;
};

export type LogEntry = {
  time?: string;
  level?: string;
  message?: string;
  error?: string;
  operation?: string;
  status?: number | null;
  latencyMs?: number | null;
  file?: string;
};

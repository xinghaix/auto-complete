export type Trigger = "AUTO" | "MANUAL";

export type CacheMatchType = "EXACT" | "PARTIAL_TYPING" | "BACKWARD_DELETION";

export type WireFormat = "FIM_FIELDS" | "COMPLETION_PROMPT" | "CHAT_MESSAGES";

export type PromptTemplateId =
  | "AUTO"
  | "CODESTRAL_API"
  | "QWEN"
  | "DEEPSEEK"
  | "STARCODER"
  | "CHAT";

export type ProviderKind = "OPENAI_COMPATIBLE" | "MISTRAL_FIM" | "CUSTOM";

export type RequestStyle = "AUTO" | "FIM" | "CHAT";

export type ErrorKind = "FATAL" | "RETRIABLE" | "TRANSIENT" | "CANCEL";

export type LogLevelName = "debug" | "info" | "warn" | "error";

export type TemplateProbeStatus = "SUCCESS" | "EMPTY" | "FAILED";

export interface ContextHints {
  inComment?: boolean;
  inString?: boolean;
}

export interface CompletionRequest {
  id: string;
  path: string;
  language: string;
  prefix: string;
  suffix: string;
  offset: number;
  trigger: Trigger;
  generation: number;
  fileSizeBytes?: number;
  context?: ContextHints;
  projectKey?: string;
}

export interface Usage {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cost?: number | null;
}

export interface CompletionResponse {
  id: string;
  text: string;
  latencyMs: number;
  cached: boolean;
  model: string;
  usage?: Usage | null;
  generation?: number;
}

export type CompletionOutcome =
  | { kind: "success"; response: CompletionResponse }
  | { kind: "cancelled" }
  | { kind: "skipped" }
  | { kind: "failed"; message: string; status?: number | null; errorKind?: string };

export interface CachedSuggestion {
  scope: string;
  prefix: string;
  suffix: string;
  text: string;
}

export interface CacheHit {
  text: string;
  match: CacheMatchType;
  source: CachedSuggestion;
}

export interface ProviderConfig {
  kind: ProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
  authHeaderTemplate?: string;
  extraHeadersJson?: string;
  fimPath?: string;
  chatPath?: string;
  completionsPath?: string;
  requestStyle?: RequestStyle;
  promptTemplate?: PromptTemplateId;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  settingsTimeoutMs?: number;
  stream?: boolean;
  allowRemote?: boolean;
}

export interface ProviderRequest {
  model: string;
  prefix: string;
  suffix: string;
  maxTokens: number;
  temperature: number;
  stream?: boolean;
  language?: string | null;
  path?: string | null;
}

export interface ProviderResponse {
  text: string;
  usage?: Usage | null;
  rawStatus?: number | null;
}

export interface EngineSettings {
  enabled: boolean;
  autoTrigger: boolean;
  snoozed: boolean;
  model: string;
  disabledLanguages: Set<string> | string[];
  maxFileSizeKb: number;
  respectGitignore: boolean;
  ignoreGlobs: string[];
  validationErrors: string[];
  firstLineOnlyWhenMidLine: boolean;
  enableInComments: boolean;
  enableInStrings: boolean;
  debounceMinMs: number;
  debounceInitialMs: number;
  debounceMaxMs: number;
  maxPrefixChars: number;
  maxSuffixChars: number;
  maxTokens: number;
  temperature: number;
  stream: boolean;
  sendFilePath: boolean;
  enableRecentFileContext: boolean;
  recentFileLimit: number;
  recentFileMaxChars: number;
  cacheSize: number;
  lruSize: number;
  maxInFlight: number;
  logRetention: number;
  logLevel: string;
  logPromptBodies: boolean;
  notifyOnFatalError: boolean;
  showCostApprox: boolean;
  providerConfig: ProviderConfig;
}

export const TIMEOUT = {
  DEFAULT_MS: 3_000,
  DEFAULT_SETTINGS_MS: 15_000,
  MIN_MS: 500,
  MAX_MS: 30_000,
  MIN_SETTINGS_MS: 1_000,
  MAX_SETTINGS_MS: 120_000,
} as const;

export function defaultEngineSettings(overrides: Partial<EngineSettings> = {}): EngineSettings {
  return {
    enabled: true,
    autoTrigger: true,
    snoozed: false,
    model: "test-model",
    disabledLanguages: new Set(),
    maxFileSizeKb: 512,
    respectGitignore: true,
    ignoreGlobs: [
      "**/.git/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/target/**",
      "**/.idea/**",
      "**/.gradle/**",
      "**/vendor/**",
    ],
    validationErrors: [],
    firstLineOnlyWhenMidLine: true,
    enableInComments: true,
    enableInStrings: true,
    debounceMinMs: 150,
    debounceInitialMs: 300,
    debounceMaxMs: 1000,
    maxPrefixChars: 8000,
    maxSuffixChars: 2000,
    maxTokens: 128,
    temperature: 0,
    stream: false,
    sendFilePath: true,
    enableRecentFileContext: false,
    recentFileLimit: 3,
    recentFileMaxChars: 1200,
    cacheSize: 20,
    lruSize: 64,
    maxInFlight: 1,
    logRetention: 1000,
    logLevel: "info",
    logPromptBodies: false,
    notifyOnFatalError: true,
    showCostApprox: false,
    providerConfig: {
      kind: "OPENAI_COMPATIBLE",
      baseUrl: "http://127.0.0.1:9/v1",
      apiKey: "",
      model: "test-model",
      requestStyle: "CHAT",
      timeoutMs: 1000,
    },
    ...overrides,
  };
}

export function isEnabledNow(s: EngineSettings): boolean {
  return s.enabled && !s.snoozed;
}

/** Message catalog for settings-ui. Keys are English identifiers. */

export type MessageKey =
  | "title"
  | "tabSettings"
  | "tabConfig"
  | "tabBehavior"
  | "tabPerformance"
  | "tabLogs"
  | "profiles"
  | "newProfile"
  | "deleteProfile"
  | "renameProfile"
  | "baseUrl"
  | "model"
  | "promptTemplate"
  | "apiKey"
  | "keyConfigured"
  | "keyMissing"
  | "maxTokens"
  | "timeoutMs"
  | "settingsTimeoutMs"
  | "temperature"
  | "stream"
  | "apply"
  | "testConnection"
  | "fetchModels"
  | "fetchingModels"
  | "modelsLoaded"
  | "modelsEmpty"
  | "modelsFailed"
  | "helpModel"
  | "clearKey"
  | "tryTemplate"
  | "tryAllTemplates"
  | "clearLogs"
  | "copyLogs"
  | "export"
  | "import"
  | "secretHint"
  | "applied"
  | "testing"
  | "loadFailed"
  | "enabled"
  | "autoTrigger"
  | "advanced"
  | "authHeader"
  | "fimPath"
  | "chatPath"
  | "completionsPath"
  | "extraHeaders"
  | "overrideBudget"
  | "maxPrefix"
  | "maxSuffix"
  | "enableInComments"
  | "enableInStrings"
  | "firstLineOnly"
  | "sendFilePath"
  | "showStatusBar"
  | "respectGitignore"
  | "ignoreGlobs"
  | "disabledLanguages"
  | "debounceInitial"
  | "debounceMin"
  | "debounceMax"
  | "cacheSize"
  | "lruSize"
  | "maxInFlight"
  | "maxFileSize"
  | "enableRecent"
  | "recentLimit"
  | "recentMaxChars"
  | "logLevel"
  | "logFilter"
  | "logRetention"
  | "logPromptBodies"
  | "notifyFatal"
  | "showCost"
  | "confirmDelete"
  | "noProfiles"
  | "platform"
  | "probeResults"
  | "importOk"
  | "exportOk"
  | "jcefFallback"
  | "importPrompt"
  | "importTitle"
  | "importPlaceholder"
  | "importConfirm"
  | "importEmpty"
  | "language"
  | "theme"
  | "themeAuto"
  | "themeLight"
  | "themeDark"
  | "helpTheme"
  | "helpLanguage"
  | "helpImportExport"
  | "helpOverrideBudget"
  | "templateAuto"
  | "templateCodestral"
  | "templateQwen"
  | "templateDeepseek"
  | "templateStarcoder"
  | "templateChat"
  | "failed"
  | "exportFailed"
  | "importFailed"
  | "emptyLogs"
  | "hostJetbrains"
  | "hostVscode"
  | "hostMock"
  | "languageAuto"
  | "sectionProvider"
  | "sectionBehavior"
  | "sectionAdvanced"
  | "sectionAppearance"
  | "sectionDebounce"
  | "sectionContext"
  | "sectionEngine"
  | "sectionRecent"
  | "sectionLog"
  | "sectionIgnore"
  | "helpProfile"
  | "helpBaseUrl"
  | "helpApiKey"
  | "helpTemplate"
  | "helpTimeout"
  | "helpStream"
  | "helpBehavior"
  | "helpDebounce"
  | "helpContextBudget"
  | "helpIgnoreGlobs"
  | "helpDisabledLanguages"
  | "helpLogRetention"
  | "helpLogPromptBodies"
  | "logsHint"
  | "moreActions"
  | "tabGeneral"
  | "sectionGeneral"
  | "confirmDeleteInline"
  | "confirmDeleteYes"
  | "confirmDeleteCancel"
  | "saving"
  | "saved"
  | "saveError"
  | "helpMaxTokens"
  | "helpSettingsTimeout"
  | "helpTemperature"
  | "helpAuthHeader"
  | "helpFimPath"
  | "helpChatPath"
  | "helpCompletionsPath"
  | "helpExtraHeaders"
  | "helpEnabled"
  | "helpAutoTrigger"
  | "manualTriggerShortcut"
  | "helpManualTriggerShortcut"
  | "openKeymap"
  | "openKeymapFailed"
  | "helpInComments"
  | "helpInStrings"
  | "helpFirstLineOnly"
  | "helpSendFilePath"
  | "helpShowStatusBar"
  | "helpRespectGitignore"
  | "helpDebounceInitial"
  | "helpDebounceMin"
  | "helpDebounceMax"
  | "helpCacheSize"
  | "helpLruSize"
  | "helpMaxInFlight"
  | "helpMaxFileSize"
  | "helpEnableRecent"
  | "helpRecentLimit"
  | "helpRecentMaxChars"
  | "helpLogLevel"
  | "helpNotifyFatal"
  | "helpShowCost"
  | "helpMaxPrefix"
  | "helpMaxSuffix"
  | "sectionAbout"
  | "aboutBlurb"
  | "aboutLicense"
  | "aboutOpenGithub"
  | "aboutOpenIssues"
  | "aboutVersion"
  | "aboutOpenFailed";

export type Messages = Record<MessageKey, string>;

export const en: Messages = {
  title: "Auto Complete",
  tabSettings: "Settings",
  tabConfig: "Configuration",
  tabBehavior: "Completion behavior",
  tabPerformance: "Performance",
  tabLogs: "Logs",
  profiles: "Saved configuration",
  newProfile: "New",
  deleteProfile: "Delete",
  renameProfile: "Rename",
  baseUrl: "Base URL",
  model: "Model",
  promptTemplate: "Prompt template",
  apiKey: "API Key",
  keyConfigured: "(configured)",
  keyMissing: "(not set)",
  maxTokens: "Max tokens",
  timeoutMs: "Completion timeout (ms)",
  settingsTimeoutMs: "Probe timeout (ms)",
  temperature: "Temperature",
  stream: "Stream (experimental)",
  apply: "Apply",
  testConnection: "Test connection",
  fetchModels: "Fetch models",
  fetchingModels: "Fetching…",
  modelsLoaded: "Loaded {0} models",
  modelsEmpty: "No models returned; you can still type a model id.",
  modelsFailed: "Failed to load models: {0}",
  helpModel: "Model id as your server expects it. Type freely, or Fetch models and pick from the list. Required when a profile exists.",
  clearKey: "Clear key",
  tryTemplate: "Test template",
  tryAllTemplates: "Try all templates",
  clearLogs: "Clear",
  copyLogs: "Copy",
  export: "Export",
  import: "Import",
  secretHint: "Keys stay in the IDE secure store. Snapshots, exports, and logs never include API key plaintext.",
  applied: "Applied",
  testing: "Testing…",
  loadFailed: "Failed to load settings",
  enabled: "Enabled",
  autoTrigger: "Auto trigger",
  advanced: "Advanced",
  authHeader: "Auth header template",
  fimPath: "FIM path override",
  chatPath: "Chat path",
  completionsPath: "Completions path",
  extraHeaders: "Extra headers JSON (plaintext; not exported)",
  overrideBudget: "Override context budget",
  maxPrefix: "Max prefix chars",
  maxSuffix: "Max suffix chars",
  enableInComments: "Complete in comments",
  enableInStrings: "Complete in strings",
  firstLineOnly: "First line only when mid-line",
  sendFilePath: "Send file path in prompt",
  showStatusBar: "Show status bar",
  respectGitignore: "Respect .gitignore",
  ignoreGlobs: "Ignore globs",
  disabledLanguages: "Disabled languages",
  debounceInitial: "Initial debounce (ms)",
  debounceMin: "Min debounce (ms)",
  debounceMax: "Max debounce (ms)",
  cacheSize: "Suggestion cache size",
  lruSize: "Prompt LRU size",
  maxInFlight: "Max concurrent requests",
  maxFileSize: "Max file size (KB)",
  enableRecent: "Include recent open files",
  recentLimit: "Recent file count",
  recentMaxChars: "Chars per recent file",
  logLevel: "Log level",
  logFilter: "Min level",
  logRetention: "Log buffer size",
  logPromptBodies: "Log full prompts (sensitive)",
  notifyFatal: "Notify on fatal auth errors",
  showCost: "Show token usage in logs",
  confirmDelete: "Delete this saved configuration?",
  noProfiles: "(none)",
  platform: "Host",
  probeResults: "Probe results",
  importOk: "Imported",
  exportOk: "Exported to clipboard",
  jcefFallback: "Web panel unavailable; use IDE Settings → Tools → Auto Complete.",
  importPrompt: "Paste settings JSON exported from this plugin. API keys are never included.",
  importTitle: "Import settings",
  importPlaceholder: '{ "schemaVersion": 1, "profiles": [ … ] }',
  importConfirm: "Import",
  importEmpty: "Paste a non-empty settings JSON first.",
  language: "Language",
  theme: "Theme",
  themeAuto: "Auto (follow IDE)",
  themeLight: "Light",
  themeDark: "Dark",
  helpTheme: "Appearance of this settings panel only — does not change the IDE theme. Auto follows the IDE color scheme.",
  helpLanguage: "Language of this settings panel only — does not change the IDE UI language. Auto follows the IDE display language. Saved with settings.",
  helpImportExport: "Export copies settings JSON without API keys. Import applies JSON from the clipboard paste; re-enter keys after import.",
  helpOverrideBudget: "Use this profile’s own prefix/suffix limits instead of the Performance tab. Edit the fields below only when this is on.",
  templateAuto: "Auto",
  templateCodestral: "(fim) OpenAI FIM",
  templateQwen: "(fim) Qwen",
  templateDeepseek: "(fim) DeepSeek",
  templateStarcoder: "(fim) StarCoder",
  templateChat: "(chat) Pseudo-FIM",
  failed: "failed",
  exportFailed: "Export failed",
  importFailed: "Import failed",
  emptyLogs: "—",
  hostJetbrains: "JetBrains",
  hostVscode: "VS Code",
  hostMock: "Browser (mock)",
  languageAuto: "Auto (follow IDE)",
  sectionProvider: "Provider connection",
  sectionBehavior: "Completion behavior",
  sectionAdvanced: "Advanced (timeouts, paths, context)",
  sectionAppearance: "Appearance",
  sectionDebounce: "Debounce",
  sectionContext: "Context budget",
  sectionEngine: "Engine",
  sectionRecent: "Recent files",
  sectionLog: "Logging",
  sectionIgnore: "Path ignore",
  helpProfile: "Rename the active profile in the box (Enter or blur to save). Open the arrow to switch. New creates a blank connection; you may delete all profiles.",
  helpBaseUrl: "OpenAI-compatible API root, including version path when required. Example: http://127.0.0.1:11434/v1. Required before completions run.",
  helpApiKey: "Optional for some local servers. Stored only in the IDE secret store — never in export, snapshot, or logs.",
  helpTemplate: "How the request body is built. Auto infers from the model name; use Test template if suggestions are empty.",
  helpTimeout: "Hard timeout for ghost-text completions (ms). Range 500–30000. Prefer 2000–5000 so the UI stays responsive.",
  helpStream: "Experimental SSE first-token streaming. Leave off unless you know the endpoint handles stream=true correctly.",
  helpBehavior: "Master controls for when completions may run.",
  helpDebounce: "Adaptive delay after typing before a request. The engine moves between min and max from observed latency.",
  helpContextBudget: "How much code before/after the cursor may be sent. Larger values add context but raise tokens and latency. A profile can override these under Advanced.",
  helpIgnoreGlobs: "One path glob per line (e.g. **/node_modules/**). Combined with .gitignore when that option is on.",
  helpDisabledLanguages: "Comma-separated language IDs (e.g. markdown, json), not display names. Matching files skip completion.",
  helpLogRetention: "In-memory log ring size (events). Oldest entries drop when full. Range 50–10000. Default 1000.",
  helpLogPromptBodies: "Sensitive: writes truncated prompt text into the log buffer. Keep off unless debugging a provider.",
  logsHint: "Same buffer as the engine (connection tests, completions). Batch-refreshed from the host.",
  moreActions: "Import / export",
  tabGeneral: "General",
  sectionGeneral: "General",
  confirmDeleteInline: "Delete this configuration?",
  confirmDeleteYes: "Delete",
  confirmDeleteCancel: "Cancel",
  saving: "Saving…",
  saved: "Saved",
  saveError: "Save failed",
  helpMaxTokens: "Max tokens generated per completion. Typical 64–256. Higher values allow longer suggestions but cost more time and tokens.",
  helpSettingsTimeout: "Timeout (ms) for Fetch models, connection test, and template probes. Range 1000–120000. Default 15000 — longer than completion timeout is normal.",
  helpTemperature: "Sampling temperature (0–2). Prefer 0 for stable, repeatable code completion.",
  helpAuthHeader: "HTTP auth header template. Use ${apiKey} as the secret placeholder. If the key is empty, the header is omitted. Example: Authorization: Bearer ${apiKey}",
  helpFimPath: "Optional FIM path relative to Base URL. Leave empty to use the template default (often /fim/completions).",
  helpChatPath: "Chat completions path relative to Base URL. Default /chat/completions for OpenAI-compatible servers.",
  helpCompletionsPath: "Optional /completions path for token-style FIM (Qwen, DeepSeek, StarCoder). Leave empty for the template default.",
  helpExtraHeaders: "Extra request headers as a JSON object, e.g. {\"X-Custom\":\"value\"}. Must parse as a plain object, not an array.",
  helpEnabled: "Master switch. When off, automatic and manual completions are disabled until turned on again.",
  helpAutoTrigger: "Request while typing. Manual trigger (IDE shortcut / command) still works when this is off.",
  manualTriggerShortcut: "Manual trigger shortcut",
  helpManualTriggerShortcut:
    "Managed by the IDE Keymap (not this panel). Default: Ctrl/Cmd+Shift+Space. Use the button to open host shortcuts for Trigger.",
  openKeymap: "Configure in Keymap…",
  openKeymapFailed:
    "Could not open IDE shortcuts. JetBrains: Settings → Keymap; VS Code: Keyboard Shortcuts. Search for Auto Complete Trigger.",
  helpInComments: "Allow completions when the cursor is inside a comment. Detection is a fast heuristic, not a full parser.",
  helpInStrings: "Allow completions when the cursor is inside a string literal. Detection is a fast heuristic, not a full parser.",
  helpFirstLineOnly: "If the cursor is mid-line and the model returns multiple lines, show only the first line to reduce editor clutter.",
  helpSendFilePath: "Include the current file path in the prompt. Helps path-aware suggestions; turn off for stricter privacy.",
  helpShowStatusBar: "Show the Auto Complete entry in the IDE status bar (on/off and model). Applies immediately.",
  helpRespectGitignore: "Skip files matching the project/workspace root .gitignore. Works together with Ignore globs below.",
  helpDebounceInitial: "Starting wait after typing before a request (ms). Suggested ~300. The engine then adapts between min and max.",
  helpDebounceMin: "Lower bound for adaptive debounce (ms). Suggested 100–150. Too low can flood a slow endpoint.",
  helpDebounceMax: "Upper bound for adaptive debounce (ms). Suggested 800–1000. Higher values calm request storms on slow servers.",
  helpCacheSize: "Recent suggestions kept per file for instant reuse. Suggested 10–40. Does not change what is sent to the model.",
  helpLruSize: "Prompt-keyed LRU size. Speeds up identical contexts. Suggested 32–128.",
  helpMaxInFlight: "Global concurrent completion requests. Keep 1 so new typing cancels cleanly; raise only if your endpoint handles parallel load well.",
  helpMaxFileSize: "Skip completion when the open file is larger than this (KB). Protects huge generated files. Default 512.",
  helpEnableRecent: "Attach short snippets from other open editors. Sends more code to your endpoint — leave off unless you accept that trade-off.",
  helpRecentLimit: "How many other open files may contribute snippets when recent-file context is enabled.",
  helpRecentMaxChars: "Max characters taken from each recent-file snippet. Lower reduces prompt size.",
  helpLogLevel: "Minimum severity written to the log buffer and host log. Use debug only while diagnosing issues.",
  helpNotifyFatal: "Show an IDE notification on fatal auth/config errors (e.g. HTTP 401/403). Failures are still logged either way.",
  helpShowCost: "Append provider token usage to success log lines when the server returns usage. Not a price estimate; many local servers omit usage.",
  helpMaxPrefix: "Max characters before the cursor that may be sent. More context can improve quality but increases tokens and latency.",
  helpMaxSuffix: "Max characters after the cursor that may be sent (fill-in-the-middle). Usually smaller than the prefix budget.",
  sectionAbout: "About",
  aboutBlurb:
    "Open-source, bring-your-own-endpoint AI inline completion for JetBrains and VS Code. Issues, docs, and releases live on GitHub.",
  aboutLicense: "License: Apache-2.0",
  aboutOpenGithub: "Open GitHub repository",
  aboutOpenIssues: "Report an issue",
  aboutVersion: "Version",
  aboutOpenFailed: "Could not open the link. Copy the URL from the help text and open it in a browser.",
};

export const zh: Messages = {
  title: "Auto Complete",
  tabSettings: "设置",
  tabConfig: "配置",
  tabBehavior: "补全行为",
  tabPerformance: "性能",
  tabLogs: "日志",
  profiles: "已保存配置",
  newProfile: "新建",
  deleteProfile: "删除",
  renameProfile: "改名",
  baseUrl: "服务地址",
  model: "模型",
  promptTemplate: "提示模板",
  apiKey: "API 密钥",
  keyConfigured: "（已配置）",
  keyMissing: "（未设置）",
  maxTokens: "最大 tokens",
  timeoutMs: "补全超时（ms）",
  settingsTimeoutMs: "探测超时（ms）",
  temperature: "温度",
  stream: "流式（实验）",
  apply: "应用",
  testConnection: "测试连接",
  fetchModels: "拉取模型",
  fetchingModels: "拉取中…",
  modelsLoaded: "已加载 {0} 个模型",
  modelsEmpty: "未返回模型，仍可手动输入模型 ID。",
  modelsFailed: "拉取模型失败：{0}",
  helpModel: "与服务端一致的模型 ID。可手输，或「拉取模型」后从列表选择。存在配置时必填。",
  clearKey: "清除密钥",
  tryTemplate: "测试模板",
  tryAllTemplates: "尝试全部模板",
  clearLogs: "清空",
  copyLogs: "复制",
  export: "导出",
  import: "导入",
  secretHint: "密钥只在 IDE 安全存储中；快照、导出与日志从不包含 API 密钥明文。",
  applied: "已应用",
  testing: "测试中…",
  loadFailed: "加载设置失败",
  enabled: "启用",
  autoTrigger: "自动触发",
  advanced: "高级",
  authHeader: "鉴权头模板",
  fimPath: "FIM 路径覆盖",
  chatPath: "Chat 路径",
  completionsPath: "Completions 路径",
  extraHeaders: "额外 Headers JSON（明文；不导出）",
  overrideBudget: "覆盖上下文预算",
  maxPrefix: "前缀最大字符",
  maxSuffix: "后缀最大字符",
  enableInComments: "注释中补全",
  enableInStrings: "字符串中补全",
  firstLineOnly: "行中仅显示首行建议",
  sendFilePath: "发送文件路径",
  showStatusBar: "显示状态栏",
  respectGitignore: "遵循 .gitignore",
  ignoreGlobs: "忽略规则",
  disabledLanguages: "禁用语言",
  debounceInitial: "起始防抖（ms）",
  debounceMin: "最短防抖（ms）",
  debounceMax: "最长防抖（ms）",
  cacheSize: "补全缓存",
  lruSize: "提示缓存",
  maxInFlight: "最大并发请求",
  maxFileSize: "文件大小上限（KB）",
  enableRecent: "附带最近打开的文件",
  recentLimit: "最近文件数",
  recentMaxChars: "单文件字符上限",
  logLevel: "日志级别",
  logFilter: "最低级别",
  logRetention: "日志缓冲条数",
  logPromptBodies: "记录完整提示词（敏感）",
  notifyFatal: "严重鉴权错误时通知",
  showCost: "日志中显示 token 用量",
  confirmDelete: "删除此已保存配置？",
  noProfiles: "（无）",
  platform: "宿主",
  probeResults: "探测结果",
  importOk: "已导入",
  exportOk: "已复制到剪贴板",
  jcefFallback: "Web 面板不可用；请使用 IDE 设置 → 工具 → AI 自动补全。",
  importPrompt: "粘贴从此插件导出的设置 JSON。不会包含 API 密钥。",
  importTitle: "导入设置",
  importPlaceholder: '{ "schemaVersion": 1, "profiles": [ … ] }',
  importConfirm: "导入",
  importEmpty: "请先粘贴非空的设置 JSON。",
  language: "语言",
  theme: "主题",
  themeAuto: "自动（跟随 IDE）",
  themeLight: "白色",
  themeDark: "暗黑",
  helpTheme: "仅影响本设置面板外观，不改 IDE 主题。自动时跟随 IDE 明暗色。",
  helpLanguage: "仅影响本设置面板语言，不改 IDE 界面语言。自动时跟随 IDE 显示语言；选择会保存。",
  helpImportExport: "导出复制不含 API 密钥的设置 JSON。导入粘贴 JSON 并应用；导入后需重新填写密钥。",
  helpOverrideBudget: "使用本配置自己的前缀/后缀上限，而不是「性能」页的全局值。仅在勾选后编辑下方字段。",
  templateAuto: "自动",
  templateCodestral: "(fim) OpenAI FIM",
  templateQwen: "(fim) Qwen",
  templateDeepseek: "(fim) DeepSeek",
  templateStarcoder: "(fim) StarCoder",
  templateChat: "(chat) 伪 FIM",
  failed: "失败",
  exportFailed: "导出失败",
  importFailed: "导入失败",
  emptyLogs: "—",
  hostJetbrains: "JetBrains",
  hostVscode: "VS Code",
  hostMock: "浏览器（模拟）",
  languageAuto: "自动（跟随 IDE）",
  sectionProvider: "服务连接",
  sectionBehavior: "补全行为",
  sectionAdvanced: "高级（超时、路径、上下文）",
  sectionAppearance: "外观",
  sectionDebounce: "防抖",
  sectionContext: "上下文窗口",
  sectionEngine: "引擎",
  sectionRecent: "最近文件",
  sectionLog: "日志",
  sectionIgnore: "路径忽略",
  helpProfile: "在输入框中改名（回车或失焦保存）；箭头切换其它配置。「新建」为空连接，可删除全部配置。",
  helpBaseUrl: "OpenAI 兼容 API 根地址（含需要的版本路径）。例：http://127.0.0.1:11434/v1。补全前必须填写。",
  helpApiKey: "部分本地服务可不填。仅保存在 IDE 密钥库，不会出现在导出、快照或日志中。",
  helpTemplate: "决定请求体如何组装。自动会按模型名推断；若建议为空，可用「测试模板」排查。",
  helpTimeout: "幽灵文本补全硬超时（毫秒），范围 500–30000。建议 2000–5000，以保持跟手。",
  helpStream: "实验性 SSE 首 token 流式。除非确认端点正确支持 stream=true，否则保持关闭。",
  helpBehavior: "控制何时允许补全。",
  helpDebounce: "输入后等待再请求的自适应延迟。引擎会根据延迟在最短与最长之间调节。",
  helpContextBudget: "光标前后可发送的代码量。更大更吃上下文，也更耗 token 与延迟。高级中可按配置覆盖。",
  helpIgnoreGlobs: "每行一条路径 glob（如 **/node_modules/**）。开启「遵循 .gitignore」时与其合并生效。",
  helpDisabledLanguages: "逗号分隔的语言 ID（如 markdown, json），不是界面显示名。匹配的文件不请求补全。",
  helpLogRetention: "内存日志环形缓冲条数。满则丢弃最旧。范围 50–10000，默认 1000。",
  helpLogPromptBodies: "高敏：将截断后的 prompt 写入日志缓冲。仅在排查服务端问题时打开。",
  logsHint: "与引擎共用缓冲区（测连接、补全等），由宿主批量推送。",
  moreActions: "导入 / 导出",
  tabGeneral: "基础设置",
  sectionGeneral: "通用",
  confirmDeleteInline: "确认删除此配置？",
  confirmDeleteYes: "确认删除",
  confirmDeleteCancel: "取消",
  saving: "保存中…",
  saved: "已保存",
  saveError: "保存失败",
  helpMaxTokens: "单次补全最多生成的 token。常见 64–256。更大可生成更长建议，但更慢、更耗量。",
  helpSettingsTimeout: "拉取模型、测连接、模板探测的超时（毫秒）。范围 1000–120000，默认 15000。通常长于补全超时。",
  helpTemperature: "采样温度 0–2。代码补全建议保持 0，结果更稳定可复现。",
  helpAuthHeader: "鉴权头模板，用 ${apiKey} 表示密钥。密钥为空时不发送该头。例：Authorization: Bearer ${apiKey}",
  helpFimPath: "相对 Base URL 的 FIM 路径覆盖。留空使用模板默认（常见 /fim/completions）。",
  helpChatPath: "Chat 补全路径（相对 Base URL）。OpenAI 兼容服务默认 /chat/completions。",
  helpCompletionsPath: "Token 式 FIM（Qwen / DeepSeek / StarCoder）的 /completions 路径。留空用模板默认。",
  helpExtraHeaders: "额外 HTTP 头，JSON 对象，如 {\"X-Custom\":\"value\"}。必须是对象，不能是数组。",
  helpEnabled: "总开关。关闭后自动与手动补全均不请求，直到重新开启。",
  helpAutoTrigger: "输入时自动请求。关闭后仍可通过 IDE 快捷键/命令手动触发。",
  manualTriggerShortcut: "手动触发快捷键",
  helpManualTriggerShortcut:
    "由 IDE 键盘映射管理（不在本面板改绑定）。默认 Ctrl/Cmd+Shift+Space。点按钮打开宿主快捷键设置并定位到触发动作。",
  openKeymap: "在键盘映射中配置…",
  openKeymapFailed:
    "无法打开 IDE 快捷键设置。请手动打开：JetBrains「设置 → 键盘映射」，或 VS Code「键盘快捷方式」，搜索 Auto Complete Trigger。",
  helpInComments: "光标在注释内时是否补全。检测为轻量启发式，非完整语法解析。",
  helpInStrings: "光标在字符串字面量内时是否补全。检测为轻量启发式，非完整语法解析。",
  helpFirstLineOnly: "光标在行中且模型返回多行时，只显示首行，减少编辑器干扰。",
  helpSendFilePath: "把当前文件路径写入 prompt，便于路径相关建议；更严隐私时可关闭。",
  helpShowStatusBar: "在 IDE 状态栏显示 Auto Complete 入口（开关与模型）。立即生效。",
  helpRespectGitignore: "跳过项目/工作区根目录 .gitignore 匹配的路径，并与下方忽略规则合并。",
  helpDebounceInitial: "输入后首次等待再请求的毫秒数。建议约 300。之后在最短/最长之间自适应。",
  helpDebounceMin: "自适应防抖下限（ms）。建议 100–150。过低可能压垮慢端点。",
  helpDebounceMax: "自适应防抖上限（ms）。建议 800–1000。较慢服务可适当调高以减少请求风暴。",
  helpCacheSize: "每个文件缓存的近期建议条数，便于瞬时复用。建议 10–40。不改变发往模型的内容。",
  helpLruSize: "按 prompt 键的 LRU 容量。相同上下文可加速。建议 32–128。",
  helpMaxInFlight: "全局同时进行的补全请求数。建议保持 1，便于取消与替换；仅在端点擅长并行时提高。",
  helpMaxFileSize: "打开文件超过该大小（KB）则跳过补全。用于避开巨大生成文件。默认 512。",
  helpEnableRecent: "附带其它已打开编辑器的短片段。会向端点发送更多代码——除非可接受，否则保持关闭。",
  helpRecentLimit: "启用最近文件上下文时，最多纳入多少个其它已打开文件。",
  helpRecentMaxChars: "每个最近文件片段最多截取的字符数。调小可降低 prompt 体积。",
  helpLogLevel: "写入日志缓冲与宿主日志的最低级别。排查问题时再开 debug。",
  helpNotifyFatal: "遇到严重鉴权/配置错误（如 HTTP 401/403）时弹出 IDE 通知。无论是否通知都会写日志。",
  helpShowCost: "当服务端返回 usage 时，在成功日志中附加 token 用量。不是费用估算；许多本地服务不返回 usage。",
  helpMaxPrefix: "光标前最多可发送的字符数。更大上下文可能更准，但更耗 token 与延迟。",
  helpMaxSuffix: "光标后最多可发送的字符数（中间填充）。通常小于前缀预算。",
  sectionAbout: "关于",
  aboutBlurb:
    "开源、自带端点的 AI 行内补全，支持 JetBrains 与 VS Code。问题反馈、文档与发布均在 GitHub。",
  aboutLicense: "许可证：Apache-2.0",
  aboutOpenGithub: "打开 GitHub 仓库",
  aboutOpenIssues: "反馈问题",
  aboutVersion: "版本",
  aboutOpenFailed: "无法打开链接。请从下方地址复制到浏览器打开。",
};

export const ja: Messages = {
  title: "Auto Complete",
  tabSettings: "設定",
  tabConfig: "構成",
  tabBehavior: "補完の動作",
  tabPerformance: "パフォーマンス",
  tabLogs: "ログ",
  profiles: "保存済み設定",
  newProfile: "新規",
  deleteProfile: "削除",
  renameProfile: "名前変更",
  baseUrl: "ベース URL",
  model: "モデル",
  promptTemplate: "プロンプトテンプレート",
  apiKey: "API キー",
  keyConfigured: "（設定済み）",
  keyMissing: "（未設定）",
  maxTokens: "最大トークン",
  timeoutMs: "補完タイムアウト（ms）",
  settingsTimeoutMs: "プローブタイムアウト（ms）",
  temperature: "温度",
  stream: "ストリーム（試験的）",
  apply: "適用",
  testConnection: "接続テスト",
  fetchModels: "モデル取得",
  fetchingModels: "取得中…",
  modelsLoaded: "{0} 件のモデルを読み込みました",
  modelsEmpty: "モデルが返りませんでした。手動で ID を入力できます。",
  modelsFailed: "モデルの取得に失敗しました: {0}",
  helpModel: "サーバーが期待するモデル ID。手入力、または取得一覧から選択。プロファイルがある場合は必須。",
  clearKey: "キーをクリア",
  tryTemplate: "テンプレートをテスト",
  tryAllTemplates: "すべてのテンプレートを試す",
  clearLogs: "クリア",
  copyLogs: "コピー",
  export: "エクスポート",
  import: "インポート",
  secretHint: "キーは IDE の安全な保存領域のみ。スナップショット・エクスポート・ログに平文は含みません。",
  applied: "適用しました",
  testing: "テスト中…",
  loadFailed: "設定の読み込みに失敗しました",
  enabled: "有効",
  autoTrigger: "自動トリガー",
  advanced: "詳細",
  authHeader: "認証ヘッダーテンプレート",
  fimPath: "FIM パス上書き",
  chatPath: "Chat パス",
  completionsPath: "Completions パス",
  extraHeaders: "追加ヘッダー JSON（平文・エクスポート対象外）",
  overrideBudget: "コンテキスト予算を上書き",
  maxPrefix: "プレフィックス最大文字数",
  maxSuffix: "サフィックス最大文字数",
  enableInComments: "コメント内で補完",
  enableInStrings: "文字列内で補完",
  firstLineOnly: "行中は先頭行のみ表示",
  sendFilePath: "ファイルパスを送信",
  showStatusBar: "ステータスバーを表示",
  respectGitignore: ".gitignore を尊重",
  ignoreGlobs: "無視パターン",
  disabledLanguages: "無効な言語",
  debounceInitial: "初期デバウンス（ms）",
  debounceMin: "最短デバウンス（ms）",
  debounceMax: "最長デバウンス（ms）",
  cacheSize: "補完キャッシュ",
  lruSize: "プロンプト LRU",
  maxInFlight: "最大同時リクエスト",
  maxFileSize: "ファイルサイズ上限（KB）",
  enableRecent: "最近開いたファイルを含める",
  recentLimit: "最近ファイル数",
  recentMaxChars: "ファイルあたり文字数",
  logLevel: "ログレベル",
  logFilter: "最小レベル",
  logRetention: "ログバッファ件数",
  logPromptBodies: "プロンプト全文を記録（機密）",
  notifyFatal: "致命的な認証エラーを通知",
  showCost: "ログにトークン使用量を表示",
  confirmDelete: "この保存済み設定を削除しますか？",
  noProfiles: "（なし）",
  platform: "ホスト",
  probeResults: "プローブ結果",
  importOk: "インポートしました",
  exportOk: "クリップボードにコピーしました",
  jcefFallback:
    "Web パネルを利用できません。IDE 設定 → ツール → Auto Complete を使用してください。",
  importPrompt: "このプラグインからエクスポートした設定 JSON を貼り付け。API キーは含まれません。",
  importTitle: "設定をインポート",
  importPlaceholder: '{ "schemaVersion": 1, "profiles": [ … ] }',
  importConfirm: "インポート",
  importEmpty: "空でない設定 JSON を貼り付けてください。",
  language: "言語",
  theme: "テーマ",
  themeAuto: "自動（IDE に合わせる）",
  themeLight: "ライト",
  themeDark: "ダーク",
  helpTheme: "この設定パネルの外観のみ。IDE テーマは変わりません。自動は IDE 配色に従います。",
  helpLanguage: "この設定パネルの言語のみ。IDE UI 言語は変わりません。自動は IDE 表示言語。選択は保存されます。",
  helpImportExport: "エクスポートは API キーなし JSON をコピー。インポート後はキーの再入力が必要です。",
  helpOverrideBudget: "パフォーマンスタブではなく、このプロファイル固有の前後文字上限を使います。オンのときだけ下の欄を編集。",
  templateAuto: "自動",
  templateCodestral: "(fim) OpenAI FIM",
  templateQwen: "(fim) Qwen",
  templateDeepseek: "(fim) DeepSeek",
  templateStarcoder: "(fim) StarCoder",
  templateChat: "(chat) 疑似 FIM",
  failed: "失敗",
  exportFailed: "エクスポートに失敗しました",
  importFailed: "インポートに失敗しました",
  emptyLogs: "—",
  hostJetbrains: "JetBrains",
  hostVscode: "VS Code",
  hostMock: "ブラウザ（モック）",
  languageAuto: "自動（IDE に合わせる）",
  sectionProvider: "プロバイダー接続",
  sectionBehavior: "補完の動作",
  sectionAdvanced: "詳細（タイムアウト・パス・文脈）",
  sectionAppearance: "外観",
  sectionDebounce: "デバウンス",
  sectionContext: "コンテキスト予算",
  sectionEngine: "エンジン",
  sectionRecent: "最近のファイル",
  sectionLog: "ログ",
  sectionIgnore: "パス無視",
  helpProfile: "入力欄で改名（Enter / フォーカスアウトで保存）。矢印で切替。新規は空の接続。すべて削除可。",
  helpBaseUrl: "OpenAI 互換 API のルート（必要なバージョンパスを含む）。例: http://127.0.0.1:11434/v1。補完前に必須。",
  helpApiKey: "ローカルサーバーでは省略可。IDE の秘密領域のみに保存。エクスポート・スナップショット・ログには出ません。",
  helpTemplate: "リクエスト本文の組み立て方。自動はモデル名から推定。結果が空ならテンプレートテストで確認。",
  helpTimeout: "ゴーストテキスト補完のハードタイムアウト（ms）。500–30000。応答性のため 2000–5000 推奨。",
  helpStream: "試験的な SSE 先頭トークン。stream=true 対応が確実でない限りオフ推奨。",
  helpBehavior: "補完を許可する条件のマスタ制御。",
  helpDebounce: "入力後にリクエストするまでの適応遅延。観測レイテンシに応じ min〜max で調整。",
  helpContextBudget: "カーソル前後に送れるコード量。大きいほど文脈が増え、トークンと遅延も増えます。詳細でプロファイル上書き可。",
  helpIgnoreGlobs: "1 行 1 グロブ（例: **/node_modules/**）。.gitignore 尊重がオンなら併用。",
  helpDisabledLanguages: "カンマ区切りの言語 ID（例: markdown, json）。表示名ではありません。",
  helpLogRetention: "メモリ上のログリング件数。満杯で古いものから破棄。50–10000、既定 1000。",
  helpLogPromptBodies: "機密: 切り詰めプロンプトをログに記録。障害調査時以外はオフ。",
  logsHint: "エンジンと共有のログ（接続テスト・補完）。ホストからバッチ配信。",
  moreActions: "インポート / エクスポート",
  tabGeneral: "一般",
  sectionGeneral: "一般",
  confirmDeleteInline: "この構成を削除しますか？",
  confirmDeleteYes: "削除",
  confirmDeleteCancel: "キャンセル",
  saving: "保存中…",
  saved: "保存しました",
  saveError: "保存に失敗しました",
  helpMaxTokens: "1 回の補完で生成する最大トークン。目安 64–256。大きいほど長い提案と遅延・消費が増えます。",
  helpSettingsTimeout: "モデル取得・接続テスト・テンプレート探索のタイムアウト（ms）。1000–120000、既定 15000。",
  helpTemperature: "サンプリング温度 0–2。コード補完は 0 推奨（安定・再現性）。",
  helpAuthHeader: "認証ヘッダー。${apiKey} がシークレット。キー空ならヘッダー省略。例: Authorization: Bearer ${apiKey}",
  helpFimPath: "Base URL 相対の FIM パス上書き。空ならテンプレ既定（多くは /fim/completions）。",
  helpChatPath: "Chat 補完パス。OpenAI 互換の既定は /chat/completions。",
  helpCompletionsPath: "トークン FIM（Qwen / DeepSeek / StarCoder）用 /completions パス。空で既定。",
  helpExtraHeaders: "追加 HTTP ヘッダーの JSON オブジェクト。例: {\"X-Custom\":\"value\"}。配列は不可。",
  helpEnabled: "マスタスイッチ。オフだと自動・手動とも補完しません。",
  helpAutoTrigger: "入力中に自動リクエスト。オフでも IDE ショートカット/コマンドで手動可能。",
  manualTriggerShortcut: "手動トリガーのショートカット",
  helpManualTriggerShortcut:
    "IDE キーマップが管理（このパネルでは変更しません）。既定: Ctrl/Cmd+Shift+Space。ボタンでホストのショートカット設定を開き Trigger にフォーカスします。",
  openKeymap: "Keymap で設定…",
  openKeymapFailed:
    "IDE のショートカット設定を開けませんでした。JetBrains「設定 → キーマップ」、VS Code「キーボード ショートカット」で Auto Complete Trigger を検索してください。",
  helpInComments: "コメント内で補完を許可。検出は軽量ヒューリスティックです。",
  helpInStrings: "文字列リテラル内で補完を許可。検出は軽量ヒューリスティックです。",
  helpFirstLineOnly: "行の途中で複数行が返った場合、先頭行のみ表示してノイズを抑えます。",
  helpSendFilePath: "現在のファイルパスをプロンプトに含める。プライバシー優先ならオフ。",
  helpShowStatusBar: "ステータスバーに Auto Complete を表示（オン/オフとモデル）。即時反映。",
  helpRespectGitignore: "プロジェクト/ワークスペース直下の .gitignore に一致するパスをスキップ。下の無視パターンと併用。",
  helpDebounceInitial: "入力後の初期待ち（ms）。目安 ~300。その後 min〜max で適応。",
  helpDebounceMin: "適応デバウンス下限（ms）。目安 100–150。",
  helpDebounceMax: "適応デバウンス上限（ms）。目安 800–1000。遅いサーバーでは高めに。",
  helpCacheSize: "ファイル単位で保持する直近提案数。目安 10–40。モデルへ送る内容は変えません。",
  helpLruSize: "プロンプト鍵 LRU サイズ。同一文脈の再ヒット用。目安 32–128。",
  helpMaxInFlight: "同時補完リクエスト数。通常は 1。並列耐性が高いエンドポイントのみ増加。",
  helpMaxFileSize: "このサイズ（KB）を超える開いているファイルは補完スキップ。既定 512。",
  helpEnableRecent: "他の開いているエディタの断片を添付。より多くのコードを送信します。不要ならオフ。",
  helpRecentLimit: "最近ファイル文脈がオンのとき取り込む他ファイル数の上限。",
  helpRecentMaxChars: "各最近ファイル断片の最大文字数。",
  helpLogLevel: "ログに書く最小重要度。調査時のみ debug。",
  helpNotifyFatal: "致命的な認証/設定エラー（401/403 など）で IDE 通知。ログは常に記録。",
  helpShowCost: "usage があるとき成功ログにトークン数を付与。料金見積もりではありません。",
  helpMaxPrefix: "カーソル前に送れる最大文字数。大きいほど文脈・トークン・遅延が増えます。",
  helpMaxSuffix: "カーソル後に送れる最大文字数（FIM）。通常はプレフィックスより小さく。",
  sectionAbout: "について",
  aboutBlurb:
    "JetBrains と VS Code 向けのオープンソース BYO エンドポイント行内補完。Issue・ドキュメント・リリースは GitHub にあります。",
  aboutLicense: "ライセンス: Apache-2.0",
  aboutOpenGithub: "GitHub リポジトリを開く",
  aboutOpenIssues: "Issue を報告",
  aboutVersion: "バージョン",
  aboutOpenFailed: "リンクを開けませんでした。URL をコピーしてブラウザで開いてください。",
};

export const ko: Messages = {
  title: "Auto Complete",
  tabSettings: "설정",
  tabConfig: "구성",
  tabBehavior: "완성 동작",
  tabPerformance: "성능",
  tabLogs: "로그",
  profiles: "저장된 구성",
  newProfile: "새로 만들기",
  deleteProfile: "삭제",
  renameProfile: "이름 바꾸기",
  baseUrl: "기본 URL",
  model: "모델",
  promptTemplate: "프롬프트 템플릿",
  apiKey: "API 키",
  keyConfigured: "(구성됨)",
  keyMissing: "(없음)",
  maxTokens: "최대 토큰",
  timeoutMs: "완성 제한 시간(ms)",
  settingsTimeoutMs: "프로브 제한 시간(ms)",
  temperature: "온도",
  stream: "스트림(실험)",
  apply: "적용",
  testConnection: "연결 테스트",
  fetchModels: "모델 가져오기",
  fetchingModels: "가져오는 중…",
  modelsLoaded: "모델 {0}개 로드됨",
  modelsEmpty: "모델이 없습니다. 모델 ID를 직접 입력할 수 있습니다.",
  modelsFailed: "모델 로드 실패: {0}",
  helpModel: "서버가 기대하는 모델 ID. 직접 입력하거나 목록을 가져온 뒤 선택. 구성이 있으면 필수.",
  clearKey: "키 지우기",
  tryTemplate: "템플릿 테스트",
  tryAllTemplates: "모든 템플릿 시도",
  clearLogs: "지우기",
  copyLogs: "복사",
  export: "내보내기",
  import: "가져오기",
  secretHint: "키는 IDE 보안 저장소에만 있습니다. 스냅샷·내보내기·로그에 평문 키가 없습니다.",
  applied: "적용됨",
  testing: "테스트 중…",
  loadFailed: "설정을 불러오지 못했습니다",
  enabled: "사용",
  autoTrigger: "자동 실행",
  advanced: "고급",
  authHeader: "인증 헤더 템플릿",
  fimPath: "FIM 경로 재정의",
  chatPath: "Chat 경로",
  completionsPath: "Completions 경로",
  extraHeaders: "추가 헤더 JSON(평문, 내보내지 않음)",
  overrideBudget: "컨텍스트 예산 재정의",
  maxPrefix: "접두사 최대 문자",
  maxSuffix: "접미사 최대 문자",
  enableInComments: "주석에서 완성",
  enableInStrings: "문자열에서 완성",
  firstLineOnly: "줄 중간에서 첫 줄만 표시",
  sendFilePath: "파일 경로 전송",
  showStatusBar: "상태 표시줄 표시",
  respectGitignore: ".gitignore 준수",
  ignoreGlobs: "무시 패턴",
  disabledLanguages: "비활성 언어",
  debounceInitial: "초기 디바운스(ms)",
  debounceMin: "최소 디바운스(ms)",
  debounceMax: "최대 디바운스(ms)",
  cacheSize: "완성 캐시",
  lruSize: "프롬프트 LRU",
  maxInFlight: "최대 동시 요청",
  maxFileSize: "파일 크기 상한(KB)",
  enableRecent: "최근 연 파일 포함",
  recentLimit: "최근 파일 수",
  recentMaxChars: "파일당 문자 수",
  logLevel: "로그 수준",
  logFilter: "최소 수준",
  logRetention: "로그 버퍼 크기",
  logPromptBodies: "전체 프롬프트 기록(민감)",
  notifyFatal: "치명적 인증 오류 알림",
  showCost: "로그에 토큰 사용량 표시",
  confirmDelete: "이 저장된 구성을 삭제할까요?",
  noProfiles: "(없음)",
  platform: "호스트",
  probeResults: "프로브 결과",
  importOk: "가져옴",
  exportOk: "클립보드에 복사됨",
  jcefFallback: "웹 패널을 사용할 수 없습니다. IDE 설정 → 도구 → Auto Complete를 사용하세요.",
  importPrompt: "이 플러그인에서 내보낸 설정 JSON을 붙여넣으세요. API 키는 포함되지 않습니다.",
  importTitle: "설정 가져오기",
  importPlaceholder: '{ "schemaVersion": 1, "profiles": [ … ] }',
  importConfirm: "가져오기",
  importEmpty: "비어 있지 않은 설정 JSON을 먼저 붙여넣으세요.",
  language: "언어",
  theme: "테마",
  themeAuto: "자동(IDE 따름)",
  themeLight: "라이트",
  themeDark: "다크",
  helpTheme: "이 설정 패널 모양만 변경. IDE 테마는 그대로. 자동은 IDE 배색을 따름.",
  helpLanguage: "이 설정 패널 언어만 변경. IDE UI 언어는 그대로. 자동은 IDE 표시 언어. 선택 저장됨.",
  helpImportExport: "내보내기는 API 키 없는 JSON 복사. 가져오기 후 키를 다시 입력해야 함.",
  helpOverrideBudget: "성능 탭 대신 이 구성의 접두/접미 한도 사용. 켠 뒤에만 아래 필드 편집.",
  templateAuto: "자동",
  templateCodestral: "(fim) OpenAI FIM",
  templateQwen: "(fim) Qwen",
  templateDeepseek: "(fim) DeepSeek",
  templateStarcoder: "(fim) StarCoder",
  templateChat: "(chat) 의사 FIM",
  failed: "실패",
  exportFailed: "내보내기 실패",
  importFailed: "가져오기 실패",
  emptyLogs: "—",
  hostJetbrains: "JetBrains",
  hostVscode: "VS Code",
  hostMock: "브라우저(목)",
  languageAuto: "자동(IDE 따름)",
  sectionProvider: "제공자 연결",
  sectionBehavior: "완성 동작",
  sectionAdvanced: "고급(시간 제한, 경로, 문맥)",
  sectionAppearance: "모양",
  sectionDebounce: "디바운스",
  sectionContext: "컨텍스트 예산",
  sectionEngine: "엔진",
  sectionRecent: "최근 파일",
  sectionLog: "로그",
  sectionIgnore: "경로 무시",
  helpProfile: "상자에서 이름 변경(Enter/포커스 아웃 저장). 화살표로 전환. 새로 만들기는 빈 연결. 모두 삭제 가능.",
  helpBaseUrl: "OpenAI 호환 API 루트(필요한 버전 경로 포함). 예: http://127.0.0.1:11434/v1. 완성 전에 필수.",
  helpApiKey: "일부 로컬 서버는 생략 가능. IDE 보안 저장소에만 보관. 내보내기·스냅샷·로그에 평문 없음.",
  helpTemplate: "요청 본문 구성 방식. 자동은 모델 이름으로 추론. 결과가 비면 템플릿 테스트로 확인.",
  helpTimeout: "고스트 텍스트 완성 제한 시간(ms). 500–30000. 반응성을 위해 2000–5000 권장.",
  helpStream: "실험적 SSE 첫 토큰. 서버가 stream=true를 확실히 지원할 때만 켜세요.",
  helpBehavior: "완성 허용 조건의 마스터 제어.",
  helpDebounce: "입력 후 요청까지의 적응형 지연. 관측 지연에 따라 최소~최대 사이에서 조절.",
  helpContextBudget: "커서 앞뒤로 보낼 수 있는 코드량. 클수록 문맥·토큰·지연 증가. 고급에서 구성별 재정의 가능.",
  helpIgnoreGlobs: "줄마다 경로 글롭(예: **/node_modules/**). .gitignore 준수와 함께 적용.",
  helpDisabledLanguages: "쉼표로 구분한 언어 ID(예: markdown, json). 표시 이름 아님.",
  helpLogRetention: "메모리 로그 링 크기. 가득 차면 오래된 항목 삭제. 50–10000, 기본 1000.",
  helpLogPromptBodies: "민감: 잘린 프롬프트를 로그에 기록. 장애 분석 시에만 켜세요.",
  logsHint: "엔진과 동일한 로그 버퍼. 호스트가 일괄 푸시합니다.",
  moreActions: "가져오기 / 내보내기",
  tabGeneral: "일반",
  sectionGeneral: "일반",
  confirmDeleteInline: "이 구성을 삭제하시겠습니까?",
  confirmDeleteYes: "삭제",
  confirmDeleteCancel: "취소",
  saving: "저장 중…",
  saved: "저장됨",
  saveError: "저장 실패",
  helpMaxTokens: "완성당 생성 토큰 상한. 보통 64–256. 클수록 긴 제안과 지연·소비 증가.",
  helpSettingsTimeout: "모델 가져오기·연결 테스트·템플릿 프로브 제한 시간(ms). 1000–120000, 기본 15000.",
  helpTemperature: "샘플링 온도 0–2. 코드 완성은 0 권장(안정·재현).",
  helpAuthHeader: "인증 헤더 템플릿. ${apiKey}가 비밀. 키가 비면 헤더 생략. 예: Authorization: Bearer ${apiKey}",
  helpFimPath: "Base URL 상대 FIM 경로 재정의. 비우면 템플릿 기본(대개 /fim/completions).",
  helpChatPath: "Chat 완성 경로. OpenAI 호환 기본 /chat/completions.",
  helpCompletionsPath: "토큰 FIM(Qwen/DeepSeek/StarCoder)용 /completions 경로. 비우면 기본.",
  helpExtraHeaders: "추가 HTTP 헤더 JSON 객체. 예: {\"X-Custom\":\"value\"}. 배열 불가.",
  helpEnabled: "마스터 스위치. 끄면 자동·수동 완성 모두 중지.",
  helpAutoTrigger: "입력 중 자동 요청. 꺼도 IDE 단축키/명령으로 수동 가능.",
  manualTriggerShortcut: "수동 트리거 단축키",
  helpManualTriggerShortcut:
    "IDE 키맵이 관리합니다(이 패널에서 바인딩을 바꾸지 않음). 기본: Ctrl/Cmd+Shift+Space. 버튼으로 호스트 단축키 설정을 열고 Trigger에 맞춥니다.",
  openKeymap: "Keymap에서 구성…",
  openKeymapFailed:
    "IDE 단축키 설정을 열 수 없습니다. JetBrains: 설정 → 키맵, VS Code: 키보드 단축키에서 Auto Complete Trigger를 검색하세요.",
  helpInComments: "주석 안에서 완성 허용. 감지는 가벼운 휴리스틱입니다.",
  helpInStrings: "문자열 리터럴 안에서 완성 허용. 감지는 가벼운 휴리스틱입니다.",
  helpFirstLineOnly: "줄 중간에서 여러 줄이 오면 첫 줄만 표시해 방해를 줄입니다.",
  helpSendFilePath: "현재 파일 경로를 프롬프트에 포함. 더 엄격한 프라이버시가 필요하면 끄세요.",
  helpShowStatusBar: "상태 표시줄에 Auto Complete 표시(켜짐/모델). 즉시 적용.",
  helpRespectGitignore: "프로젝트/워크스페이스 루트 .gitignore 일치 경로 건너뜀. 아래 무시 패턴과 함께 적용.",
  helpDebounceInitial: "입력 후 첫 대기(ms). 약 300 권장. 이후 최소~최대로 적응.",
  helpDebounceMin: "적응 디바운스 하한(ms). 100–150 권장.",
  helpDebounceMax: "적응 디바운스 상한(ms). 800–1000 권장. 느린 서버는 높이세요.",
  helpCacheSize: "파일별 최근 제안 캐시 개수. 10–40 권장. 모델로 보내는 내용은 바꾸지 않음.",
  helpLruSize: "프롬프트 키 LRU 크기. 동일 문맥 재사용. 32–128 권장.",
  helpMaxInFlight: "전역 동시 완성 요청 수. 보통 1. 병렬에 강한 엔드포인트만 올리세요.",
  helpMaxFileSize: "이 크기(KB)를 넘는 열린 파일은 완성 건너뜀. 기본 512.",
  helpEnableRecent: "다른 열린 편집기 조각을 첨부. 더 많은 코드를 전송합니다. 필요 없으면 끄세요.",
  helpRecentLimit: "최근 파일 문맥 사용 시 포함할 다른 파일 수 상한.",
  helpRecentMaxChars: "최근 파일 조각당 최대 문자 수.",
  helpLogLevel: "로그에 기록할 최소 수준. 문제 진단 시에만 debug.",
  helpNotifyFatal: "치명적 인증/구성 오류(401/403 등) 시 IDE 알림. 로그는 항상 기록.",
  helpShowCost: "usage가 있으면 성공 로그에 토큰 수 추가. 요금 추정이 아님.",
  helpMaxPrefix: "커서 앞 전송 가능 최대 문자. 클수록 문맥·토큰·지연 증가.",
  helpMaxSuffix: "커서 뒤 전송 가능 최대 문자(FIM). 보통 접두보다 작게.",
  sectionAbout: "정보",
  aboutBlurb:
    "JetBrains와 VS Code용 오픈소스, 자체 엔드포인트 AI 인라인 완성. 이슈·문서·릴리스는 GitHub에 있습니다.",
  aboutLicense: "라이선스: Apache-2.0",
  aboutOpenGithub: "GitHub 저장소 열기",
  aboutOpenIssues: "이슈 제보",
  aboutVersion: "버전",
  aboutOpenFailed: "링크를 열 수 없습니다. URL을 복사해 브라우저에서 여세요.",
};

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
  | "language"
  | "theme"
  | "themeAuto"
  | "themeLight"
  | "themeDark"
  | "helpTheme"
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
  | "saveError";

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
  settingsTimeoutMs: "Settings timeout (ms)",
  temperature: "Temperature",
  stream: "Stream (experimental)",
  apply: "Apply",
  testConnection: "Test connection",
  fetchModels: "Fetch models",
  fetchingModels: "Fetching…",
  modelsLoaded: "Loaded {0} models",
  modelsEmpty: "No models returned; you can still type a model id.",
  modelsFailed: "Failed to load models: {0}",
  helpModel: "Type a model id, or fetch the list from the server and pick one from the dropdown.",
  clearKey: "Clear key",
  tryTemplate: "Test template",
  tryAllTemplates: "Try all templates",
  clearLogs: "Clear",
  copyLogs: "Copy",
  export: "Export",
  import: "Import",
  secretHint:
    "Secrets never leave the host secure store. Snapshot and export never include API keys.",
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
  firstLineOnly: "First line only mid-line",
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
  maxInFlight: "Max in-flight",
  maxFileSize: "Max file size (KB)",
  enableRecent: "Include recent open files",
  recentLimit: "Recent file count",
  recentMaxChars: "Chars per recent file",
  logLevel: "Log level",
  logFilter: "Min level",
  logRetention: "Log retention",
  logPromptBodies: "Log full prompts (sensitive)",
  notifyFatal: "Notify on fatal auth errors",
  showCost: "Show approx. usage in logs",
  confirmDelete: "Delete this saved configuration?",
  noProfiles: "(none)",
  platform: "Host",
  probeResults: "Probe results",
  importOk: "Imported",
  exportOk: "Exported to clipboard",
  jcefFallback: "Web panel unavailable; use IDE Settings → Tools → Auto Complete.",
  importPrompt: "Paste settings JSON (no secrets):",
  language: "Language",
  theme: "Theme",
  themeAuto: "Auto (follow IDE)",
  themeLight: "Light",
  themeDark: "Dark",
  helpTheme: "Settings panel appearance. Auto follows the IDE color scheme.",
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
  helpProfile:
    "Type in the box to rename the active profile (Enter or blur saves). Open the arrow to switch profiles. New creates a blank profile; you may delete all.",
  helpBaseUrl: "OpenAI-compatible root, e.g. http://127.0.0.1:11434/v1",
  helpApiKey: "Stored only in the IDE secret store — never in settings export or snapshot.",
  helpTemplate: "Auto detects from model name. Use Test template / Try all to probe the endpoint.",
  helpTimeout: "Hard timeout for ghost-text completions (ms). Keep short for responsiveness.",
  helpStream: "Experimental SSE first-token streaming. Turn off if the server mishandles stream=true.",
  helpBehavior: "When and where completions may run.",
  helpDebounce: "Adaptive typing delay before a request. Min/initial/max in milliseconds.",
  helpContextBudget:
    "Global prefix/suffix character budgets. A profile can override these under Advanced when enabled.",
  helpIgnoreGlobs: "One path pattern per line, e.g. **/node_modules/**. Applied with .gitignore when enabled.",
  helpDisabledLanguages: "Comma-separated language IDs (e.g. markdown, json), not display names.",
  helpLogRetention: "In-memory ring buffer size (events). Oldest dropped when full. Range 50–10000.",
  helpLogPromptBodies: "Highly sensitive: records truncated prompt bodies in the log buffer.",
  logsHint: "Same buffer as the engine (connection tests, completions). Batch-refreshed from the host.",
  moreActions: "More",
  tabGeneral: "General",
  sectionGeneral: "General",
  confirmDeleteInline: "Delete this configuration?",
  confirmDeleteYes: "Delete",
  confirmDeleteCancel: "Cancel",
  saving: "Saving…",
  saved: "Saved",
  saveError: "Save failed",
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
  settingsTimeoutMs: "设置页超时（ms）",
  temperature: "温度",
  stream: "流式（实验）",
  apply: "应用",
  testConnection: "测试连接",
  fetchModels: "拉取模型",
  fetchingModels: "拉取中…",
  modelsLoaded: "已加载 {0} 个模型",
  modelsEmpty: "未返回模型，仍可手动输入模型 ID。",
  modelsFailed: "拉取模型失败：{0}",
  helpModel: "可手动输入模型 ID，或点击「拉取模型」后从下拉列表中选择。",
  clearKey: "清除密钥",
  tryTemplate: "测试模板",
  tryAllTemplates: "尝试全部模板",
  clearLogs: "清空",
  copyLogs: "复制",
  export: "导出",
  import: "导入",
  secretHint: "密钥只保存在宿主安全存储；快照与导出从不包含 API 密钥明文。",
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
  firstLineOnly: "行中仅首行建议",
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
  maxInFlight: "最大并发",
  maxFileSize: "文件大小上限（KB）",
  enableRecent: "附带最近打开的文件",
  recentLimit: "最近文件数",
  recentMaxChars: "单文件字符上限",
  logLevel: "日志级别",
  logFilter: "最低级别",
  logRetention: "日志条数",
  logPromptBodies: "记录完整提示词（敏感）",
  notifyFatal: "严重鉴权错误时通知",
  showCost: "日志中显示近似用量",
  confirmDelete: "删除此已保存配置？",
  noProfiles: "（无）",
  platform: "宿主",
  probeResults: "探测结果",
  importOk: "已导入",
  exportOk: "已复制到剪贴板",
  jcefFallback: "Web 面板不可用；请使用 IDE 设置 → 工具 → AI 自动补全。",
  importPrompt: "粘贴设置 JSON（不含密钥）：",
  language: "语言",
  theme: "主题",
  themeAuto: "自动（跟随 IDE）",
  themeLight: "白色",
  themeDark: "暗黑",
  helpTheme: "设置面板外观。自动时跟随 IDE 明暗色。",
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
  helpProfile: "在框内直接改名（回车或失焦保存）；点右侧箭头切换其它配置。「新建」为空配置；可删光全部。",
  helpBaseUrl: "OpenAI 兼容根地址，例如 http://127.0.0.1:11434/v1",
  helpApiKey: "仅保存在 IDE 密钥库，不会出现在导出或快照中。",
  helpTemplate: "自动按模型名检测。可用「测试模板 / 尝试全部」探测端点。",
  helpTimeout: "幽灵文本补全硬超时（毫秒），宜短以保证跟手。",
  helpStream: "实验性 SSE 首 token 流式。若服务端不支持请关闭。",
  helpBehavior: "何时、何处允许补全。",
  helpDebounce: "输入后自适应延迟再请求。最短 / 起始 / 最长，单位毫秒。",
  helpContextBudget: "全局前缀/后缀字符预算。配置高级选项可按配置覆盖。",
  helpIgnoreGlobs: "每行一条路径模式，如 **/node_modules/**。开启「遵循 .gitignore」时一并生效。",
  helpDisabledLanguages: "逗号分隔的语言 ID（如 markdown, json），不是界面显示名。",
  helpLogRetention: "内存环形缓冲条数。满则丢弃最旧。默认 1000，范围 50–10000。",
  helpLogPromptBodies: "高敏：在日志缓冲区记录截断后的 prompt 全文。",
  logsHint: "与引擎共用缓冲区（测连接、补全等），由宿主批量推送。",
  moreActions: "更多",
  tabGeneral: "基础设置",
  sectionGeneral: "通用",
  confirmDeleteInline: "确认删除此配置？",
  confirmDeleteYes: "确认删除",
  confirmDeleteCancel: "取消",
  saving: "保存中…",
  saved: "已保存",
  saveError: "保存失败",
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
  settingsTimeoutMs: "設定ページのタイムアウト（ms）",
  temperature: "温度",
  stream: "ストリーム（試験的）",
  apply: "適用",
  testConnection: "接続テスト",
  fetchModels: "モデル取得",
  fetchingModels: "取得中…",
  modelsLoaded: "{0} 件のモデルを読み込みました",
  modelsEmpty: "モデルが返りませんでした。手動で ID を入力できます。",
  modelsFailed: "モデルの取得に失敗しました: {0}",
  helpModel: "モデル ID を入力するか、取得した一覧からドロップダウンで選択します。",
  clearKey: "キーをクリア",
  tryTemplate: "テンプレートをテスト",
  tryAllTemplates: "すべてのテンプレートを試す",
  clearLogs: "クリア",
  copyLogs: "コピー",
  export: "エクスポート",
  import: "インポート",
  secretHint:
    "シークレットはホストの安全な保存領域のみに保存されます。スナップショットとエクスポートに API キーは含まれません。",
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
  firstLineOnly: "行中は先頭行のみ",
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
  maxInFlight: "最大同時実行",
  maxFileSize: "ファイルサイズ上限（KB）",
  enableRecent: "最近開いたファイルを含める",
  recentLimit: "最近ファイル数",
  recentMaxChars: "ファイルあたり文字数",
  logLevel: "ログレベル",
  logFilter: "最小レベル",
  logRetention: "ログ保持件数",
  logPromptBodies: "プロンプト全文を記録（機密）",
  notifyFatal: "致命的な認証エラーを通知",
  showCost: "ログに概算使用量を表示",
  confirmDelete: "この保存済み設定を削除しますか？",
  noProfiles: "（なし）",
  platform: "ホスト",
  probeResults: "プローブ結果",
  importOk: "インポートしました",
  exportOk: "クリップボードにコピーしました",
  jcefFallback:
    "Web パネルを利用できません。IDE 設定 → ツール → Auto Complete を使用してください。",
  importPrompt: "設定 JSON を貼り付け（シークレットなし）:",
  language: "言語",
  theme: "テーマ",
  themeAuto: "自動（IDE に合わせる）",
  themeLight: "ライト",
  themeDark: "ダーク",
  helpTheme: "設定パネルの外観。自動は IDE の配色に従います。",
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
  helpProfile:
    "入力欄で現在の設定名を編集（Enter / フォーカスアウトで保存）。矢印で他の設定に切替。新規は空。すべて削除可。",
  helpBaseUrl: "OpenAI 互換のルート。例: http://127.0.0.1:11434/v1",
  helpApiKey: "IDE の秘密領域のみに保存。エクスポートやスナップショットには含まれません。",
  helpTemplate: "モデル名から自動判定。テストでエンドポイントを確認できます。",
  helpTimeout: "ゴーストテキスト用のハードタイムアウト（ms）。短め推奨。",
  helpStream: "試験的な SSE 先頭トークン。非対応ならオフ。",
  helpBehavior: "補完を行う条件。",
  helpDebounce: "入力後の適応遅延。最短/初期/最長（ms）。",
  helpContextBudget: "グローバル前後文字予算。詳細でプロファイル単位の上書き可。",
  helpIgnoreGlobs: "1行1パターン。例: **/node_modules/**。.gitignore と併用可。",
  helpDisabledLanguages: "カンマ区切りの言語 ID（表示名ではない）。",
  helpLogRetention: "メモリリングバッファ件数。満杯で古いものから破棄。50–10000。",
  helpLogPromptBodies: "機密: 切り詰めプロンプト本文をログに記録。",
  logsHint: "エンジンと共有のログ（接続テスト・補完）。ホストからバッチ配信。",
  moreActions: "その他",
  tabGeneral: "一般",
  sectionGeneral: "一般",
  confirmDeleteInline: "この構成を削除しますか？",
  confirmDeleteYes: "削除",
  confirmDeleteCancel: "キャンセル",
  saving: "保存中…",
  saved: "保存しました",
  saveError: "保存に失敗しました",
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
  settingsTimeoutMs: "설정 페이지 제한 시간(ms)",
  temperature: "온도",
  stream: "스트림(실험)",
  apply: "적용",
  testConnection: "연결 테스트",
  fetchModels: "모델 가져오기",
  fetchingModels: "가져오는 중…",
  modelsLoaded: "모델 {0}개 로드됨",
  modelsEmpty: "모델이 없습니다. 모델 ID를 직접 입력할 수 있습니다.",
  modelsFailed: "모델 로드 실패: {0}",
  helpModel: "모델 ID를 직접 입력하거나, 목록을 가져온 뒤 드롭다운에서 선택합니다.",
  clearKey: "키 지우기",
  tryTemplate: "템플릿 테스트",
  tryAllTemplates: "모든 템플릿 시도",
  clearLogs: "지우기",
  copyLogs: "복사",
  export: "내보내기",
  import: "가져오기",
  secretHint:
    "비밀 값은 호스트 보안 저장소에만 보관됩니다. 스냅샷과 내보내기에는 API 키가 포함되지 않습니다.",
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
  firstLineOnly: "줄 중간에서 첫 줄만",
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
  logRetention: "로그 보관 수",
  logPromptBodies: "전체 프롬프트 기록(민감)",
  notifyFatal: "치명적 인증 오류 알림",
  showCost: "로그에 대략 사용량 표시",
  confirmDelete: "이 저장된 구성을 삭제할까요?",
  noProfiles: "(없음)",
  platform: "호스트",
  probeResults: "프로브 결과",
  importOk: "가져옴",
  exportOk: "클립보드에 복사됨",
  jcefFallback: "웹 패널을 사용할 수 없습니다. IDE 설정 → 도구 → Auto Complete를 사용하세요.",
  importPrompt: "설정 JSON 붙여넣기(비밀 없음):",
  language: "언어",
  theme: "테마",
  themeAuto: "자동(IDE 따름)",
  themeLight: "라이트",
  themeDark: "다크",
  helpTheme: "설정 패널 모양. 자동은 IDE 색 구성표를 따릅니다.",
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
  helpProfile:
    "상자에 입력해 이름 변경(Enter/포커스 아웃 저장). 화살표로 다른 구성 전환. 새로 만들기는 빈 구성. 모두 삭제 가능.",
  helpBaseUrl: "OpenAI 호환 루트. 예: http://127.0.0.1:11434/v1",
  helpApiKey: "IDE 보안 저장소에만 보관. 내보내기/스냅샷에 포함되지 않습니다.",
  helpTemplate: "모델 이름으로 자동 감지. 템플릿 테스트로 엔드포인트를 확인하세요.",
  helpTimeout: "고스트 텍스트 완성 제한 시간(ms). 짧게 유지하세요.",
  helpStream: "실험적 SSE 첫 토큰. 서버가 미지원이면 끄세요.",
  helpBehavior: "완성 허용 조건.",
  helpDebounce: "입력 후 적응형 지연. 최소/초기/최대(ms).",
  helpContextBudget: "전역 접두/접미 문자 예산. 고급에서 프로필 단위 재정의 가능.",
  helpIgnoreGlobs: "줄마다 경로 패턴. 예: **/node_modules/**. .gitignore와 함께 적용.",
  helpDisabledLanguages: "쉼표로 구분한 언어 ID(표시 이름 아님).",
  helpLogRetention: "메모리 링 버퍼 크기. 가득 차면 오래된 항목 삭제. 50–10000.",
  helpLogPromptBodies: "민감: 잘린 프롬프트 본문을 로그에 기록.",
  logsHint: "엔진과 동일한 로그 버퍼. 호스트가 일괄 푸시합니다.",
  moreActions: "더 보기",
  tabGeneral: "일반",
  sectionGeneral: "일반",
  confirmDeleteInline: "이 구성을 삭제하시겠습니까?",
  confirmDeleteYes: "삭제",
  confirmDeleteCancel: "취소",
  saving: "저장 중…",
  saved: "저장됨",
  saveError: "저장 실패",
};

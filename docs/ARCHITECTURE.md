# Architecture

## 1. 一句话

`auto-complete` 是一个**单进程 JetBrains 插件**：IDE 层只负责触发与展示 ghost text，补全引擎与 HTTP 客户端全部内置在 Kotlin 中，通过用户配置的 `baseUrl` / `apiKey` / `model` 直连补全服务。

## 2. 为什么不是 v5 原架构

### 2.1 v5.16.2 实际结构

Kilo legacy（`kilocode-legacy@v5.16.2`）的 JetBrains 补全**不是完整引擎**，而是薄客户端：

```
JB: KiloCodeInlineCompletionProvider
  -> InlineCompletionService
  -> RPC ExtHostCommands.executeContributedCommand(
       "kilo-code.jetbrains.getInlineCompletions",
       [uri, position, fullFileContent, languageId, requestId]
     )
  -> VS Code extension host
  -> AutocompleteJetbrainsBridge
  -> AutocompleteInlineCompletionProvider / AutocompleteModel
  -> Provider ApiHandler FIM stream
```

证据文件：

- `jetbrains/plugin/.../inline/KiloCodeInlineCompletionProvider.kt`
- `jetbrains/plugin/.../inline/InlineCompletionService.kt`
- `jetbrains/plugin/.../inline/InlineCompletionConstants.kt`
- `src/services/autocomplete/AutocompleteJetbrainsBridge.ts`
- `src/services/autocomplete/AutocompleteModel.ts`

### 2.2 v5 架构的问题（对新开源项目）

| 问题 | 说明 |
|---|---|
| 双进程 | JB + VS Code extension host，部署与调试成本高 |
| 整文件上传 | RPC 默认发送 `document.text` 全文 |
| 超时过长 | `RPC_TIMEOUT_MS = 10000`，补全体感差 |
| 鉴权耦合 | 依赖 Kilo ProviderSettings / ApiHandler / 账号 balance |
| 难独立开源 | 引擎与 agent 扩展主机绑死 |

### 2.3 v7 现状

`packages/kilo-jetbrains` 中仅剩 autocomplete settings 迁移残留，**没有可抽的完整内联补全产品实现**。  
真正算法仍在 `packages/kilo-vscode/src/services/autocomplete/`，且 FIM 走 `kilo serve`。

### 2.4 本项目决策

**保留 v5 的 IDE 交互经验，抛弃双进程桥。**  
算法规格从 classic autocomplete 抽取，用 Kotlin 在进程内重写。

### 2.5 双端：JetBrains + VS Code（进行中）

| 层 | 路径 | 说明 |
|----|------|------|
| 契约 | `packages/shared-spec/` | `settings.schema.json`、`templates.json`、`language-map.json`、`bridge-protocol.md`、golden `testdata/` |
| 引擎 JVM | `core/` | Kotlin `CompletionEngine`（现网 JetBrains） |
| 引擎 TS | `packages/core-ts/` | 同构管线；`fetch` + `AbortController`；共享 fixture 单测 |
| 设置 UI | `packages/settings-ui/` | React/Vite；默认「设置」\|「日志」；经 UiBridge |
| JB 宿主 | `plugin/` | InlineCompletion + Swing（过渡）；JCEF 嵌 Web 后续 |
| VS Code 宿主 | `hosts/vscode/` | InlineCompletionItemProvider + SecretStorage + Webview + OutputChannel |

- **禁止**用 VS Code Extension Host / `kilo serve` 给 JetBrains 做桥。  
- 密钥：JB `PasswordSafe` / VS Code `SecretStorage`；snapshot **永不**含明文 key。  
- 补全热路径只走 core，不经 settings-ui HTTP。

## 3. 逻辑架构

```
┌────────────────────────────────────────────────────────────┐
│ JetBrains IDE                                               │
│  InlineCompletionProvider / Handler                         │
│  Actions: accept / cancel / manual trigger / snooze         │
│  UI: Settings, StatusBar, Log ToolWindow                    │
└───────────────────────────┬────────────────────────────────┘
                            │ CompletionRequest
┌───────────────────────────▼────────────────────────────────┐
│ Engine (pure-ish, unit-testable)                            │
│                                                             │
│  1. Gate        enabled / snooze / ignore / size / auth     │
│  2. Cache       exact / partial typing / backspace          │
│  3. Skip        mid-word / terminators / language rules     │
│  4. Debounce    adaptive 150–1000ms                         │
│  5. Cancel      supersede previous same-scope job           │
│  6. Prompt      budgeted prefix/suffix (+ optional context) │
│  7. Client      HTTP FIM / chat-completions fallback        │
│  8. Filter      empty / duplicate / language postprocess    │
│  9. Publish     generation-id check → ghost text            │
│ 10. Observe     status bar + ring log + metrics             │
└───────────────────────────┬────────────────────────────────┘
                            │ ProviderRequest
┌───────────────────────────▼────────────────────────────────┐
│ Provider Adapters                                           │
│  openai-compatible | mistral-fim | custom headers/body      │
└────────────────────────────────────────────────────────────┘
```

## 4. 物理模块（建议仓库结构）

```
auto-complete/
  README.md
  docs/
  plugin/                                 # IntelliJ plugin module
    build.gradle.kts
    src/main/kotlin/io/autocomplete/
      plugin/        # lifecycle, plugin.xml wiring
      ide/           # InlineCompletion*, actions
      engine/        # orchestration pipeline
      cache/         # suggestion history + optional LRU
      skip/          # contextual skip
      prompt/        # prefix/suffix prune + templates
      context/       # optional recent-file snippets (off by default)
      client/        # HTTP, cancel, backoff, streaming opt-in
      filter/        # useless / duplicate / first-line policy
      config/        # PersistentState + PasswordSafe
      log/           # ring buffer + tool window
      ui/            # settings pages, status bar
      util/          # language map, ignore globs
    src/test/kotlin/io/autocomplete/
  gradle/
  settings.gradle.kts
```

### 4.1 依赖方向（强制）

```
ide/ui/plugin  -->  engine  -->  cache/skip/prompt/filter/client/config/log
```

禁止：

- `engine` 依赖 Swing / EDT API
- `client` 依赖 editor PSI（只吃纯字符串请求）
- 设置 UI 直接发 HTTP（必须经 engine/client，便于日志与熔断）

## 5. 核心数据模型

```kotlin
enum class Trigger { AUTO, MANUAL }

data class CompletionRequest(
    val id: String,
    val path: String,
    val language: String,
    val prefix: String,
    val suffix: String,
    val offset: Int,
    val trigger: Trigger,
    val generation: Long,
)

data class Usage(
    val inputTokens: Int? = null,
    val outputTokens: Int? = null,
    val cost: Double? = null,
)

data class CompletionResponse(
    val id: String,
    val text: String,
    val latencyMs: Long,
    val cached: Boolean,
    val model: String,
    val usage: Usage? = null,
)

sealed class CompletionOutcome {
    data class Success(val response: CompletionResponse) : CompletionOutcome()
    data object Cancelled : CompletionOutcome()
    data object Skipped : CompletionOutcome()
    data class Failed(val message: String, val status: Int? = null) : CompletionOutcome()
}
```

## 6. 请求流水线

```
onTyped / onManual
  if !enabled || snoozed || ignored || tooLarge || !configured:
      return empty
  build Request(id, prefix, suffix, lang, generation)
  cache lookup
      hit -> show ghost, log cacheHit, return
  contextual skip?
      yes -> return empty
  debounce (adaptive)
  cancel previous same-scope job
  if backoff.blocked:
      maybe probe / return empty
  build prompt under char budget
  HTTP complete (cancellable, timeout)
  postprocess + filter
  if generation stale:
      drop
  push cache + show ghost
  update status + append log
```

### 6.1 generation / requestId

沿用 v5 的 stale 防护思想，但落在进程内：

- 每次触发递增 `generation`
- 返回时若 `response.generation != current`，丢弃
- 用户继续输入时 cancel 旧 job，并视为正常路径（不弹错误）

## 7. IDE 集成

### 7.1 API 选择

- 主路径：`InlineCompletionProvider` / 新版 Inline Completion API
- 目标 IDE：**2024.2+**（可再评估下调）
- 展示：`InlineCompletionGrayTextElement`（或等价 ghost text element）
- 接受：自定义 insert handler 记 accept 日志
- 手动触发：Action + shortcut
- 取消：Esc / 新输入 supersede

### 7.2 从 v5 可保留的壳层经验

| v5 行为 | 本项目 |
|---|---|
| Provider 注册/注销 | 保留，但改为本地 engine，不经 RPC |
| requestId 丢弃过期结果 | 保留为 generation |
| cancel 当正常路径 | 保留 |
| accept 后 hook | 保留为本地 log/metrics |
| 10s RPC 超时 | **不保留**，默认 2500ms |
| 发送全文 | **不保留**，只发 budgeted prefix/suffix |

## 8. Provider 层

详见 [PROVIDERS.md](PROVIDERS.md)。

摘要：

1. **openai-compatible**：`POST {baseUrl}/chat/completions` 或兼容 completions
2. **mistral-fim**：`POST {baseUrl}/v1/fim/completions`（或用户覆盖 path）
3. **custom**：自定义 path / headers / body 模板

认证：

- `apiKey` 存 PasswordSafe，不进明文 xml
- 支持空 key（本地无鉴权）
- header 模板：`Authorization: Bearer ${apiKey}` 等

## 9. 线程与并发

| 工作 | 线程 |
|---|---|
| 读 editor 文本 / offset | ReadAction |
| debounce 计时 | 协程 |
| HTTP | `Dispatchers.IO` |
| 更新 ghost text | Inline completion 约定上下文 / EDT 规则 |
| 日志 append | 线程安全 ring buffer |

并发策略：

- 同文件 scope：`maxInFlight = 1`
- 新请求 cancel 旧请求
- 可选 covering pending reuse（同 prefix 覆盖时复用 in-flight）

## 10. 缓存

### L1 Suggestion History

- 容量默认 20
- 匹配类型：
  - exact：prefix/suffix 全等
  - partial_typing：用户继续键入 suggestion 前缀
  - backward_deletion：用户退格但仍覆盖原 suggestion

### L2 Prefix Hash LRU（可选）

- 默认 64
- key：`hash(language + prunedPrefix + prunedSuffix + model)`
- 仅存结果文本与元数据，不存密钥

## 11. Skip 与 Filter

### Skip（发网前）

- mid-word 无收益场景
- 语句终止符后（语言相关）
- ignored path / gitignore
- 超大文件
- 禁用语言
- 熔断中

### Filter（响应后）

- 空文本
- 与 prefix/suffix 重复
- 多行边缘重复
- 重复短语死循环
- first-line-only（行中输入时）

## 12. 错误与熔断

分类：

| 类型 | 例 | 行为 |
|---|---|---|
| fatal | 401/403 | 停止请求直到用户改配置或手动 reset |
| retriable | 429/5xx | 指数退避 2s→120s；连续失败开路 |
| timeout | 超过 timeoutMs | 记失败，不弹模态框 |
| cancel | 用户续输 | 静默 |
| transient | 其他网络抖动 | 有限重试或直接空结果 |

UI：

- fatal：状态栏 error + 可选通知 + 日志
- 普通失败：只写日志，不打断输入

## 13. 配置与隐私

详见 [SETTINGS.md](SETTINGS.md)。

关键默认：

- 默认当前文件 budgeted 上下文
- `enableRecentFileContext=false`
- `logPromptBodies=false`
- `respectGitignore=true`
- `allowRemote=true`（false 时仅 localhost）

## 14. 可观测性

### Status bar

- `AC: on | snoozed | error`
- model 短名
- last latency
- 可选 cache hit 提示

### Log Tool Window

字段：

- time
- requestId
- file
- trigger
- cacheHit
- latencyMs
- httpStatus
- error
- prefixChars / suffixChars（debug）

默认不落 prompt 全文。

## 15. 测试策略

| 层 | 内容 |
|---|---|
| 单元 | cache match、skip、filter、backoff、prompt budget、settings validation |
| 契约 | provider request/response JSON fixtures |
| 集成 | fake HTTP server + pipeline |
| IDE smoke | `runIde` 手动：触发 / 取消 / 接受 / 超时 / 401 |

避免用 mock 复制业务逻辑；优先假服务器与纯函数测试。

## 16. 构建与发布（后续）

- IntelliJ Platform Gradle Plugin
- CI：build + test + plugin verifier
- 分发：先 GitHub Release zip，后 Marketplace

## 17. 架构红线

1. 不引入 VS Code extension host / RPC bridge
2. 不默认捆绑 `kilo serve`
3. 不在 EDT 做 HTTP 或大字符串处理
4. 不默认发送全仓库 / 全文超预算上下文
5. 不把 apiKey 写进普通 xml state
6. 不把 Next Edit / Agent 塞进 v1 主路径

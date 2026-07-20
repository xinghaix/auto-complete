# 架构

[English](ARCHITECTURE.en.md) · [文档索引](README.md) · [项目主页](../README.md)

> 本文以当前仓库代码为准，覆盖 JetBrains 与 VS Code 两个已在树内实现的宿主；它们共享行为规格，但**不是**通过彼此的扩展宿主或 RPC 通信。

## 目标与边界

Auto Complete 是自带模型端点的 AI 内联代码补全项目。用户提供 `baseUrl`、模型和可选 API 密钥；插件显示 ghost text 并在输入继续时取消旧请求。

明确不做：

- JetBrains 调用 VS Code Extension Host、`kilo serve` 或任何外部桥接进程；
- 默认发送整个仓库或开启多文件上下文；
- 在设置 Web UI 中直接向用户端点发 HTTP；
- 在 JetBrains EDT 上进行网络请求；
- 把 Agent、Next Edit 或账号体系混入补全主路径。

项目借鉴 Kilo Code 的经典补全行为，但当前实现是独立的 Kotlin/TypeScript 双引擎实现；来源和许可边界见 [SOURCES.md](SOURCES.md) 与 [NOTICE](../NOTICE)。

## 仓库结构

```text
auto-complete/
├── packages/completion/engine-jvm/                     Kotlin/JVM 补全引擎（无 IntelliJ UI 依赖）
├── apps/jetbrains/plugin/                   JetBrains 宿主：Inline Completion、JCEF、PasswordSafe、IDE HTTP 支持
├── packages/
│   ├── shared-spec/          设置、模板、语言映射、UiBridge 协议和 golden fixtures
│   ├── core-ts/              TypeScript 补全引擎
│   └── settings-ui/          Vue 3 设置与日志界面，供两个宿主嵌入
├── apps/vscode/extension/             VS Code 扩展：Inline provider、SecretStorage、Webview、OutputChannel
├── docs/                     面向用户和贡献者的文档
└── scripts/package-local.sh  构建 JetBrains zip 与 VSIX 的本地打包脚本
```

Gradle 项目只包含 `core` 和 `plugin`（见 `settings.gradle.kts`）；根 `package.json` 管理 Node workspaces。JVM 和 Node 两条构建链并列存在，不能把它们误解为“JetBrains 插件依赖 VS Code 扩展”。

## 宿主与职责

| 层 | JetBrains | VS Code |
|---|---|---|
| 内联入口 | `apps/jetbrains/plugin/.../ide/AutoCompleteInlineProvider.kt` | `apps/vscode/extension/src/inline/provider.ts` |
| 引擎 | `packages/completion/engine-jvm/.../engine/CompletionEngine.kt` | `packages/completion/engine-ts/src/engine.ts` |
| 密钥 | `PasswordSafe` | `SecretStorage` |
| 设置和日志 UI | `settings-ui` 经 JCEF `JbUiBridge` 嵌入同一个 **Auto Complete** 工具窗口 | `settings-ui` 经 Webview `VsCodeUiBridge` 打开设置面板；原始日志同时写 OutputChannel |
| 持久化普通设置 | `PersistentStateComponent` | `globalState` 与 VS Code configuration 镜像 |
| 网络 | IDE 代理和信任库适配（`IdeHttpSupport`） | TypeScript `fetch` 客户端 |

JetBrains 的最低平台版本为 **2024.2 / build 242**。JCEF 设置页是唯一的 JetBrains 设置界面：2024.2 使用平台可用的 JCEF；较新 IDE 上 `com.intellij.modules.jcef` 是**可选**依赖并通过反射宿主加载。详见 [COMPATIBILITY.md](COMPATIBILITY.md)。VS Code 扩展声明最低 VS Code `^1.85.0`。

## 补全数据流

```text
编辑器事件 / 手动命令
  → 宿主读取当前文档快照，确定 language、cursor、path、触发类型
  → CompletionEngine
      1. gate：启用、snooze、语言、注释/字符串、文件大小、忽略规则、设置校验
      2. suggestion history / prompt LRU 缓存
      3. contextual skip
      4. 自适应 debounce；按文件 scope 取消上一个任务
      5. PromptBuilder：按 prefix/suffix 字符预算裁剪，可选附带路径和最近文件片段
      6. HTTP client：按模板构造 FIM 或 chat 请求
      7. 过滤空结果、重复结果和行中多行结果
      8. generation 校验，丢弃过期响应
  → 宿主渲染 InlineCompletionItem / InlineCompletionGrayTextElement
  → 日志、状态栏和 UI Bridge 更新
```

JetBrains 入口会读取文档来形成 prefix/suffix，但出站请求由 `PromptBuilder` 裁剪；它**不等于**默认上传整文件。VS Code 当前的注释/字符串提示固定为 `false`（见 `apps/vscode/extension/src/inline/provider.ts`），因此这两个开关在 VS Code 主路径尚未执行语义识别；该限制应在宿主文档中明确，而不是承诺与 JetBrains 完全等价。

## 引擎行为

两个引擎均实现并测试以下核心语义：

- generation 编号和可取消任务，避免过期建议写回；
- 自动触发的自适应防抖，默认 `150 / 300 / 1000 ms`（最小 / 初始 / 最大）；
- 每个 scope 的 suggestion history，以及按语言、模型、裁剪 prompt 计算键的 LRU；
- `.gitignore`（JetBrains）与额外 glob 跳过、禁用语言、文件大小限制；VS Code 当前只将额外 glob 送入引擎；
- 前后缀 prompt 预算（默认 `8000 / 2000` 字符）；
- FIM 与 chat 模板、请求超时、HTTP 状态分类和退避；
- 可选 SSE 流式首 token、日志脱敏和 fatal 认证错误通知。

全局 `maxInFlight` 默认是 1。新请求会取消同一文件的请求；达到全局上限时，引擎会取消另一 scope 的在途任务，而不是无限排队。

## Provider 与请求模板

`HttpCompletionClient`（JVM）和 `packages/completion/engine-ts/src/httpClient.ts`（TS）依据模型名或用户选择解析模板：

| 模板 | 默认相对路径 | 传输形式 |
|---|---|---|
| OpenAI FIM / Codestral | `/fim/completions` | `prompt` + `suffix` |
| Qwen、DeepSeek、StarCoder FIM | `/completions` | 带各自 FIM token 的 `prompt` |
| Pseudo-FIM Chat | `/chat/completions` | OpenAI-style `messages` |

`AUTO` 从模型名推断模板，推断不到时回退 chat。设置 UI 可拉取 `/models`，测试连接、测试一个模板或依次测试所有模板。测试走 **UI Bridge → 宿主 → 引擎客户端**，不会从 JCEF/Webview 直接发请求。完整协议和路径规则见 [PROVIDERS.md](PROVIDERS.md)。

## 配置、隐私与日志

设置分为全局行为/性能/日志设置和具名 Provider profile。每个 profile 保存端点、模型、模板、超时和可选上下文预算；API key 永远独立存入 PasswordSafe 或 SecretStorage。导出和 UiBridge snapshot 只有 `hasApiKey` 标志，绝不含明文 key。

默认值强调输入路径与隐私：不启用最近文件上下文、不记录 prompt 正文、JetBrains 遵循 `.gitignore`（VS Code 当前只可靠地应用额外 glob）、最大文件 512 KB、补全硬超时 3000 ms。用户开启 `logPromptBodies` 后，日志会记录截断 prompt，属于高敏设置。

UiBridge 的请求/响应 envelope、日志批处理、主题/语言推送与安全规则由 [packages/completion/contracts/bridge-protocol.md](../packages/completion/contracts/bridge-protocol.md) 定义。

## 验证边界

- Kotlin：`packages/completion/engine-jvm/src/test` 覆盖引擎、缓存、跳过、模板、HTTP fixtures、设置校验；`apps/jetbrains/plugin/src/test` 覆盖 profile、i18n 和 UI 状态。
- TypeScript：`packages/completion/engine-ts/test/fixtures.test.ts` 对照 shared-spec golden fixtures；settings UI 有 i18n、挂载和 HTML entry 测试。
- CI：JDK 21 job 运行 `:core:test :plugin:test` 并构建 zip；Node 22 job 运行 `npm run test:js` 和 `npm run build:js`。

构建、安装和打包说明见 [RELEASE.md](RELEASE.md)。
# 实现状态

[English](IMPLEMENTATION_STATUS.en.md) · [文档索引](README.md)

> 本页记录当前源码已实现的能力与明确的宿主差异，不把规划项写成已交付功能。构建/测试结果应以本次 CI 或本地命令输出为准。

## 已在树内实现

| 范围 | JetBrains | VS Code / 共享部分 |
|---|---|---|
| 宿主 | `InlineCompletionProvider`、手动触发、取消、开关、snooze、状态栏、同一工具窗口的 Settings/Logs | `InlineCompletionItemProvider`、Trigger/Toggle/Settings/Logs/Set API Key 命令、状态栏、OutputChannel |
| 引擎 | Kotlin `CompletionEngine`、可取消 async HTTP、cache、skip、filter、backoff、prompt budget | TypeScript dual engine，覆盖相同主流水线与 shared fixtures |
| Provider | OpenAI FIM、Qwen/DeepSeek/StarCoder token FIM、Pseudo-FIM chat、模板/连接/模型探测 | 相同模板类别和 HTTP client 语义 |
| 设置 | 多 profile、PasswordSafe、PersistentState、JCEF UiBridge、IDE HTTP proxy/trust store | 多 profile、SecretStorage、globalState/config mirror、Webview UiBridge |
| 共用 UI/规格 | — | `settings-ui`（Vue 3，en/zh/ja/ko）、`shared-spec` schema/templates/language map/bridge/fixtures |
| CI | JDK 21 tests + `buildPlugin` + ZIP artifact | Node 22：JS tests + JS build |

JetBrains 兼容性为 **IntelliJ Platform 2024.2+ / build 242+**。JCEF 是 Web 设置页运行条件，但 `com.intellij.modules.jcef` 在新 IDE 上是 optional 依赖；旧平台通过反射探测可用的 JCEF。详见 [COMPATIBILITY.md](COMPATIBILITY.md)。VS Code 扩展声明 `^1.85.0`。

## 已实现的引擎语义

- 启用、自动触发、手动触发、路径/语言/大小 gate；
- 自适应 debounce、同 scope 取消、generation stale drop、全局 `maxInFlight`；
- suggestion history 与 prompt LRU；
- FIM/chat prompt、模型名自动模板检测、path override、`/models` fallback；
- `timeoutMs` 与 `settingsTimeoutMs` 分离；SSE 首 token 流式为实验功能；
- 401/403 fatal、429/5xx/网络失败退避；
- 日志、响应过滤、路径和最近文件可选上下文；
- profile CRUD、密钥隔离、无密钥导出/导入。

## 已知差异与未完成 parity

| 项目 | 当前事实 |
|---|---|
| 注释/字符串检测 | JetBrains 通过 `ContextProbe` 填充 hint；VS Code provider 当前固定 `inComment=false`、`inString=false`，所以这些开关尚未在 VS Code 做语义生效。 |
| `.gitignore` | JetBrains 在项目 attach 时加载 `.gitignore`；VS Code 当前未将 workspace `.gitignore` 注入 TS engine，因此 VS Code 只可靠地应用额外 glob。 |
| 最近文件上下文 | JetBrains 会收集已打开文件片段；VS Code 当前没有向 TS engine 提供最近文件片段。 |
| 设置入口 | JetBrains 只有 JCEF 工具窗口入口，没有 Swing Configurable；VS Code 有 Webview 面板并镜像部分常用项到原生 Settings。 |
| 秘钥与配置命名 | 两宿主功能等价但持久化 key/name 细节不同；不要手工复制内部存储文件。 |
| 发布自动化 | CI 构建/测试；推送 `v*` tag 时自动创建不存在的同名 GitHub Release 并上传 ZIP/VSIX。签名和 Marketplace 仍未自动化。 |
| Agent / Next Edit | 不在产品范围。 |

这些项不应被 README、发布说明或 Marketplace 文案隐藏。任何声称“跨宿主完全相同”的改动都必须补齐实现和测试。

## 验证命令

```bash
npm install
./gradlew :core:test :plugin:test
npm run test:js
npm run build:js
./gradlew :plugin:buildPlugin
./scripts/package-local.sh
```

`package-local.sh` 会产出 ZIP 与 VSIX，但只显式运行 `:core:test`；完整测试仍需单独执行。详见 [RELEASE.md](RELEASE.md)。
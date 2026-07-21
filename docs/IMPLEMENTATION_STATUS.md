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
| 共用 UI/规格 | — | `packages/settings/ui`（Vue 3，en/zh/ja/ko；npm：`@auto-complete/settings-ui`）、`packages/completion/contracts` schema/templates/language map/bridge/fixtures（npm：`@auto-complete/shared-spec`） |
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

## 跨宿主策略

**默认趋同**：同一 schema、同一 settings-ui、同一引擎门控语义（启用、防抖、ignore、注释/字符串、最近文件、日志与 fatal 通知等）。  
**允许差异**：仅宿主平台能力（存储介质、UI 入口形态、密钥保险箱 API、命令/快捷键注册、VS Code 原生 Settings 镜像）。

## 已知差异（允许的平台差）

| 项目 | 当前事实 |
|---|---|
| 注释/字符串检测 | 两宿主均使用启发式 `ContextProbe`（JB Kotlin / VS Code TS `inspectContext`）。 |
| `.gitignore` | 两宿主均注入 workspace/项目根 `.gitignore`（JB attach 时加载；VS Code `VsCodeProjectContext` 刷新）。 |
| 最近文件上下文 | 两宿主均支持；JB 用已打开文件，VS Code 用打开/可见编辑器（limit/maxChars）。 |
| 设置入口 | JetBrains：JCEF 工具窗口（无 Swing Configurable）。VS Code：Webview + 部分项镜像原生 Settings。 |
| 秘钥与配置存储 | 功能等价；内部 key/name 不同，勿手工复制存储文件；用导出/导入迁移。 |
| 动作面 | JetBrains 有 snooze（状态栏/动作）；VS Code 以 Toggle/命令为主，无对等 snooze 状态字段。 |
| 发布自动化 | CI 构建/测试；`v*` tag 可上传 ZIP/VSIX。签名与 Marketplace 仍手动。 |
| Agent / Next Edit | 不在产品范围。 |

不要把「存储路径不同」说成「功能不同」。任何声称「跨宿主行为完全相同」的改动都必须补齐实现和测试。

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
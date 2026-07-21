# 架构

[English](ARCHITECTURE.en.md) · [文档目录](README.md)

用一句话：**两个 IDE 宿主 + 两套同名补全引擎 + 一套 Web 设置页**。两端不通过对方进程或 RPC 通信。

## 做什么 / 不做什么

**做：** 你提供 `baseUrl`、模型和可选密钥；在编辑器里显示 ghost text；继续输入时取消旧请求。

**不做：**

- JetBrains 去调 VS Code（或反过来）
- 默认上传整个仓库或多文件大上下文
- 设置页直接访问你的模型服务（必须经宿主再发 HTTP）
- 在 JetBrains 界面线程里做网络请求
- Agent / Next Edit / 账号体系

行为参考过 Kilo Code 的经典补全思路；代码是本仓库独立实现，见 [SOURCES.md](SOURCES.md)。

## 目录怎么分

```text
apps/jetbrains/plugin/     JetBrains 插件（内联补全、JCEF、密钥、网络）
apps/vscode/extension/     VS Code 扩展（同上，Webview）
packages/completion/
  engine-jvm/              Kotlin 引擎（Gradle :core）
  engine-ts/               TypeScript 引擎（npm @auto-complete/core-ts）
  contracts/               共享规则、模板、协议、测试样例
packages/settings/ui/      Vue 设置 + 日志页（两端嵌入）
docs/                      用户与贡献者文档
scripts/package-local.sh   本地打 ZIP + VSIX
```

Gradle 只管 `:core` 与 `:plugin`；Node workspace 管 TS 引擎、设置 UI、VS Code 扩展。两条构建链并列，不是「插件依赖扩展」。

## 谁负责什么

| | JetBrains | VS Code |
|---|---|---|
| 编辑器入口 | Inline Completion | Inline Completion |
| 引擎 | Kotlin | TypeScript |
| 密钥 | PasswordSafe | SecretStorage |
| 设置 / 日志 | 工具窗口（JCEF） | Webview 面板 + Output |
| 普通设置存哪 | `autoCompleteSettings.xml` | `globalState`（部分镜像到原生设置） |
| 网络 | IDE 代理 / 信任库 | 扩展里的 `fetch` |

JetBrains 最低 **2024.2**；设置页要有可用 JCEF。VS Code 最低 **1.85**。

## 一次补全怎么走

```text
编辑 / 手动触发
  → 宿主读当前文件片段、语言、路径
  → 引擎：
      是否启用、语言/路径/大小是否跳过
      缓存是否命中
      防抖；取消同文件旧任务
      按字符预算裁剪前后文
      HTTP 请求模型
      过滤空/重复建议；丢弃过期结果
  → 显示 ghost text；写日志 / 状态栏
```

默认只发光标附近代码，不是整文件。注释/字符串用轻量探测（两端都有）。设置语义尽量一致，见 [SETTINGS.md](SETTINGS.md)。

## 引擎共性

- 防抖默认约 150 / 300 / 1000 ms
- 补全超时默认 3 秒；设置页探测更长
- 前缀/后缀默认 8000 / 2000 字符
- 全局同时最多 1 个在途请求（默认可改）
- 可选流式（实验）、可选最近文件片段（默认关）

## 模型怎么请求

引擎按模板拼 URL 和 body（FIM 或 chat）。模板可自动猜，也可手选。设置页的「拉取模型 / 测试」走：**设置 UI → 宿主 → 引擎客户端**，不会在网页里直接请求你的服务。详见 [PROVIDERS.md](PROVIDERS.md)。

## 配置与隐私

- 全局行为 + 多套 profile
- 密钥不进普通配置、导出、快照
- 默认：不记完整 prompt、不带最近文件、尊重 `.gitignore`

协议细节：[UiBridge](../packages/completion/contracts/bridge-protocol.zh.md)

## 怎么验证

- JVM：`packages/completion/engine-jvm` 与插件测试
- JS：`engine-ts`、`settings-ui` 测试
- CI：JDK 21 + Node 22

构建步骤见 [RELEASE.md](RELEASE.md)。

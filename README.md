# Auto Complete

[中文](README.md) · [English](README.en.md)

<p align="center">
  <img src="docs/assets/logo.svg" width="96" height="96" alt="Auto Complete logo"/>
</p>

轻量 **AI 内联代码补全**：当前 **JetBrains** 插件已可用，**VS Code** 扩展为双引擎中的 TS 端（`hosts/vscode` + `packages/core-ts`）。

- 自备端点：`baseUrl` / API 密钥 / 模型
- 兼容 OpenAI 接口（Ollama、vLLM、各类网关、Mistral 等）
- 自适应防抖、缓存、跳过与错误退避
- 提示模板、双超时、密钥安全存储
- 状态栏 + 日志（JB 工具窗口 / VS Code Output + 设置面板）
- **双实现引擎**（Kotlin + TypeScript）+ `packages/shared-spec` 对齐；**不**依赖 VS Code Extension Host 给 JetBrains 做桥

**许可：** Apache-2.0 · **阶段：** 开源预览（磁盘安装 / VSIX / GitHub Release）。

---

## 项目由来

本插件的**代码补全核心能力与行为思路**，提取并重实现自开源项目 **[Kilo Code（kilocode）](https://github.com/Kilo-Org/kilocode)** 及其经典补全相关实现（含 [kilocode-legacy](https://github.com/Kilo-Org/kilocode-legacy) 中的算法与规格对照）。

在 kilocode 演进到 **v7** 之后，整体产品形态更重、内联补全路径更难独立维护与使用。因此将**补全能力抽离**为独立项目，专注「轻、快、可自托管端点」：

| 宿主 | 引擎 | 状态 |
|------|------|------|
| JetBrains (`plugin/`) | Kotlin `core/` | 可用（Install from Disk） |
| VS Code (`hosts/vscode/`) | TypeScript `packages/core-ts/` | 可装；多档案 + Webview 设置/日志 + 原生 Settings |
| 共用 Web | `packages/settings-ui/` | VS Code Webview + JetBrains **JCEF only**（无 Swing 设置） |

本仓库是**独立实现**，不是 VS Code 扩展宿主或 `kilo serve` 的二次封装；算法与产品灵感来自 kilocode 开源社区，详见 [NOTICE](NOTICE)、[docs/SOURCES.md](docs/SOURCES.md)。

### JetBrains 兼容版本

| 项 | 要求 |
|----|------|
| **最低 IDE** | **IntelliJ Platform 2024.2+**（`since-build` **242**） |
| 设置 UI | **JCEF Web only**（无 Swing 设置）。2024.2 用平台内嵌 JCEF；2025.3+/2026 请启用 **Web Browser (JCEF)**（可选依赖 `com.intellij.modules.jcef`） |
| 上限 | 不限制 `until-build` |

说明：2024.2 **也有** JCEF；通过 **optional 依赖 + 反射加载** 同时兼容「平台内嵌」与「独立 JCEF 插件」。详见 **[docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)**。

示例：IntelliJ IDEA **2024.2**、**2025.x**、**2026.x**。

---

## 安装（从磁盘）

1. 使用 **2024.2+** 的 JetBrains IDE。2026.x 请确认已启用 **Web Browser (JCEF)**。
2. 从 [Releases](../../releases) 下载 `auto-complete-*.zip`，或本地构建。
3. IDE → **设置 → 插件 → ⚙ → 从磁盘安装插件…**
4. 重启 IDE。
5. **设置 → 工具 → Auto Complete**，或侧栏工具窗口 **Auto Complete**。
6. 配置服务地址、模型、API 密钥（可选）→ **测试连接**。

本地示例（Ollama）：

| 项 | 示例 |
|----|------|
| 服务地址 | `http://127.0.0.1:11434/v1` |
| 模型 | `qwen2.5-coder:7b` |
| API 密钥 | 无鉴权时留空 |

手动触发：**Ctrl+Shift+Space**（可在 IDE「键盘映射」中修改，动作 `AutoComplete.Trigger`）。

---

## 从源码构建

### JetBrains

需要 **JDK 21**，以及可访问 IntelliJ Platform 依赖的网络。

```bash
# macOS Homebrew 示例（可选）
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home

./gradlew :core:test :plugin:test
./gradlew :plugin:buildPlugin
```

产物：`plugin/build/distributions/auto-complete-<version>.zip`

```bash
./gradlew :plugin:runIde
```

### 本地双端打包（推荐）

一次打出 **JetBrains zip + VS Code vsix**（会先 `build:settings-ui`，再 JB `buildPlugin`，再 VS Code `vsce package`）：

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home  # 如需
npm install   # 首次
./scripts/package-local.sh
# 或：npm run package:local
```

| 产物 | 安装 |
|------|------|
| `plugin/build/distributions/auto-complete-*.zip` | IDE → Plugins → Install from Disk |
| `hosts/vscode/dist-vsix/auto-complete-*.vsix` | VS Code → Extensions → Install from VSIX |

仅一端：`SKIP_JB=1 ./scripts/package-local.sh` 或 `SKIP_VSCODE=1 ./scripts/package-local.sh`。

### VS Code + 共用 JS

需要 **Node 18+**。

```bash
npm install
npm run test:core-ts
npm run build:js
# 扩展产物：hosts/vscode/dist/extension.js
# 仅 VS Code 包：npm run package:vscode  →  hosts/vscode/dist-vsix/*.vsix
```

目录约定：

| 路径 | 内容 |
|------|------|
| `packages/shared-spec/` | schema / templates / bridge / golden fixtures |
| `packages/core-ts/` | TypeScript 补全引擎 |
| `packages/settings-ui/` | 共用 Web 设置+日志 UI |
| `hosts/vscode/` | VS Code 扩展 |

---

## 模块

| 模块 | 职责 |
|------|------|
| `core/` | 纯 Kotlin 引擎、HTTP 客户端、缓存 / 跳过 / 过滤 / 退避（可单测） |
| `plugin/` | IntelliJ 平台：内联补全、设置、状态栏、日志 |

---

## 功能概览

- 幽灵文本内联补全，输入时取消过期请求
- **已保存配置**（切换 / 改名 / 删除；密钥进 PasswordSafe）
- 提示模板：自动 / OpenAI FIM / Qwen / DeepSeek / StarCoder / 对话伪 FIM
- 设置页模板 **测试** / **尝试全部**
- 补全超时与设置页探测超时分离
- 偏隐私默认：默认不全仓上下文；可选发送路径；忽略规则 + `.gitignore`
- 界面语言：English、中文、日本語、한국어

设计说明：`docs/` 下各文档（目前以中文为主，索引见 [docs/README.md](docs/README.md)）。

---

## 文档

| 文档 | 说明 |
|------|------|
| [docs/README.md](docs/README.md) | 文档索引（[English](docs/README.en.md)） |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 架构 |
| [docs/SETTINGS.md](docs/SETTINGS.md) | 设置说明 |
| [docs/PROVIDERS.md](docs/PROVIDERS.md) | 端点与模板 |
| [docs/PERFORMANCE.md](docs/PERFORMANCE.md) | 性能与预算 |
| [docs/RELEASE.md](docs/RELEASE.md) | 构建与分发 |
| [docs/OPEN_SOURCE.md](docs/OPEN_SOURCE.md) | 开源清单 |
| [docs/SOURCES.md](docs/SOURCES.md) | 与 kilocode 的参考关系 |
| [CHANGELOG.md](CHANGELOG.md) | 变更记录 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献指南（[中文](CONTRIBUTING.zh.md)） |
| [SECURITY.md](SECURITY.md) | 安全披露 |

---

## 隐私与安全

- API 密钥存放在 IDE **PasswordSafe**，不进明文设置 XML
- 默认不记录完整提示词；日志可脱敏鉴权头
- 补全使用前后缀预算，默认不发送全仓库
- 出站 HTTP 遵循 IDE **HTTP 代理**

---

## 贡献

见 [CONTRIBUTING.zh.md](CONTRIBUTING.zh.md) / [CONTRIBUTING.md](CONTRIBUTING.md)。较大改动请先开 Issue。

## 许可

Apache License 2.0 — 见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。

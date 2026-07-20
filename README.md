# Auto Complete

[中文](README.md) · [English](README.en.md) · [完整文档](docs/README.md)

<p align="center"><img src="docs/assets/logo.svg" width="96" height="96" alt="Auto Complete logo"/></p>

轻量、可自备端点的 **AI 内联代码补全**。项目已包含两个独立宿主：

| 宿主 | 运行时引擎 | 当前交付 |
|---|---|---|
| JetBrains | Kotlin/JVM `core/` + `plugin/` | ZIP，可从磁盘安装 |
| VS Code | TypeScript `packages/core-ts/` + `hosts/vscode/` | VSIX，可从磁盘安装 |
| 共用界面与规格 | Vue `packages/settings-ui/` + `packages/shared-spec/` | 两端嵌入；共享模板、设置契约和 fixture |

JetBrains 与 VS Code 不通过 Extension Host、RPC 或 `kilo serve` 互相调用。你配置自己的 `baseUrl`、模型和可选 API key，插件以 ghost text 提示补全。

**许可：** Apache-2.0 · **阶段：** 开源预览。

## 特性

- OpenAI-compatible HTTP endpoint，并支持高级鉴权头、路径与模板覆盖；适用于 Ollama、vLLM、兼容网关等
- OpenAI FIM、Qwen、DeepSeek、StarCoder 与 Pseudo-FIM Chat 模板；可按模型名自动选择
- 已保存 profile、模型列表、测试连接、测试模板/尝试全部模板
- 自适应防抖、取消、generation stale drop、缓存、skip、过滤和错误退避
- prefix/suffix 预算；默认不发送整个仓库或最近文件上下文
- JetBrains PasswordSafe / VS Code SecretStorage；导出不含密钥
- 共用 Settings + Logs Web UI（JetBrains JCEF / VS Code Webview），并提供宿主日志入口
- 设置 UI 支持 English、中文、日本語、한국어

当前已知宿主差异（VS Code 的 `.gitignore`、最近文件、注释/字符串检测尚未与 JetBrains 对齐）见 [实现状态](docs/IMPLEMENTATION_STATUS.md)。

## 快速安装

### JetBrains

要求 **IntelliJ Platform 2024.2+（build 242+）**。JCEF 是 Web 设置界面的运行条件；新 IDE 可能需要启用 **Web Browser (JCEF)**。

1. 从 GitHub Releases 下载 `auto-complete-*.zip`，或按下文自行构建。
2. IDE → **Settings/Preferences → Plugins → ⚙ → Install Plugin from Disk…**。
3. 选择 ZIP 并重启 IDE。
4. 打开右侧 **Auto Complete** 工具窗口，或使用 Tools 菜单中的 **Auto Complete** 动作。
5. 创建 profile，填写 Base URL、模型和可选 API key，然后先点 **Test connection**。

详细兼容性：[docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)。

### VS Code

要求 VS Code `^1.85.0`。

1. 获取 `auto-complete-*.vsix`，或执行本地打包。
2. Extensions → … → **Install from VSIX…**，安装后重载窗口。
3. 运行 **Auto Complete: Open Settings Panel**，创建 profile 并测试连接。
4. **Auto Complete: Show Logs** 会打开设置面板日志页和 OutputChannel。

详细说明：[hosts/vscode/README.zh.md](hosts/vscode/README.zh.md)。

## 本地构建与验证

需要 **JDK 21**、**Node.js 18+** 和 npm。根目录执行：

```bash
npm install
./gradlew :core:test :plugin:test
npm run test:js
npm run build:js
./gradlew :plugin:buildPlugin
```

JetBrains 开发沙箱：

```bash
./gradlew :plugin:runIde
```

打包两个宿主：

```bash
./scripts/package-local.sh
# 或 npm run package:local
```

| 产物 | 路径 |
|---|---|
| JetBrains ZIP | `plugin/build/distributions/auto-complete-*.zip` |
| VS Code VSIX | `hosts/vscode/dist-vsix/auto-complete-*.vsix` |

仅一端：`SKIP_JB=1 ./scripts/package-local.sh` 或 `SKIP_VSCODE=1 ./scripts/package-local.sh`。

> 打包脚本只显式运行 `:core:test`；发布前仍应运行上方完整的 JVM 与 JS 测试。

## 本地 endpoint 示例

```text
Base URL: http://127.0.0.1:11434/v1
Model:    qwen2.5-coder:7b
API key:  服务没有鉴权时留空
Template: AUTO（或按服务选择 QWEN / CHAT 等）
```

模型与 endpoint 对模板支持不同。使用 **Fetch models**、**Test connection** 和 **Test template**，不要只靠模型名称猜测请求格式。

## 隐私与安全

- API key 仅存入 IDE 安全存储，不会写入普通配置、导出或日志。
- 默认发送预算裁剪后的当前文件 prefix/suffix；文件路径默认发送，可关闭。
- 默认不记录 prompt 正文、不附带最近文件、不发送整个仓库。
- 远程 endpoint 始终由用户自行配置；请审查 provider 的数据策略。

安全报告见 [SECURITY.zh.md](SECURITY.zh.md)。

## 文档与贡献

- [文档索引](docs/README.md) / [English index](docs/README.en.md)
- [架构](docs/ARCHITECTURE.md) · [设置](docs/SETTINGS.md) · [Provider](docs/PROVIDERS.md) · [性能](docs/PERFORMANCE.md)
- [构建/发布](docs/RELEASE.md) · [实现状态](docs/IMPLEMENTATION_STATUS.md) · [来源与归属](docs/SOURCES.md)
- [贡献指南](CONTRIBUTING.zh.md) / [Contributing](CONTRIBUTING.md)
- [变更记录](CHANGELOG.md)

项目借鉴 Kilo Code 的经典补全行为，但为独立实现；详见 [NOTICE](NOTICE) 和 [来源文档](docs/SOURCES.md)。
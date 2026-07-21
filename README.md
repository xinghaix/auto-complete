# Auto Complete

[中文](README.md) · [English](README.en.md) · [文档目录](docs/README.md)

<p align="center"><img src="docs/assets/logo.svg" width="96" height="96" alt="Auto Complete logo"/></p>

**自己接模型服务** 的 AI 行内补全（ghost text）。支持 **JetBrains** 与 **VS Code**，两端各自独立运行，互不调用。

| 用在哪里 | 怎么装 |
|---|---|
| JetBrains（IDEA 等） | 安装 ZIP：`Install Plugin from Disk` |
| VS Code | 安装 VSIX：`Install from VSIX` |
| 设置界面 | 两端共用同一套 Web 设置页（JCEF / Webview） |

**许可：** Apache-2.0 · **阶段：** 开源预览（可从 GitHub Release 或本地打包安装）

## 能做什么

- 对接 OpenAI 兼容接口（Ollama、vLLM、各类网关等）
- 多种补全模板（FIM / Chat），可按模型名自动选择
- 多套「已保存配置」（endpoint、模型、超时等）
- 输入防抖、取消过时请求、缓存与错误退避
- 只发送光标前后有限代码；默认不上传整个仓库
- 密钥只放在 IDE 安全存储；导出不含密钥
- 设置界面支持中 / 英 / 日 / 韩

两端行为尽量一致；仅因 IDE 本身不同的差异见 [实现状态](docs/IMPLEMENTATION_STATUS.md)。

## 安装

### JetBrains

需要 **IntelliJ 平台 2024.2+**。设置页依赖 **JCEF**（新版本请启用 *Web Browser (JCEF)*）。

1. 从 [Releases](https://github.com/xinghaix/auto-complete/releases) 下载 `auto-complete-*.zip`，或按下文本地打包。
2. **设置 → 插件 → 齿轮 → 从磁盘安装插件…** → 选 ZIP → 重启。
3. 打开 **Auto Complete** 工具窗口。
4. 新建配置，填 Base URL、模型、可选 API Key → **测试连接**。

兼容说明：[docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)

### VS Code

需要 VS Code **1.85+**。

1. 下载 `auto-complete-*.vsix`，或本地打包。
2. 扩展视图 → **… → 从 VSIX 安装…** → 重载窗口。
3. 命令面板：**Auto Complete: Open Settings Panel**。
4. 同样先填配置并测试连接。

详见 [VS Code 说明](apps/vscode/extension/README.zh.md)。

## 本地构建

需要 **JDK 21**、**Node.js 18+**。

```bash
npm install
./gradlew :core:test :plugin:test
npm run test:js
npm run build:js
./scripts/package-local.sh
```

| 产物 | 路径 |
|---|---|
| JetBrains ZIP | `apps/jetbrains/plugin/build/distributions/auto-complete-*.zip` |
| VS Code VSIX | `apps/vscode/extension/dist-vsix/auto-complete-*.vsix` |

只打一端：`SKIP_JB=1` 或 `SKIP_VSCODE=1`。完整测试请用上面命令，打包脚本只跑部分测试。

开发用 JetBrains 沙箱：`./gradlew :plugin:runIde`

## 本地模型示例（Ollama）

```text
Base URL:  http://127.0.0.1:11434/v1
Model:     qwen2.5-coder:7b
API Key:   不需要鉴权时留空
模板:       AUTO（或按服务选 QWEN / CHAT 等）
```

用面板里的 **拉取模型 / 测试连接 / 测试模板** 确认服务是否匹配，不要只靠猜。

## 隐私

- 密钥只在 IDE 安全存储，不进普通配置、导出或日志。
- 默认只发当前文件光标附近的代码；路径默认可发，可关。
- 默认不记录完整提示词、不附带其它打开文件、不扫全仓库。
- 你填的远程地址由你负责；请确认服务商的数据处理方式。

安全报告：[SECURITY.zh.md](SECURITY.zh.md)

## 文档

- [文档目录](docs/README.md) · [架构](docs/ARCHITECTURE.md) · [设置](docs/SETTINGS.md)
- [连接与模板](docs/PROVIDERS.md) · [性能](docs/PERFORMANCE.md) · [构建发布](docs/RELEASE.md)
- [实现状态](docs/IMPLEMENTATION_STATUS.md) · [来源说明](docs/SOURCES.md)
- [贡献](CONTRIBUTING.zh.md) · [变更记录](CHANGELOG.md)

行为参考过 Kilo Code 的经典补全思路，实现为本仓库独立代码，见 [NOTICE](NOTICE)。

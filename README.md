# Auto Complete

[中文](README.md) · [English](README.en.md) · [文档目录](docs/README.md)

<p align="center"><img src="docs/assets/logo.svg" width="96" height="96" alt="Auto Complete logo"/></p>

**自己接模型服务** 的 AI 行内补全（ghost text）。支持 **JetBrains** 与 **VS Code**，两端各自独立运行，互不调用。

| 用在哪里 | 怎么装（推荐） |
|---|---|
| JetBrains（IDEA 等） | **[JetBrains Marketplace](https://plugins.jetbrains.com/plugin/33040-auto-complete)** |
| VS Code | GitHub Release / 本地 **VSIX** |
| 设置界面 | 两端共用 Web 设置页（JCEF / Webview） |

**许可：** Apache-2.0 · **阶段：** 开源预览

<!-- JetBrains Marketplace card (plugin id 33040). Renders on pages that load the widget script. -->
<p align="center">
  <a href="https://plugins.jetbrains.com/plugin/33040-auto-complete">
    <img alt="Get Auto Complete from JetBrains Marketplace" src="https://img.shields.io/badge/JetBrains%20Marketplace-Auto%20Complete-orange?style=for-the-badge&logo=jetbrains" />
  </a>
</p>

```html
<!-- Optional embed on a custom site (replace #yourelement with your element id) -->
<script src="https://plugins.jetbrains.com/assets/scripts/mp-widget.js"></script>
<script>
  MarketplaceWidget.setupMarketplaceWidget('card', 33040, "#yourelement");
</script>
```

## 能做什么

- 对接 OpenAI 兼容接口（Ollama、vLLM、DeepSeek / Mistral FIM、各类网关等）
- 多种补全模板（FIM / Chat），可按模型名自动选择
- 多套「已保存配置」（endpoint、模型、超时等）
- 输入防抖、取消过时请求、缓存与错误退避
- 只发送光标前后有限代码；默认不上传整个仓库
- 密钥只放在 IDE 安全存储；导出不含密钥
- 设置界面支持中 / 英 / 日 / 韩

两端差异见 [实现状态](docs/IMPLEMENTATION_STATUS.md)。

## 安装

### JetBrains（优先 Marketplace）

需要 **IntelliJ 平台 2024.2+**。设置页依赖 **JCEF**（新版本请启用 *Web Browser (JCEF)*）。

1. **设置 → 插件 → Marketplace**，搜索 **Auto Complete**，或打开  
   [plugins.jetbrains.com/plugin/33040-auto-complete](https://plugins.jetbrains.com/plugin/33040-auto-complete)  
2. 安装并重启 IDE。  
3. 打开右侧 **Auto Complete** 工具窗口。  
4. 新建配置，填 Base URL、模型、可选 API Key → **测试连接**。

备用（审核中 / 离线 / 自建版本）：从 [GitHub Releases](https://github.com/xinghaix/auto-complete/releases) 下载 **`*-signed.zip`**，**从磁盘安装插件**。发布产物为**已签名**包。

兼容说明：[docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)

### VS Code

需要 VS Code **1.85+**。

1. 从 [Releases](https://github.com/xinghaix/auto-complete/releases) 下载 `auto-complete-*.vsix`，或本地打包。  
2. 扩展视图 → **… → 从 VSIX 安装…** → 重载窗口。  
3. 命令面板：**Auto Complete: Open Settings Panel**。  
4. 填配置并测试连接。

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
| JetBrains 签名 ZIP | `apps/jetbrains/plugin/build/distributions/*-signed.zip`（需配置签名环境变量） |
| VS Code VSIX | `apps/vscode/extension/dist-vsix/auto-complete-*.vsix` |

JetBrains 发布包需签名密钥环境变量（见 [Marketplace 签名](docs/MARKETPLACE.md)）。只打一端：`SKIP_JB=1` 或 `SKIP_VSCODE=1`。

开发沙箱：`./gradlew :plugin:runIde`

## 推荐服务与本地示例

行内补全优先选支持 **FIM（中间填充）** 的接口：

| 服务 | Base URL 示例 | 模板 | 文档 |
|---|---|---|---|
| DeepSeek 云 FIM | `https://api.deepseek.com/beta` | `CODESTRAL_API` | [英文](https://api-docs.deepseek.com/guides/fim_completion/) · [中文](https://api-docs.deepseek.com/zh-cn/guides/fim_completion/) |
| Mistral Codestral FIM | `https://api.mistral.ai/v1` | `CODESTRAL_API` | [FIM API](https://docs.mistral.ai/api/endpoint/fim) |
| 本地 Ollama | `http://127.0.0.1:11434/v1` | `AUTO` / `QWEN`… | 见本地服务说明 |

完整说明：[连接与补全模板](docs/PROVIDERS.md)。

```text
# Ollama 示例
Base URL:  http://127.0.0.1:11434/v1
Model:     qwen2.5-coder:7b
API Key:   不需要鉴权时留空
模板:       AUTO
```

用面板 **拉取模型 / 测试连接 / 测试模板** 确认，不要只靠猜。

## 隐私

- 密钥只在 IDE 安全存储，不进普通配置、导出或日志。
- 默认只发当前文件光标附近的代码；路径默认可发，可关。
- 默认不记录完整提示词、不附带其它打开文件、不扫全仓库。
- 远程 endpoint 的数据处理策略由你自行确认。

安全报告：[SECURITY.zh.md](SECURITY.zh.md)

## 文档

- [文档目录](docs/README.md) · [架构](docs/ARCHITECTURE.md) · [设置](docs/SETTINGS.md)
- [连接与模板](docs/PROVIDERS.md) · [性能](docs/PERFORMANCE.md) · [构建发布](docs/RELEASE.md)
- [Marketplace 签名](docs/MARKETPLACE.md) · [实现状态](docs/IMPLEMENTATION_STATUS.md) · [来源](docs/SOURCES.md)
- [贡献](CONTRIBUTING.zh.md) · [变更记录](CHANGELOG.md)

行为参考过 Kilo Code 的经典补全思路，实现为本仓库独立代码，见 [NOTICE](NOTICE)。

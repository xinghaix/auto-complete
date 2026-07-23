# Auto Complete

[中文](README.md) · [English](README.en.md) · [完整文档](docs/README.md)

<p align="center"><img src="docs/assets/logo.svg" width="96" height="96" alt="Auto Complete logo"/></p>

> 自备模型端点的轻量 AI 内联代码补全，面向 JetBrains 与 VS Code。

Auto Complete 在编辑器中以 ghost text 提示下一段代码。你决定使用哪个 OpenAI-compatible 服务、哪个模型，以及是否提供 API key；项目不要求账号体系，也不依赖云端网关。

## 为什么使用

- **自己的端点**：适用于 Ollama、vLLM、兼容 OpenAI API 的服务和企业网关。
- **两个独立宿主**：JetBrains 与 VS Code 各自原生集成，不经过 Extension Host bridge、RPC 或 `kilo serve`。
- **隐私默认值保守**：请求只发送预算裁剪后的当前文件 prefix/suffix；默认不发送整个仓库、最近文件或 prompt 正文日志。
- **实用的补全管线**：模板自动选择、缓存、防抖、取消、错误退避与后处理都在本地宿主/引擎中完成。
- **可观察、可配置**：profile、模型探测、连接测试、模板测试及 Settings + Logs 面板均已提供。

## 立即安装

### JetBrains

要求 **IntelliJ Platform 2024.2+（build 242+）**。

1. 从 GitHub Releases 下载 `auto-complete-*.zip`。
2. IDE → **Settings/Preferences → Plugins → ⚙ → Install Plugin from Disk…**。
3. 选择 ZIP 后重启 IDE。
4. 打开 **Auto Complete** 工具窗口，创建 profile，填写 Base URL、模型和可选 API key。
5. 先执行 **Test connection**，再开始编码。

[JCEF 兼容性与故障排查 →](docs/COMPATIBILITY.md)

### VS Code

要求 VS Code `^1.85.0`。

1. 获取 `auto-complete-*.vsix`。
2. Extensions → … → **Install from VSIX…**，安装后重载窗口。
3. 运行 **Auto Complete: Open Settings Panel**，创建 profile 并测试连接。

[VS Code 使用说明 →](apps/vscode/extension/README.zh.md)

## 第一次配置

```text
Base URL: http://127.0.0.1:11434/v1
Model:    qwen2.5-coder:7b
API key:  服务无需鉴权时留空
Template: AUTO
```

模型名不等于请求协议。完成配置后使用 **Fetch models**、**Test connection**、**Test template** 验证服务端实际支持的接口与模板。

[端点、模型和模板配置 →](docs/PROVIDERS.md)

## 如何使用

1. 在 Settings 面板选择一个 profile，并先通过 **Test connection** 与 **Test template**。
2. 在受支持的代码文件中正常输入；开启自动触发后，候选会以 ghost text 出现在光标后。
3. 按 IDE 默认的 **Tab** 接受建议；继续输入或移动光标会取消过期建议。
4. 需要手动触发时：JetBrains 使用 **Tools → Auto Complete** 中的触发动作（可在 Keymap 配置快捷键）；VS Code 使用 **Auto Complete: Trigger Inline Completion**，默认 `Ctrl+Shift+Space`（macOS 为 `Cmd+Shift+Space`）。
5. 用 Settings + Logs 面板排查模型、模板、连接或请求失败；VS Code 的日志也会写入 **Auto Complete** OutputChannel。

建议先在一个普通文本/代码文件验证自动提示、手动触发、继续输入取消和 Tab 接受行为，再用于真实项目。

## 安全与数据边界

- 专用 API key 只保存在 JetBrains PasswordSafe 或 VS Code SecretStorage。
- endpoint URL 不允许包含账号或 token；常见凭据型额外请求头会被拒绝。
- 导出的设置不含 API key、鉴权模板或额外 Headers。
- 文件路径默认发送，但可关闭；最近文件上下文和 prompt 正文日志默认关闭。

[完整设置、存储与隐私说明 →](docs/SETTINGS.md) · [安全报告 →](SECURITY.zh.md)

## 宿主差异

JetBrains 与 VS Code 不是“一个宿主套壳另一个宿主”。二者共享行为契约，但各自实现编辑器适配层。当前 VS Code 的 `.gitignore`、最近文件上下文、注释/字符串识别仍未完全对齐 JetBrains。

[实现状态与已知差异 →](docs/IMPLEMENTATION_STATUS.md)

## 文档与贡献

- **使用产品**：[文档索引](docs/README.md) · [设置](docs/SETTINGS.md) · [Provider](docs/PROVIDERS.md) · [兼容性/排障](docs/COMPATIBILITY.md)
- **理解实现**：[架构](docs/ARCHITECTURE.md) · [性能](docs/PERFORMANCE.md) · [UiBridge 协议](packages/completion/contracts/bridge-protocol.zh.md)
- **构建、测试和打包**：[发布与开发说明](docs/RELEASE.md)
- **参与贡献**：[贡献指南](CONTRIBUTING.zh.md) · [变更记录](CHANGELOG.md)

**许可：** Apache-2.0。项目参考 Kilo Code 的经典补全行为，但为独立实现；详见 [NOTICE](NOTICE) 与 [来源和归属](docs/SOURCES.md)。

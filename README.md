# Auto Complete

[中文](README.md) · [English](README.en.md) · [使用指南](docs/GUIDE.md)

<p align="center"><img src="docs/assets/logo.svg" width="96" height="96" alt="Auto Complete logo"/></p>

**自己接模型服务** 的 AI 行内补全（ghost text）。支持 **JetBrains** 与 **VS Code**，两端独立运行。

| 宿主 | 安装（推荐） |
|---|---|
| JetBrains | **[Marketplace](https://plugins.jetbrains.com/plugin/33040-auto-complete)** |
| VS Code | GitHub Release / 本地 **VSIX** |

**许可：** Apache-2.0 · **阶段：** 开源预览

<p align="center">
  <a href="https://plugins.jetbrains.com/plugin/33040-auto-complete">
    <img alt="Get from JetBrains Marketplace" src="https://img.shields.io/jetbrains/plugin/v/33040-auto-complete.svg?label=JetBrains%20Marketplace&style=for-the-badge" />
  </a>
</p>

## 快速开始

1. 安装插件 / 扩展（上表）  
2. 打开设置（JetBrains：右侧 **Auto Complete**；VS Code：命令 **Open Settings Panel**）  
3. 新建配置 → Base URL、模型、可选 API Key → **测试连接**  
4. 写代码看 ghost text；手动触发默认 `Ctrl/Cmd+Shift+Space`  

```text
# 本地 Ollama 示例
Base URL:  http://127.0.0.1:11434/v1
Model:     qwen2.5-coder:7b
API Key:   无鉴权则留空
模板:       AUTO
```

推荐 FIM 服务（DeepSeek / Mistral / Ollama 等）、全部设置说明与排错 → **[使用指南](docs/GUIDE.md)**。

## 使用说明

- 开启自动触发后，正常输入会在光标后显示 ghost text；按 IDE 默认 **Tab** 接受。
- 继续输入或移动光标会取消过期建议；手动触发默认 `Ctrl/Cmd+Shift+Space`，可在 IDE Keymap 改键。
- Settings 面板可测试连接、模型和模板；VS Code 日志同时写入 **Auto Complete** OutputChannel。

## 能做什么

- OpenAI 兼容接口（Ollama、vLLM、云 FIM、网关等）
- FIM / Chat 模板；多套已保存配置
- 防抖、取消过时请求、本地缓存
- 默认只发光标附近代码；密钥只在 IDE 安全存储

## 隐私

密钥不进普通配置 / 导出 / 日志。默认不上传全仓库。安全报告：[SECURITY.zh.md](SECURITY.zh.md)。

## 文档

| 读者 | 链接 |
|---|---|
| 用户 | [使用指南](docs/GUIDE.md) |
| 维护者（构建 / 签名 / 发版） | [DEV.md](docs/DEV.md) |
| 贡献 | [CONTRIBUTING.zh.md](CONTRIBUTING.zh.md) · [CHANGELOG](CHANGELOG.md) |

行为参考过经典 Kilo Code 补全思路；本仓库为独立实现，见 [NOTICE](NOTICE)。

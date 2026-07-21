# Auto Complete（VS Code）

[English](README.md) · [完整文档](../../docs/README.md)

VS Code 宿主：TypeScript 补全引擎 + Webview 共用设置页。与 JetBrains **独立**，互不依赖。

## 安装

- VS Code **1.85+**
- 开发/打包：Node 18+

仓库根目录：

```bash
npm install
npm run package:vscode
# 或双端：./scripts/package-local.sh
```

产物：`apps/vscode/extension/dist-vsix/auto-complete-*.vsix`  
安装：**扩展 → … → 从 VSIX 安装…** → 重载。

本地调试：在扩展目录 F5，或 `npm run build -w auto-complete`。

## 使用

1. 命令：**Auto Complete: Open Settings Panel**
2. 新建配置 → Base URL、模型、可选 API Key  
3. **拉取模型 / 测试连接 / 测试模板**  
4. **Trigger Inline Completion** 手动触发（默认 Ctrl/Cmd+Shift+Space）  
5. **Toggle Enabled**、**Set API Key**、**Show Logs**  

密钥只进 **SecretStorage**。常用项会镜像到 `autoComplete.*` 原生设置；profile 请用设置面板管理。

## 与 JetBrains

功能尽量一致（含注释/字符串探测、gitignore、最近文件等）。仅入口 UI、密钥存储 API、snooze 等平台差异见 [实现状态](../../docs/IMPLEMENTATION_STATUS.md)。

## 日志与安全

日志在设置页 **日志** 标签，并同步 **Auto Complete** Output。默认不记完整提示词。密钥不要贴到 Issue 或导出文件。连接说明：[PROVIDERS.md](../../docs/PROVIDERS.md)。

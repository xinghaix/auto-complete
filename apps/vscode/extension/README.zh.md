# Auto Complete（VS Code）

[English](README.md) · [使用指南](../../../docs/GUIDE.md)

VS Code 宿主：TypeScript 补全引擎 + Webview 共用设置页。与 JetBrains **独立**。

JetBrains 用户请优先从 [Marketplace](https://plugins.jetbrains.com/plugin/33040-auto-complete) 安装。

## 安装

- VS Code **1.85+**
- 开发/打包：Node 18+

```bash
# 仓库根目录
npm install
npm run package:vscode
```

产物：`apps/vscode/extension/dist-vsix/auto-complete-*.vsix`  
安装：**扩展 → … → 从 VSIX 安装…** → 重载。

## 使用

1. 命令：**Auto Complete: Open Settings Panel**  
2. 新建配置 → Base URL、模型、可选 API Key  
3. **拉取模型 / 测试连接 / 测试模板**  
4. 手动触发默认 `Ctrl/Cmd+Shift+Space`  

密钥只进 **SecretStorage**。完整说明与排错见 [使用指南](../../../docs/GUIDE.md)。

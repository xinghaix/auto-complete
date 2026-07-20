# Auto Complete（VS Code）

[English](README.md) · [中文](README.zh.md) · [完整文档](../../docs/README.md)

VS Code 宿主使用 `packages/completion/engine-ts` 的 TypeScript 补全引擎，通过 Webview 嵌入共用的 `packages/settings/ui`。它与 JetBrains 宿主独立运行，不依赖 JetBrains 插件、Extension Host bridge 或 `kilo serve`。

## 要求与安装

- VS Code：`^1.85.0`
- 开发/打包：Node.js 18+ 与 npm

从仓库根目录打包：

```bash
npm install
npm run test:core-ts
npm run test:settings-ui
npm run build:js
npm run package:vscode
```

产物在 `apps/vscode/extension/dist-vsix/auto-complete-*.vsix`。安装：**Extensions → … → Install from VSIX…**，然后重载窗口。

一次打包 JetBrains ZIP + VSIX：

```bash
./scripts/package-local.sh
```

本地开发也可从 `apps/vscode/extension/` 打开项目后按 F5；构建入口为 `npm run build -w auto-complete`。

## 配置与命令

1. 执行 **Auto Complete: Open Settings Panel**。
2. 创建或选择 profile，填写 Base URL、模型和可选 API key。
3. 可用 **Fetch models**、**Test connection**、**Test template** 检查 endpoint。
4. 用 **Auto Complete: Trigger Inline Completion** 手动触发；默认快捷键为 Ctrl+Shift+Space（macOS Cmd+Shift+Space）。
5. **Auto Complete: Toggle Enabled** 开关补全；**Auto Complete: Set API Key** 写入 SecretStorage；**Auto Complete: Show Logs** 打开日志页与 OutputChannel。

密钥只进 VS Code **SecretStorage**，不进 `settings.json`、globalState 导出或 UiBridge snapshot。常用配置会镜像到 `autoComplete.*` 原生 Settings，其余 profile/global 偏好由扩展 `globalState` 保存；请使用设置面板管理 profile，而不是手工编辑内部存储。

## 当前宿主差异

- 当前 provider 将 `inComment` 与 `inString` 固定为 `false`，所以相关设置尚未做 VS Code 语义识别。
- workspace `.gitignore` 尚未注入 TypeScript engine；额外 ignore globs 才是可靠的路径过滤方式。
- 最近文件上下文尚未由 VS Code 宿主提供给 engine。

这些差异会影响隐私和建议触发范围，不能假设与 JetBrains 完全一致。完整状态见 [../../docs/IMPLEMENTATION_STATUS.md](../../docs/IMPLEMENTATION_STATUS.md)。

## 日志与安全

日志通过 Settings 面板 Logs tab 批量显示，并同步写入 **Auto Complete** OutputChannel。默认不记录 prompt 正文；API key 和鉴权头不得出现在日志、Issue 或导出的设置中。Provider 请求和路径规则见 [../../docs/PROVIDERS.md](../../docs/PROVIDERS.md)。
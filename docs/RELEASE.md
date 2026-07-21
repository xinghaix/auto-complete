# 构建、安装与发布

[English](RELEASE.en.md) · [文档目录](README.md)

开源预览：本地打 ZIP / VSIX 安装即可。Marketplace 上架与签名**不是**默认流程，CI 也不自动做。

## 需要什么

| 目标 | 要求 |
|---|---|
| 构建 JetBrains 插件 | JDK 21 + 能下 IntelliJ 依赖 |
| 构建设置页 / VS Code | Node 18+、npm |
| 运行 JetBrains | 平台 2024.2+，可用 JCEF |
| 运行 VS Code | 1.85+ |

macOS 若用 Homebrew JDK 21，可设置 `JAVA_HOME` 指向该 JDK（示例路径见本机安装说明，因系统而异）。

## 完整验证

仓库根目录：

```bash
npm install
./gradlew :core:test :plugin:test
npm run test:js
npm run build:js
./gradlew :plugin:buildPlugin
```

开发沙箱（≠ 从 ZIP 安装验收）：

```bash
./gradlew :plugin:runIde
```

## 本地双端打包

```bash
./scripts/package-local.sh
```

| 产物 | 安装 |
|---|---|
| `apps/jetbrains/plugin/build/distributions/auto-complete-*.zip` | 插件 → 从磁盘安装 |
| `apps/vscode/extension/dist-vsix/auto-complete-*.vsix` | 扩展 → 从 VSIX 安装 |

只打一端：`SKIP_JB=1` 或 `SKIP_VSCODE=1`。

> 打包脚本只强制跑 `:core:test`，**不能代替**上面的完整测试。

## 装上后快速检查

1. 建 profile，填 URL / 模型 / 密钥  
2. 测试连接；必要时测模板  
3. 写代码看 ghost text；继续输入应取消旧请求  
4. JetBrains 检查设置页；VS Code 检查面板与 Output  

## CI 做什么

- JDK 21：测试 + 打 JetBrains ZIP  
- Node 22：JS 测试 + 构建  
- 推送 `v*` 标签且测试通过：自动建同名 GitHub Release 并挂 ZIP/VSIX（已有同名 Release 则跳过，不覆盖）  
- **不做** Marketplace / 签名  

## 发版清单

1. 对齐 `pluginVersion` 与各 `package.json` 版本意图  
2. 更新 `CHANGELOG.md`  
3. 完整测试 + 双端打包  
4. 真机安装 smoke  
5. 打注释 tag `vX.Y.Z` 并推送（有明确发布意图时）  
6. 任何 token 只放 CI/环境变量，绝不进仓库  

未要求时不要 push / tag / 发布。

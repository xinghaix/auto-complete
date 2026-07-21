# 构建、安装与发布

[English](RELEASE.en.md) · [文档目录](README.md)

**用户安装优先：**

| 宿主 | 推荐 | 备用 |
|---|---|---|
| JetBrains | [Marketplace · Auto Complete](https://plugins.jetbrains.com/plugin/33040-auto-complete) | GitHub Release 的 **`*-signed.zip`**（从磁盘安装） |
| VS Code | GitHub Release / 本地 VSIX | 自行 `package:vscode` |

发布到 Marketplace 的 JetBrains 包必须是 **已签名** ZIP。CI 在配置了签名 Secrets 后**只上传 `*-signed.zip`**，不再分发未签名包。

## 需要什么

| 目标 | 要求 |
|---|---|
| 构建 JetBrains 插件 | **JDK 21** + 能下 IntelliJ 依赖 |
| 构建设置页 / VS Code | Node 18+、npm |
| 运行 JetBrains | 平台 2024.2+，可用 JCEF |
| 运行 VS Code | 1.85+ |
| 签名 / CI 发布 ZIP | Secrets：`CERTIFICATE_CHAIN`、`PRIVATE_KEY`（见 [MARKETPLACE.md](MARKETPLACE.md)） |

macOS 务必用 JDK 21（不要用 Homebrew 默认 openjdk 26）：

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
```

## 完整验证

```bash
npm install
./gradlew :core:test :plugin:test
npm run test:js
npm run build:js
```

开发沙箱：`./gradlew :plugin:runIde`（≠ 从 Marketplace / 签名 ZIP 安装验收）。

## 本地打包

```bash
# 推荐：带签名（与 CI / Marketplace 一致）
export CERTIFICATE_CHAIN="$(cat ~/.jb-plugin-signing/chain.crt)"
export PRIVATE_KEY="$(cat ~/.jb-plugin-signing/private.pem)"
./scripts/package-local.sh
```

| 产物 | 路径 |
|---|---|
| JetBrains **signed** ZIP | `apps/jetbrains/plugin/build/distributions/*-signed.zip` |
| VS Code VSIX | `apps/vscode/extension/dist-vsix/auto-complete-*.vsix` |

未设置签名环境变量时，`package-local.sh` 仍可打出**未签名** ZIP 供本机调试，但**不要**当作 Marketplace / 正式 Release 包。

只打一端：`SKIP_JB=1` 或 `SKIP_VSCODE=1`。打包脚本只强制部分测试，完整测试用上一节。

## 装上后快速检查

1. 建 profile，填 URL / 模型 / 密钥  
2. 测试连接；必要时测模板  
3. 写代码看 ghost text；继续输入应取消旧请求  
4. JetBrains 检查设置页；VS Code 检查面板与 Output  

## CI 做什么

| 场景 | 行为 |
|---|---|
| PR（无签名 Secrets） | JVM 测试；**不上传** JB ZIP artifact |
| main / tag（有 Secrets） | `buildPlugin` + **`signPlugin`**，只上传 `*-signed.zip` |
| Node job | 测试 + VSIX artifact |
| 推送 `v*` | GitHub Release 挂 **signed ZIP** + VSIX |
| `v*` + `PUBLISH_TOKEN` | 可选 `publishPlugin` 到 Marketplace |

签名与 Token 配置：[MARKETPLACE.md](MARKETPLACE.md)。

## 发版清单

1. 对齐 `pluginVersion` 与各 `package.json`  
2. 更新 `CHANGELOG.md`  
3. 完整测试；确认 GitHub Secrets 可签名  
4. 真机 smoke（优先装 Marketplace 或 signed ZIP）  
5. 打注释 tag `vX.Y.Z` 并推送  
6. 私钥 / Token 只放 Secrets，绝不进仓库  

未要求时不要 push / tag / 发布。

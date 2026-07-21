# 构建、安装与发布

[English](RELEASE.en.md) · [文档索引](README.md)

当前版本为开源预览：可本地构建并通过 **JetBrains Install Plugin from Disk** 或 **VS Code Install from VSIX** 安装。Marketplace 发布不是默认流程，也没有在 CI 自动执行。

## 前置条件

| 目标 | 要求 |
|---|---|
| JetBrains 插件 | JDK 21；可下载 IntelliJ Platform/Gradle 依赖的网络 |
| JS、设置 UI 与 VS Code 扩展 | Node.js 18+、npm |
| JetBrains 运行 | IntelliJ Platform 2024.2+（build 242+）；可用 JCEF |
| VS Code 运行 | VS Code `^1.85.0` |

macOS Homebrew 的 JDK 21 示例：

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
```

这只是示例。Linux/Windows 请设置为自己的 JDK 21 安装目录。

## 安装依赖与完整验证

从仓库根目录执行：

```bash
npm install
./gradlew :core:test :plugin:test
npm run test:js
npm run build:js
./gradlew :plugin:buildPlugin
```

上述顺序覆盖 Kotlin/JetBrains 测试、TypeScript/设置 UI 测试、JS 构建以及 JetBrains 分发包构建。生成的 JetBrains zip 在：

```text
apps/jetbrains/plugin/build/distributions/auto-complete-<version>.zip
```

本地开发 JetBrains：

```bash
./gradlew :plugin:runIde
```

该命令启动隔离 IDE 沙箱，不等同于从 zip 安装后的兼容性验收。

## 双端本地打包

推荐使用脚本构建可安装产物：

```bash
npm install              # 首次或依赖更新后
./scripts/package-local.sh
# 或 npm run package:local
```

脚本会构建共享 `settings-ui`，运行 `:core:test`，构建 JetBrains zip，再构建 `core-ts`、VS Code extension 并创建 VSIX。产物为：

| 产物 | 安装方式 |
|---|---|
| `apps/jetbrains/plugin/build/distributions/auto-complete-*.zip` | JetBrains：Settings/Preferences → Plugins → ⚙ → Install Plugin from Disk… → 重启 |
| `apps/vscode/extension/dist-vsix/auto-complete-*.vsix` | VS Code：Extensions → … → Install from VSIX… → 重载窗口 |

只构建一个宿主：

```bash
SKIP_JB=1 ./scripts/package-local.sh      # 仅 VS Code
SKIP_VSCODE=1 ./scripts/package-local.sh  # 仅 JetBrains
```

> 脚本用于打包，不替代完整验证：它当前只显式运行 `:core:test`，不会自动运行 `:plugin:test` 或 `npm run test:js`。发包前应执行上一节的完整命令。

## 初次配置与 smoke test

1. 在设置面板创建/选择 profile，填写 Base URL、模型和可选 API key。
2. 先执行 **Fetch models**（可选）与 **Test connection**。
3. 选择正确的 FIM/chat 模板，必要时 **Test template** 或 **Try all templates**。
4. 打开受支持的文本文件，检查自动 ghost text、手动触发、继续输入取消、Tab/IDE 默认接受行为和日志。
5. 在 JetBrains 2024.2 与较新的 IDE 上检查 JCEF 面板；较新版本需确保 **Web Browser (JCEF)** 可用。详情见 [COMPATIBILITY.md](COMPATIBILITY.md)。
6. 在 VS Code 检查设置面板、OutputChannel、SecretStorage key 和 VSIX 安装。

## CI

`.github/workflows/ci.yml` 有两个 job：

- **JVM (JDK 21)**：`./gradlew :core:test :plugin:test --stacktrace`、`./gradlew :plugin:buildPlugin --stacktrace`，并上传 zip artifact；
- **JS (Node 22)**：`npm install`、`npm run test:js`、`npm run build:js`。

CI 在 `main`/PR 上只构建和测试；推送 `v*` tag 时，在 JVM 和 JS job 成功后自动下载 ZIP/VSIX artifact 并创建 GitHub Release。若同一 tag 已有 release，workflow 会跳过发布，绝不覆盖或重复上传。Marketplace 与签名仍未自动化。

## 版本与发布清单

1. 更新 `gradle.properties` 的 `pluginVersion`，并保持 `apps/vscode/extension/package.json` 与根 Node workspace 版本意图一致。
2. 在 `CHANGELOG.md` 的 `[Unreleased]` 写入面向用户的变更。
3. 完整验证通过后运行双端打包。
4. 手动在目标 JetBrains/VS Code 版本安装产物并 smoke test。
5. 创建并推送带注释的 `v<version>` tag；CI 在测试通过后自动创建同名 GitHub Release 并附加 ZIP 与 VSIX。已有同名 release 时安全跳过发布。
6. 仅在明确请求时配置 Marketplace/signing token；token 只能来自环境或 CI secret，绝不进仓库。

建议 tag：

```bash
git tag -a v0.2.0 -m "Auto Complete 0.2.0"
```

没有用户明确要求时，不要 push、打 tag 或发布。
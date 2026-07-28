# 构建与发布（维护者）

[English](DEV.en.md) · [用户指南](GUIDE.md) · [贡献](../CONTRIBUTING.zh.md)

用户安装请走 [Marketplace](https://plugins.jetbrains.com/plugin/33040-auto-complete) 或 GitHub Release，不必读本页。

## 环境

| 目标 | 要求 |
|---|---|
| JetBrains 插件 | **JDK 21**（勿用 Homebrew 默认 openjdk 26） |
| 设置页 / VS Code | Node 18+、npm |
| 签名 / CI 分发 | Secrets：`CERTIFICATE_CHAIN`、`PRIVATE_KEY`（可选 `PRIVATE_KEY_PASSWORD`、`PUBLISH_TOKEN`） |

```bash
# macOS 示例
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
```

## 测试与本地打包

```bash
npm install
./gradlew :core:test :plugin:test
npm run test:js
npm run build:js
./scripts/package-local.sh   # 或 SKIP_JB=1 / SKIP_VSCODE=1
```

| 产物 | 路径 |
|---|---|
| JetBrains ZIP | `apps/jetbrains/plugin/build/distributions/`（有签名 env 时为 `*-signed.zip`） |
| VS Code VSIX | `apps/vscode/extension/dist-vsix/auto-complete-*.vsix` |

沙箱：`./gradlew :plugin:runIde`。`package-local.sh` 只强制部分测试，完整测试用上面命令。

## 签名与 Marketplace

插件页：https://plugins.jetbrains.com/plugin/33040-auto-complete · 数字 ID `33040` · 代码 id `io.autocomplete`

```bash
# 仓库外生成材料示例
mkdir -p ~/.jb-plugin-signing && cd ~/.jb-plugin-signing
openssl genrsa -out private.pem 4096
openssl req -new -x509 -key private.pem -out chain.crt -days 3650

export CERTIFICATE_CHAIN="$(cat ~/.jb-plugin-signing/chain.crt)"
export PRIVATE_KEY="$(cat ~/.jb-plugin-signing/private.pem)"
npm run build:settings-ui
./gradlew :plugin:buildPlugin :plugin:signPlugin
# → apps/jetbrains/plugin/build/distributions/auto-complete-*-signed.zip
```

| Secret | 用途 |
|---|---|
| `CERTIFICATE_CHAIN` / `PRIVATE_KEY` | 签名（CI 有则只上传 signed ZIP） |
| `PRIVATE_KEY_PASSWORD` | 可选 |
| `PUBLISH_TOKEN` | 可选 `publishPlugin` |

官网嵌入卡片（GitHub README **不能**跑脚本，请用 badge）：

```html
<script src="https://plugins.jetbrains.com/assets/scripts/mp-widget.js"></script>
<script>
  MarketplaceWidget.setupMarketplaceWidget('card', 33040, "#yourelement");
</script>
```

官方：[Plugin Signing](https://plugins.jetbrains.com/docs/intellij/plugin-signing.html) · [Publishing](https://plugins.jetbrains.com/docs/intellij/publishing-plugin.html)

## CI 与发版

| 场景 | 行为 |
|---|---|
| PR / main push | 测试与构建检查；不生成分发产物 |
| 指向 `main` 历史的注释 `v*` tag | `buildPlugin` + `signPlugin`，仅上传 `*-signed.zip`；打包 VSIX 并创建 GitHub Release |
| 合格 `v*` tag + `PUBLISH_TOKEN` | 可选 Marketplace API 发布 |
| 侧分支、轻量或未合入 main 的 `v*` tag | CI 失败；不打包、不创建 Release、不发布 Marketplace |

清单：对齐版本号 → 更新 `CHANGELOG.md` → 完整测试 → 将 release commit 合入并验证 `main` → smoke（Marketplace 或 signed ZIP）→ 从该提交创建注释 tag `vX.Y.Z`。CI 会验证 tag 的目标提交位于 `main` 历史中。私钥 / Token 只放 Secrets。

## 架构与目录（极简）

两个独立宿主 + 两套引擎 + 一套 Web 设置页；**不做** JB↔VS Code RPC / `kilo serve` / Agent / Next Edit。

```text
apps/jetbrains/plugin/     JB 宿主（Gradle :plugin）
apps/vscode/extension/     VS Code 宿主
packages/completion/
  engine-jvm/              Kotlin 引擎（:core）
  engine-ts/               TypeScript 引擎
  contracts/               契约、模板、UiBridge、fixtures
packages/settings/ui/      Vue 设置页
```

| | JetBrains | VS Code |
|---|---|---|
| 引擎 | Kotlin | TypeScript |
| 密钥 | PasswordSafe | SecretStorage |
| 设置 UI | JCEF 工具窗口 | Webview |
| 存盘 | `autoCompleteSettings.xml` | `globalState` |

补全热路径：触发 → 门控 / 缓存 / 防抖 / 取消 → 裁剪前后文 → HTTP → 过滤过期结果 → ghost text。默认只发光标附近代码。

**允许的平台差异：** 存盘格式、入口 chrome、密钥 API、JB snooze vs VS Code 开关命令。改设置 UI 必须双端检查（见 `AGENTS.md`）。

行为参考过 [Kilo Code](https://github.com/Kilo-Org/kilocode) 经典补全；本仓库独立重写，见 [NOTICE](../NOTICE)。协议细节：`packages/completion/contracts/bridge-protocol.zh.md`。

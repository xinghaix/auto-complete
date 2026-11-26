# 构建与发布（维护者）

[English](DEV.en.md) · [用户指南](GUIDE.md) · [贡献](../CONTRIBUTING.zh.md)

用户安装请走 [Marketplace](https://plugins.jetbrains.com/plugin/33040-auto-complete) 或 GitHub Release，不必读本页。

## 环境

| 目标 | 要求 |
|---|---|
| JetBrains 插件 | **JDK 21**（勿用 Homebrew 默认 openjdk 26；字节码目标 Java 21） |
| 设置页 / VS Code | **Node 20+**（CI 使用 Node 22）、npm |
| 签名 / CI 分发 | Secrets：`CERTIFICATE_CHAIN`、`PRIVATE_KEY`（可选 `PRIVATE_KEY_PASSWORD`、`PUBLISH_TOKEN`） |

```bash
# macOS 示例
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
```

## 测试、类型检查与本地打包

```bash
npm install
./gradlew :core:test :plugin:test
npm run typecheck:js
npm run test:js
npm run build:js
./gradlew :plugin:verifyPlugin
./scripts/package-local.sh   # 或 SKIP_JB=1 / SKIP_VSCODE=1
```

- `npm run typecheck:js` 依次构建 `@auto-complete/core-ts` 声明并运行全部 JS/TS 工作区类型检查（含 `settings-ui` 的 `vue-tsc`）。
- `npm run test:js` 在干净检出下自动按顺序执行 `test:core-ts` → `build:core-ts` → `build:settings-ui` → `test:settings-ui`（含跨清单版本一致测试 `releaseVersion.test.ts`）→ `test:vscode`，无需手动前置构建。
- `scripts/package-local.sh` 在构建 JetBrains ZIP 后会自动校验包完整性（确认已嵌入 `settings-ui/index.html` 与 `settings-ui/assets/*`、非占位 `<change-notes>`、且**不含** `kotlin-stdlib*.jar` 与 `annotations-*.jar`）。

| 产物 | 路径 |
|---|---|
| JetBrains ZIP | `apps/jetbrains/plugin/build/distributions/`（有签名 env 时为 `*-signed.zip`） |
| VS Code VSIX | `apps/vscode/extension/dist-vsix/auto-complete-*.vsix` |

沙箱：`./gradlew :plugin:runIde`。`package-local.sh` 只跑 `:core:test` 与 ZIP 完整性校验，完整验证请执行上面的全部命令。

## IntelliJ IDEA 2024.2–2026.2+ 兼容策略（方案 A）

本仓库采用**方案 A（单包长跨度兼容）**覆盖 IntelliJ Platform 2024.2 至 2026.2+：

- **单包基线与字节码**：保持 `pluginSinceBuild=242`、不设上限 `untilBuild`（`null`），使用 **JDK 21** 编译（classfile 65），可在 IntelliJ IDEA 2026.2 的 JBR 25 上向后兼容运行。
- **可选 JCEF 隔离**：`com.intellij.modules.jcef` 保持 `<depends optional="true">`，经 `SettingsJcefHost` 反射加载；当 JCEF 缺失或 2026.2+ 捆绑 *Web Browser (JCEF)* 被禁用时回退至纯 **Swing** 恢复页，并按 `baselineVersion` 给出准确引导。
- **零 `kotlin-stdlib` / `annotations` 打包**：`:plugin` 依赖 `:core` 时显式排除 `org.jetbrains.kotlin` 与 `org.jetbrains:annotations`，避免与 IDEA 2025/2026 内置 Kotlin 运行时发生 `LinkageError`；CI 与 `scripts/package-local.sh` 均强制拦截违规 JAR。
- **二进制稳定 API**：Inline Completion 与动作调用显式传全参/显式实现（消除 Kotlin `$default` 与 `DefaultConstructorMarker` 脆弱签名），使用公开 `ShowSettingsUtil` 按稳定 Configurable ID 打开 Keymap/Plugins，不在热路径或 EDT 阻塞 `PasswordSafe`。
- **CI 兼容矩阵门禁**：`verify-plugin` Job 在每次 PR、main 推送、发布 tag 及每周定时任务中运行 `./gradlew :plugin:verifyPlugin`（验证推荐 IDE 矩阵），及时捕获新版本/EAP 兼容变化。

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
| PR / main push | `jvm`（测试 + 未签名 ZIP 完整性门禁，不上传分发产物）、`js`（`typecheck:js` + `test:js` + `build:js`）、`verify-plugin`（`:plugin:verifyPlugin`） |
| 每周定时 (`schedule`) | 自动运行上述测试、类型检查与 `:plugin:verifyPlugin`，持续监控新版 IDEA / EAP 兼容性 |
| 指向 `main` 历史的注释 `v*` tag | 等待 `jvm` 与 `verify-plugin` 通过后执行 `buildPlugin` + `signPlugin` + 签名 ZIP 完整性校验，仅上传 `*-signed.zip`；打包 VSIX 并创建 GitHub Release |
| 合格 `v*` tag + `PUBLISH_TOKEN` | 可选 Marketplace API 发布（Node 22 + 相同 ZIP 完整性校验通过后执行 `publishPlugin`） |
| 侧分支、轻量或未合入 main 的 `v*` tag | CI 失败；不打包、不创建 Release、不发布 Marketplace |

清单：对齐全部清单版本号（由 `packages/settings/ui/src/releaseVersion.test.ts` 校验根 `package.json`、`gradle.properties`、各子包、`App.vue` 与 `CHANGELOG.md`）→ 更新 `CHANGELOG.md` → 完整测试与类型检查 → 将 release commit 合入并验证 `main` → smoke（Marketplace 或 signed ZIP）→ 从该提交创建注释 tag `vX.Y.Z`。CI 会验证 tag 的目标提交位于 `main` 历史中。私钥 / Token 只放 Secrets。

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
| 存盘 | `autoCompleteSettings.xml` (`RoamingType.DISABLED`) | `globalState` |
| 状态栏菜单 | `JBPopupFactory` 弹出菜单（含 Snooze） | `QuickPick` 菜单（含开关/强制刷新） |
| 代理 / TLS | IDE `HttpConfigurable` / `CertificateManager` | `http.proxy` / `http.proxyStrictSSL` (`proxyFetch`) |

补全热路径：触发 → 门控 / 缓存 / 防抖 / 取消 → 裁剪前后文 → HTTP（含行中流式早停）→ 过滤过期结果 → ghost text。默认只发光标附近代码。

**允许的平台差异：** 存盘格式、入口 chrome、密钥 API、代理/TLS 宿主集成（JB `HttpConfigurable`/`CertificateManager` vs VS Code `http.proxy`/`http.proxyStrictSSL`）、以及状态栏快捷菜单形态（JB `JBPopupFactory` + snooze vs VS Code `QuickPick` + 开关/强制刷新命令）。改设置 UI 必须双端检查（见 `AGENTS.md`）。

行为参考过 [Kilo Code](https://github.com/Kilo-Org/kilocode) 经典补全；本仓库独立重写，见 [NOTICE](../NOTICE)。协议细节：`packages/completion/contracts/bridge-protocol.zh.md`。

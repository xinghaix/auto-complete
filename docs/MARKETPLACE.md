# JetBrains Marketplace 签名与分发

[English](MARKETPLACE.en.md) · [文档目录](README.md)

**用户安装优先使用 Marketplace：**  
[plugins.jetbrains.com/plugin/33040-auto-complete](https://plugins.jetbrains.com/plugin/33040-auto-complete)

本页说明：签名材料、GitHub Secrets、CI **只产出 signed ZIP**，以及可选的 `publishPlugin`。私钥**不要**提交到 Git。

官方参考：

- [Plugin Signing](https://plugins.jetbrains.com/docs/intellij/plugin-signing.html)
- [Publishing a Plugin](https://plugins.jetbrains.com/docs/intellij/publishing-plugin.html)

## Marketplace 插件信息

| 项 | 值 |
|---|---|
| 插件页 | https://plugins.jetbrains.com/plugin/33040-auto-complete |
| 插件数字 ID | `33040`（用于官网卡片 widget） |
| 插件 id（代码） | `io.autocomplete` |
| 供应商 ID（示例） | 与你在 Marketplace 注册的 Vendor ID 一致（如 `xinghaix`） |

### 官网 / 文档嵌入卡片

```html
<script src="https://plugins.jetbrains.com/assets/scripts/mp-widget.js"></script>
<script>
  MarketplaceWidget.setupMarketplaceWidget('card', 33040, "#yourelement");
</script>
```

将 `#yourelement` 换成页面真实元素 id。GitHub README 无法跑该脚本，故使用 Marketplace 链接 + badge。

## 签名材料 → GitHub Secrets

| Secret 名 | 内容 |
|---|---|
| `CERTIFICATE_CHAIN` | 证书链 PEM 全文 |
| `PRIVATE_KEY` | 私钥 PEM 全文 |
| `PRIVATE_KEY_PASSWORD` | 可选 |
| `PUBLISH_TOKEN` | Marketplace 永久 Token（API 发布用，可选） |

本机生成示例（仓库外目录）：

```bash
mkdir -p ~/.jb-plugin-signing && cd ~/.jb-plugin-signing
openssl genrsa -out private.pem 4096
openssl req -new -x509 -key private.pem -out chain.crt -days 3650
```

把文件全文贴进 Secrets。离线备份。

## 本地签名（JDK 21）

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"

export CERTIFICATE_CHAIN="$(cat ~/.jb-plugin-signing/chain.crt)"
export PRIVATE_KEY="$(cat ~/.jb-plugin-signing/private.pem)"

npm run build:settings-ui
./gradlew :plugin:buildPlugin :plugin:signPlugin
```

产物（上传 / 分发用这个）：

```text
apps/jetbrains/plugin/build/distributions/auto-complete-*-signed.zip
```

## CI 策略（已配置）

| 场景 | 行为 |
|---|---|
| PR 无 Secrets | 只跑测试，**不上传**未签名 ZIP |
| main / tag 有 Secrets | `buildPlugin` + `signPlugin`，artifact **仅** `*-signed.zip` |
| GitHub Release (`v*`) | 只挂 **signed** ZIP + VSIX |
| `v*` + `PUBLISH_TOKEN` | 可选 `publishPlugin` |

**不再**把 unsigned `buildPlugin` ZIP 作为 CI / Release 分发物。

## 审核中 / 网页更新

- 审核期间用户可：Marketplace 页（通过后）或 Release 的 signed ZIP。  
- 网页手动更新版本：用 CI artifact 或本地 `signPlugin` 的 **`*-signed.zip`**。  
- 配置 `PUBLISH_TOKEN` 后可用 tag 触发 API 发布，减少手工上传。

## 安全

1. 私钥 / Token 只进 Secrets 或本机，禁止进 Git。  
2. 可为 publish job 加 GitHub Environment 审批。  
3. 泄露立即轮换证书与 Token。

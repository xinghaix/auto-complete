# JetBrains Marketplace signing & distribution

[中文](MARKETPLACE.md) · [Docs index](README.en.md)

**Preferred user install:**  
[plugins.jetbrains.com/plugin/33040-auto-complete](https://plugins.jetbrains.com/plugin/33040-auto-complete)

How to store signing material in **GitHub Secrets** and ship **signed ZIPs only**. Never commit private keys.

Official: [Plugin Signing](https://plugins.jetbrains.com/docs/intellij/plugin-signing.html) · [Publishing](https://plugins.jetbrains.com/docs/intellij/publishing-plugin.html)

## Plugin coordinates

| | |
|---|---|
| Marketplace page | https://plugins.jetbrains.com/plugin/33040-auto-complete |
| Numeric id | `33040` (Marketplace widget) |
| Plugin id in code | `io.autocomplete` |

### Embed card (custom sites)

```html
<script src="https://plugins.jetbrains.com/assets/scripts/mp-widget.js"></script>
<script>
  MarketplaceWidget.setupMarketplaceWidget('card', 33040, "#yourelement");
</script>
```

## Secrets

| Name | Content |
|---|---|
| `CERTIFICATE_CHAIN` | PEM chain |
| `PRIVATE_KEY` | PEM private key |
| `PRIVATE_KEY_PASSWORD` | optional |
| `PUBLISH_TOKEN` | Marketplace token (optional API publish) |

## Local sign (JDK 21)

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
export CERTIFICATE_CHAIN="$(cat ~/.jb-plugin-signing/chain.crt)"
export PRIVATE_KEY="$(cat ~/.jb-plugin-signing/private.pem)"
npm run build:settings-ui
./gradlew :plugin:buildPlugin :plugin:signPlugin
```

Ship: `apps/jetbrains/plugin/build/distributions/*-signed.zip`

## CI

PR without secrets: tests only, no unsigned ZIP artifact.  
main/tag with secrets: signed ZIP only.  
`v*` Release: signed ZIP + VSIX.  
Optional `publishPlugin` when `PUBLISH_TOKEN` is set.

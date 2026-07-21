# JetBrains 兼容性 / Compatibility

[中文](#最低版本) · [English](#minimum-version)

## 最低版本

| 项 | 值 |
|---|---|
| 最低 IDE | **IntelliJ 平台 2024.2+** |
| `since-build` | **242** |
| `until-build` | 不限制 |
| 编译 SDK | IC 2024.2.5 |

示例：IDEA 2024.2、2025.x、2026.x。

## 设置页与 JCEF

设置界面是 **Web（JCEF）**，没有 Swing 设置表单。

| 平台 | 说明 |
|---|---|
| 2024.2 | 平台里自带 JCEF |
| 较新版本 | 可能是独立 *Web Browser (JCEF)* 插件；本仓库对 `jcef` 模块是 **可选** 依赖 + 反射加载 |

请保持 JCEF / Web Browser 插件启用；Registry 不要关掉 `ide.browser.jcef.enabled`。

构建插件需要 **JDK 21**（用户装 IDE 不需要单独装 JDK）。

## 出问题怎么查

| 现象 | 建议 |
|---|---|
| 提示 JCEF unavailable | 启用 **Web Browser (JCEF)** 并重启 |
| 提示 JCEF disabled | 查 Registry / 无头环境 |
| 提示 settings-ui missing | 先 `npm run build:settings-ui` 再 `buildPlugin` |
| 侧栏打开但页面空白 | 换**重新打包**的 ZIP（旧包脚本加载方式不兼容） |

---

## Minimum version

| | |
|---|---|
| Minimum IDE | **IntelliJ Platform 2024.2+** |
| `since-build` | **242** |
| Compile SDK | IC-2024.2.5 |

## JCEF

Settings are **Web-only**. 2024.2 already has JCEF on the platform classpath; newer IDEs may ship it as the *Web Browser (JCEF)* plugin. This plugin uses an **optional** jcef module + reflective load so both old and new IDEs work.

Enable *Web Browser (JCEF)* if the panel cannot find JCEF. Build with **JDK 21**.

## Troubleshooting

| Symptom | Action |
|---|---|
| JCEF unavailable | Enable Web Browser (JCEF), restart |
| Blank settings page | Install a freshly packaged ZIP after `build:settings-ui` |
| settings-ui missing | Rebuild settings UI assets into the plugin |

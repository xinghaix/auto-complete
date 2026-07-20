# 兼容性 / Compatibility

[中文](#jetbrains-ide) · [English](#english)

## JetBrains IDE

### 最低版本（当前产品声明）

| 项 | 值 |
|----|-----|
| **最低 IDE** | **IntelliJ Platform 2024.2+** |
| **`since-build`** | **`242`**（`gradle.properties` → `pluginSinceBuild`） |
| **`until-build`** | 不限制（空） |
| 编译 / 测试 SDK | `platformVersion=2024.2.5`（IC） |

示例：IntelliJ IDEA **2024.2**、**2025.x**、**2026.x**（含 2026.2）。

### 设置 UI 与 JCEF（为何老版本也能用）

设置页是 **Web-only（JCEF）**，**没有** Swing 设置表单。  
2024.2 **也有** JCEF（类在平台 classpath），与 2026 把 JCEF 拆成独立插件并不矛盾。

| 平台 | JCEF 从哪来 | 本插件如何拿到 |
|------|-------------|----------------|
| **2024.2** | 内嵌在平台 jar（如 `app-client.jar`） | 不依赖 jcef 插件也能 `Class.forName(JBCefBrowser)` |
| **2025.3.1+** | 开始提供模块别名 `com.intellij.modules.jcef` | **可选**依赖，有则挂到插件 ClassLoader |
| **2026.2+** | 捆绑 *Web Browser (JCEF)* 插件 | 同上 optional 依赖；请保持该插件启用 |

实现要点（代码）：

1. `SettingsWebPanel` **不** import `com.intellij.ui.jcef.*`（避免类加载期解析失败）。  
2. `SettingsJcefHost` 运行时探测 `JBCefBrowser` 是否可达。  
3. 再 **反射** 加载 `SettingsJcefHostImpl`（内部才使用 JCEF API）。  
4. `plugin.xml`：`<depends optional="true" config-file="auto-complete-jcef.xml">com.intellij.modules.jcef</depends>`  
   - 老版本：模块不存在 → 插件仍加载，走平台 JCEF。  
   - 新版本：模块存在 → 作为父 ClassLoader，避免 `ClassNotFoundException`。

### 其它硬依赖

| 约束 | 说明 |
|------|------|
| **Inline Completion API** | `InlineCompletionProvider` 等；公开 API 在 2023.3–2024.x 已可用，故下限对齐 **2024.2** |
| **JBR + JCEF 启用** | 需 JetBrains Runtime；Registry 勿关闭 `ide.browser.jcef.enabled` |
| **JDK 21** | 仅本仓库 **构建** 需要，不是用户安装 IDE 的要求 |

### 与历史配置

| 时期 | `pluginSinceBuild` | 说明 |
|------|-------------------|------|
| 早期 | `242` | 对齐编译 SDK + Inline Completion |
| 一度上调 | `253` | 当时把 jcef 写成 **必选** 依赖，导致 2024.2 装不上 |
| **当前** | **`242`** | jcef 改为 **optional** + 反射加载，2024.2 与 2026 共用一套 Web 设置 |

### 运行时排查

| 现象 | 建议 |
|------|------|
| 设置页提示 JCEF unavailable（2026） | 启用插件 **Web Browser (JCEF)** 并重启 |
| 设置页提示 JCEF disabled | 检查 Registry / 无头环境 |
| 提示 settings-ui missing | `npm run build:settings-ui` 后重新 `buildPlugin` |
| **侧栏打开但页面空白** | 多为旧包仍用 ES `type=module` + `file://`（Chromium 会拦脚本）。请安装 **重新 build 后的 zip**（IIFE + `index.jcef.html` 注入 `cefQuery`）。查看 **Help → Show Log** 中 `settings-ui loadEnd` / `Prepared settings-ui` |

---

## English

### Minimum JetBrains version

| | |
|--|--|
| **Minimum IDE** | **IntelliJ Platform 2024.2+** |
| **`since-build`** | **`242`** |
| **`until-build`** | unrestricted |
| Compile SDK | `IC-2024.2.5` |

### JCEF on old vs new IDEs

- **2024.2 already includes JCEF** on the platform classpath.  
- **2025.3.1+ / 2026** may ship JCEF as module/plugin `com.intellij.modules.jcef`.  
- This plugin uses an **optional** dependency on that module plus **reflective** loading of `SettingsJcefHostImpl`, so:
  - 2024.2 loads with platform JCEF  
  - 2026 loads with the JCEF plugin on the classloader  

Settings remain **Web-only** (no Swing settings form). Enable *Web Browser (JCEF)* on newer IDEs if the settings panel cannot find JCEF classes.

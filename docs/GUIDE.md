# 使用指南

[English](GUIDE.en.md) · [项目主页](../README.md)

给**普通用户**：安装后如何配置、接模型、调行为。维护者请看 [DEV.md](DEV.md)。

## 1. 安装与打开设置

| 宿主 | 要求 | 安装 | 打开设置 |
|---|---|---|---|
| **JetBrains** | 平台 **2024.2+**；设置页需 **JCEF**（内嵌浏览器） | [Marketplace](https://plugins.jetbrains.com/plugin/33040-auto-complete)（优先）；或 Release 的 **`*-signed.zip`** → 从磁盘安装 | 右侧 **Auto Complete** 工具窗口 |
| **VS Code** | **1.85+** | Release / 本地 **VSIX** → 从 VSIX 安装 | 命令 **Auto Complete: Open Settings Panel** |

JetBrains 设置 / 日志为 **JCEF Web 面板**（`com.intellij.modules.jcef` 为**可选**依赖，以便兼容 2024.2 平台内置 JCEF 与 2026 独立插件）。

- **2024.2–2025.x**：JCEF 随官方 IDE / JetBrains Runtime 提供，一般无需单独装插件。请勿用去掉 JCEF 的普通 OpenJDK 启动 IDE。
- **2026+**：若设置页打不开，到 **设置 → 插件** 启用捆绑的 *Web Browser (JCEF)*，然后**完全重启** IDE。
- **任何版本**：查找操作 → Registry…，保持 `ide.browser.jcef.enabled` 勾选。

若 JCEF 不可用，工具窗口会显示 **Swing 恢复页**（不依赖 JCEF），含缺失项诊断与步骤；行内补全在已有配置时可继续工作。

## 2. 第一次配置（约 1 分钟）

1. **新建配置**（profile）  
2. 填 **Base URL**、**模型**；需要鉴权时填 **API Key**（只存在 IDE 安全存储）  
3. 选 **模板**（不懂就 `AUTO`）  
4. 点 **测试连接**；不通再 **测试模板 / 尝试全部**  

```text
# 本地 Ollama 示例
Base URL:  http://127.0.0.1:11434/v1
Model:     qwen2.5-coder:7b
API Key:   无鉴权则留空
模板:       AUTO
```

## 3. 推荐服务（优先真 FIM）

行内补全效果最好时，服务端支持 **FIM（中间填充）**：同时收光标前、后代码。只有 Chat 时用模板 `CHAT`，质量通常弱于真 FIM。

| 服务 | Base URL 示例 | 模板 | 说明 |
|---|---|---|---|
| DeepSeek 云 FIM | `https://api.deepseek.com/beta` | `CODESTRAL_API` | 官方 FIM 用 **beta** 根，不是普通 Chat 的 `/v1`。[文档](https://api-docs.deepseek.com/guides/fim_completion/) |
| Mistral Codestral | `https://api.mistral.ai/v1` | `CODESTRAL_API` | 默认路径 `/fim/completions`。[FIM API](https://docs.mistral.ai/api/endpoint/fim) |
| 本地 Ollama | `http://127.0.0.1:11434/v1` | `AUTO` / `QWEN`… | 是否真 FIM 取决于模型；用测试模板确认 |
| 其它 OpenAI 兼容网关 | 你的根地址（常带 `/v1`） | 先 `AUTO` | 不通再「尝试全部」 |

**注意：** 模板名 `DEEPSEEK` 是自建 token 式 FIM（常见 `/completions`），**不等于** DeepSeek 云 Beta 的 `prompt`+`suffix`；云 FIM 请用 `CODESTRAL_API`。

密钥**只填设置页**，不要写进文档、导出或 Issue。

导出会移除 API key 状态、鉴权模板和额外 Headers；导入旧文件时同样会剥离这些字段。额外 Headers 仅用于非敏感路由元数据，常见凭据头名会被拒绝。

## 4. 补全模板

| 模板 | 常见用途 | 默认路径 |
|---|---|---|
| `CODESTRAL_API` | Mistral / DeepSeek 云等 `prompt`+`suffix` | `/fim/completions` |
| `QWEN` / `DEEPSEEK` / `STARCODER` | 各类 token 式 FIM | `/completions` |
| `CHAT` | 仅 chat 的服务 | `/chat/completions` |
| `AUTO` | 按模型名猜测，猜不到用 CHAT | 自动 |

路径相对 Base URL；高级里可改 `fimPath` / `chatPath` / `completionsPath`。默认约 128 token、温度 0、补全超时 3 秒。探测超时默认 15 秒。

面板探测一律 **设置页 → 宿主 → 引擎**（网页不直接请求你的服务）。结果：`SUCCESS` 有文本；`EMPTY` 通了无建议；`FAILED` 失败。

## 5. 常用设置（白话）

### 全局

| 设置 | 默认 | 说明 |
|---|---:|---|
| 启用 | 开 | 总开关 |
| 自动触发 | 开 | 边输入边请求；关了仍可**手动触发** |
| 注释 / 字符串中补全 | 开 | 轻量启发式，非完整解析 |
| 行中仅首行 | 开 | 光标在行中时只显示首行建议 |
| 发送文件路径 | 开 | 是否把路径放进 prompt |
| 遵循 .gitignore / 忽略规则 | 开 | 跳过无关路径 |
| 禁用语言 | 空 | 如 `markdown, json` |
| 显示状态栏 | 开 | — |
| 面板主题 / 语言 | 自动 | 只改设置页，不改 IDE 语言 |

**手动触发快捷键**（默认 `Ctrl/Cmd+Shift+Space`）由 IDE Keymap 管理。「补全行为」页的 **在键盘映射中配置…** 会跳转到宿主快捷键 UI。

JetBrains 另有 snooze（暂停一段时间）；VS Code 多用开关命令。

### 已保存配置（profile）

一套连接 = 一个 profile（Base URL、模型、模板、超时、路径覆盖等）。新建是**空白**，不复制当前表单。导入设置后要**重新填密钥**。

### 性能相关（默认够用）

防抖 150 / 300 / 1000 ms；前后缀 8000 / 2000 字符；并发 1；文件 >512KB 跳过；最近打开文件上下文**默认关**（开了会多发代码）。

### 日志

级别、缓冲条数；完整 prompt 日志默认关（敏感）；401/403 可通知。密钥与鉴权头不进日志。

## 6. 隐私

- 密钥只在 IDE 安全存储（PasswordSafe / SecretStorage），不进普通配置、导出、快照、日志。  
- 默认只发当前文件光标附近代码；路径可关；不默认全仓库 / 最近文件。  
- 远程 endpoint 的数据处理策略由你自行确认。  

安全报告：[SECURITY.zh.md](../SECURITY.zh.md)

## 7. 出问题

| 现象 | 建议 |
|---|---|
| 无补全 | 总开关 / 自动触发；是否 snooze；语言是否禁用；文件是否过大或被 ignore |
| 连接失败 | Base URL 是否带对前缀；模板是否匹配；密钥与鉴权头；看日志里的 URL 与状态码 |
| 401 / 403 | 密钥与鉴权；云服务是否用对 base（如 DeepSeek beta） |
| 通了无建议 | 结果 `EMPTY`：换模板或确认模型真支持 FIM |
| JetBrains 设置页空白 / 恢复页 | 按面板步骤：2026+ 启用 *Web Browser (JCEF)* 并重启；2024.2 用带 JCEF 的 JBR；检查 Registry `ide.browser.jcef.enabled`；仍不行则换新 ZIP |
| 继续输入后旧建议闪回 | 应自动取消；若仍出现请看日志并开 Issue |

维护者 / 架构摘要：[DEV.md](DEV.md)

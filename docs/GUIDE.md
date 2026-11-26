# 使用指南

[English](GUIDE.en.md) · [项目主页](../README.md)

给**普通用户**：安装后如何配置、接模型、调行为。维护者请看 [DEV.md](DEV.md)。

## 1. 安装与打开设置

| 宿主 | 要求 | 安装 | 打开设置 |
|---|---|---|---|
| **JetBrains** | 平台 **2024.2–2026.2+**；设置页需 **JCEF**（内嵌浏览器） | [Marketplace](https://plugins.jetbrains.com/plugin/33040-auto-complete)（优先）；或 Release 的 **`*-signed.zip`** → 从磁盘安装 | 右侧 **Auto Complete** 工具窗口 |
| **VS Code** | **1.85+** | Release / 本地 **VSIX** → 从 VSIX 安装 | 命令 **Auto Complete: Open Settings Panel** |

JetBrains 设置 / 日志为 **JCEF Web 面板**（`com.intellij.modules.jcef` 为**可选**依赖，单包同时兼容 2024.2–2025.x 平台内置 JCEF 与 2026.2+ 独立捆绑插件）。

- **2024.2–2025.x**：JCEF 随官方 IDE / JetBrains Runtime 提供，一般无需单独装插件。请勿用去掉 JCEF 的普通 OpenJDK 启动 IDE。
- **2026.2+**：*Web Browser (JCEF)* 拆分为独立捆绑插件。若设置页无法打开或显示恢复页，打开 **设置 → 插件**（或点击恢复页的打开插件按钮）启用捆绑的 *Web Browser (JCEF)*，然后**完全重启** IDE。
- **任何版本**：查找操作 → Registry…，保持 `ide.browser.jcef.enabled` 勾选。

若 JCEF 不可用，工具窗口会显示 **Swing 恢复页**（不依赖 JCEF），提供按 IDE 版本区分的诊断与修复步骤；行内补全在已有配置时可继续工作。

## 2. 第一次配置（约 1 分钟）

1. **新建配置**（profile），或直接点击 **快速预设**（Ollama 本地 / DeepSeek Beta FIM / Mistral Codestral / vLLM / LM Studio）一键填充 Base URL、模板与默认路径（不会写入密钥）  
2. 核对 **Base URL**、**模型**（可点拉取模型并搜索过滤）  
3. 需要鉴权时输入 **API Key**，并点击 **保存密钥**（或按 `Enter`）写入 IDE 安全存储；徽章会立即更新为已设置  
4. 选 **模板**（不确定选 `AUTO`），点 **测试连接**；需要验证 FIM 格式再点 **测试模板** 或 **尝试全部**（探测完成后可**一键应用推荐模板**）  

```text
# 本地 Ollama 示例
Base URL:  http://127.0.0.1:11434/v1
Model:     qwen2.5-coder:7b
API Key:   无鉴权则留空
模板:       AUTO
```

## 3. 推荐服务与快速预设（优先真 FIM）

行内补全效果最好时，服务端支持 **FIM（中间填充）**：同时接收光标前、后代码。只有 Chat 时用模板 `CHAT`，质量通常弱于真 FIM。

| 预设 / 服务 | Base URL 示例 | 模板 | 说明 |
|---|---|---|---|
| **DeepSeek Beta FIM** | `https://api.deepseek.com/beta` | `CODESTRAL_API` | 官方 FIM 用 **beta** 根，不是普通 Chat 的 `/v1`；留空 `fimPath` 时自动解析为 `/completions`。[文档](https://api-docs.deepseek.com/guides/fim_completion/) |
| **Mistral Codestral** | `https://codestral.mistral.ai/v1` | `CODESTRAL_API` | 默认路径 `/fim/completions`（亦支持 `https://api.mistral.ai/v1`）。[FIM API](https://docs.mistral.ai/api/endpoint/fim) |
| **Ollama 本地** | `http://127.0.0.1:11434/v1` | `AUTO` / `QWEN` / `CODELLAMA`… | 是否真 FIM 取决于模型；用测试模板确认 |
| **vLLM / LM Studio** | `http://127.0.0.1:8000/v1` | `AUTO` | 本地 OpenAI 兼容服务；不通时用「尝试全部」 |

**注意：** 模板名 `DEEPSEEK` 是自建 token 式 FIM（常见 `/completions`），**不等于** DeepSeek 云 Beta 的 `prompt`+`suffix`；云 FIM 请用 `CODESTRAL_API`（`https://api.deepseek.com/beta` 会自动解析 `/completions`）。

密钥**只填设置页并通过「保存密钥」保存**，不要写进文档、导出或 Issue。

导出会移除 API key 状态、鉴权模板和额外 Headers；导入时同样会剥离这些字段、重新生成配置 UUID 且绝不沿用本地旧密钥。`authHeaderTemplate` 非空时必须包含 `${apiKey}` 占位符；额外 Headers 仅用于非敏感路由元数据，常见凭据头名会被拒绝。

## 4. 补全模板与高级选项

| 模板 | 常见用途 | 默认路径 |
|---|---|---|
| `CODESTRAL_API` | Mistral / DeepSeek 云等 `prompt`+`suffix` | `/fim/completions`（DeepSeek `/beta` 自动解析为 `/completions`） |
| `QWEN` / `DEEPSEEK` / `STARCODER` | 各类 token 式 FIM | `/completions` |
| `CODELLAMA` | CodeLlama 原生 `<PRE>/<SUF>/<MID>` token 式 FIM | `/completions` |
| `CHAT` | 仅 chat 的服务 | `/chat/completions` |
| `AUTO` | 按模型名猜测，猜不到用 CHAT | 自动 |

- 路径相对 Base URL 拼接（自动保留 URL query 参数）；高级展开里可自定义 `fimPath` / `chatPath` / `completionsPath`。
- 高级里还支持 **`extraBodyJson`**（合并进请求体的 JSON 对象，用于服务端特定采样参数）与 **`stopSequences`**（按配置追加自定义停止词）。
- 默认约 128 token、温度 0、补全超时 3 秒、探测超时 15 秒。
- **流式早停**：开启流式响应且处于行中（`firstLineOnlyWhenMidLine` 生效）时，收到首个非空行换行符即提前停止流并返回，显著降低行中补全延迟。
- 面板探测一律 **设置页 → 宿主 → 引擎**（网页不直接请求你的服务）。结果：`SUCCESS` 有文本；`EMPTY` 通了无建议；`FAILED` 失败；**尝试全部**会给出推荐模板并支持一键应用。

## 5. 常用设置、状态栏与日志统计

### 全局

| 设置 | 默认 | 说明 |
|---|---:|---|
| 启用 | 开 | 总开关 |
| 自动触发 | 开 | 边输入边请求；关了仍可**手动触发** |
| 注释 / 字符串中补全 | 开 | 轻量启发式，非完整解析 |
| 行中仅首行 | 开 | 光标在行中时只显示首行建议（流式下可早停） |
| 发送文件路径 | 开 | 是否把路径放进 prompt |
| 遵循 .gitignore / 忽略规则 | 开 | 跳过无关路径（同样过滤最近文件上下文） |
| 禁用语言 | 空 | 如 `markdown, json` |
| 显示状态栏 | 开 | 关闭后即时隐藏 |
| 面板主题 / 语言 | 自动 | 只改设置页，自动跟随亮/暗/高对比度与 IDE 语言 |

**手动触发快捷键**（默认 `Ctrl/Cmd+Shift+Space`）由 IDE Keymap 管理。「补全行为」页的 **在键盘映射中配置…** 会跳转到宿主快捷键 UI。

### 状态栏快捷菜单

点击状态栏图标可打开快捷操作菜单：

- **JetBrains**：弹出菜单支持切换已保存配置、启停总开关、暂停补全（Snooze 15 分钟 / 30 分钟 / 1 小时 / 恢复）、禁用或启用当前文件语言、打开设置/日志、**清空缓存并重置退避**。
- **VS Code**：`QuickPick` 菜单支持切换已保存配置、启停总开关、禁用或启用当前文件语言、手动触发 / 强制刷新补全、打开设置/日志、**清空缓存并重置退避**。

### 已保存配置（profile）

一套连接 = 一个 profile（Base URL、模型、模板、超时、路径覆盖、`extraBodyJson`、`stopSequences` 等）。新建默认**空白**（或通过快速预设填充）。导入设置后需**重新输入并保存密钥**。

### 性能相关（默认够用）

防抖 150 / 300 / 1000 ms；前后缀 8000 / 2000 字符；并发 1；文件 >512KB 跳过；最近打开文件上下文**默认关**（开启后也会遵循 `.gitignore`、忽略规则、文件大小与路径开关）。

### 日志与本地会话统计

- **日志页**：支持级别过滤、关键字搜索、自动滚底、复制（经宿主剪贴板桥接）与清空；完整 prompt 日志默认关（敏感）；401/403 可通知。密钥、鉴权头与 URL query token 均会脱敏。
- **本地会话统计**：仅保存在当前 IDE 内存（**零远程上报**），展示请求数、缓存命中、已采纳、已取消、失败数、P50/P95 延迟、当前防抖与退避状态。
- **清空缓存并重置退避**：一键清空建议历史与 Prompt LRU 缓存并解除错误退避（修改配置或 API Key 时也会自动重置 401/403 退避）。

## 6. 隐私

- 密钥只在 IDE 安全存储（PasswordSafe / SecretStorage），不进普通配置、Settings Sync、导出、快照或日志。  
- 默认只发当前文件光标附近代码；路径可关；不默认全仓库 / 最近文件。  
- 远程 endpoint 的数据处理策略由你自行确认。  

安全报告：[SECURITY.zh.md](../SECURITY.zh.md)

## 7. 出问题

| 现象 | 建议 |
|---|---|
| 无补全 | 检查总开关 / 自动触发 / snooze / 退避状态；语言是否禁用；文件是否过大或被 ignore |
| 连接失败 | 检查 Base URL 与模板匹配（或使用快速预设 / 尝试全部）；检查密钥与鉴权头；看日志里的 URL 与状态码 |
| 401 / 403 | 核对密钥并用「保存密钥」更新；确认云服务 Base URL（如 DeepSeek `/beta`）；保存正确配置或点「清空缓存并重置退避」即可立即恢复 |
| 通了无建议 | 结果 `EMPTY`：换模板（如 `CODESTRAL_API` / `QWEN` / `CODELLAMA`）或确认模型真支持 FIM |
| JetBrains 设置页空白 / 恢复页 | 按恢复页步骤：2026.2+ 在 **设置 → 插件** 启用 *Web Browser (JCEF)* 并重启；2024.2–2025.x 用带 JCEF 的 JBR；检查 Registry `ide.browser.jcef.enabled` |
| 继续输入后旧建议闪回 | 应自动取消；若仍出现请看日志并开 Issue |

维护者 / 架构摘要：[DEV.md](DEV.md)

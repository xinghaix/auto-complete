# Settings

所有设置以“补全热路径友好 + 配置心智简单”为原则。  
密钥不进明文 state。

## 1. General

| Key | Type | Default | Description |
|---|---|---|---|
| `enabled` | bool | `true` | 总开关 |
| `autoTrigger` | bool | `true` | 输入自动触发 |
| `manualShortcut` | string | `Ctrl+Shift+Space` / Mac `Cmd+Shift+Space` | 手动触发 |
| `snoozeMinutes` | int | `0` | `0` 表示未 snooze；>0 表示静音分钟数 |
| `showStatusBar` | bool | `true` | 状态栏组件 |
| `uiTheme` | enum | `auto` | 设置面板主题：`auto`（跟随 IDE）/ `light`（白色）/ `dark`（暗黑）；不影响 IDE 本身 Look and Feel |

对应 Kilo v5：`ghostServiceSettings.enableAutoTrigger` 等。  
本项目不再使用 `ghostServiceSettings` 命名。

## 2. Provider profiles（已保存配置）

| Key | Type | Default | Description |
|---|---|---|---|
| `profiles` | list | 自动迁移 | 命名连接配置列表 |
| `activeProfileId` | string | 首个 profile | 当前生效配置 |

- 设置页顶部可选历史配置 / **新建** / **删除**
- **新建** = 空白连接（不复制当前表单）；默认名「新配置」，重名则 `新配置 2`…
- **改名** = 直接编辑「已保存配置」下拉框文字（回车/失焦提交）；与其它配置重名时自动 `名称 2`、`名称 3`…
- **删除** 二次确认；允许删光全部配置。删光后下拉显示「（无）」，连接字段禁用，可再点新建
- 有配置：下拉可编辑改名、删除可用，连接字段可编辑；无配置：仅「新建」可用，全局行为设置仍可改并应用
- 切换配置会先把当前表单写回上一份，再加载目标配置
- **应用** 把表单写入当前配置；API Key 按 profile 隔离存 PasswordSafe（`apiKey:{id}`）
- 旧版扁平设置首次加载时迁移为一条配置（仅当仍有 baseUrl/model 或 legacy key）

## 2.1 Provider fields（每条配置）

| Key | Type | Default | Description |
|---|---|---|---|
| `provider` | enum | `openai-compatible` | UI：`openai-compatible` / `custom`（历史 `mistral-fim` 读入时归一为 openai-compatible） |
| `baseUrl` | string | `http://127.0.0.1:11434/v1` | 服务根路径 |
| `apiKey` | secret | empty | PasswordSafe；允许空（本地无鉴权） |
| `model` | string | `qwen2.5-coder:7b` | 模型名 |
| `authHeaderTemplate` | string | `Authorization: Bearer ${apiKey}` | 空 key 时可不发 Authorization |
| `extraHeadersJson` | string | `{}` | 额外 header JSON |
| `fimPath` | string | auto | 覆盖 FIM path；空则按 provider 默认 |
| `chatPath` | string | `/chat/completions` | chat 模式 path |
| `requestStyle` | enum | `AUTO` | 兼容字段；新配置以 `promptTemplate` 为准 |
| `promptTemplate` | enum | `AUTO` | `AUTO` / `CODESTRAL_API` / `QWEN` / `DEEPSEEK` / `STARCODER` / `CHAT` |
| `completionsPath` | string | auto | token 型 FIM（Qwen/DeepSeek/StarCoder）的 `/completions` 覆盖；空则 `/completions` |
| `temperature` | double | `0.0` | 代码补全宜低 |
| `maxTokens` | int | `128` | 越小越快 |
| `timeoutMs` | int | `3000` | 内联补全硬超时（ms）；ghost text 路径，宜短 |
| `settingsTimeoutMs` | int | `15000` | 设置页探测硬超时（测试连接 / 拉模型 / 试模板）；**必须有限** |
| `stream` | bool | `false` | 实验：流式首 token |

### Provider 默认 path

| provider | 默认 path |
|---|---|
| `openai-compatible` | `/chat/completions`（或兼容 completions） |
| `mistral-fim` | `/v1/fim/completions` 或 `/fim/completions`（实现时以可配置为准） |
| `custom` | 用户必填 |

### Test Connection

设置页提供按钮：

- 发送最小 FIM/chat 探测请求
- 展示：HTTP status、latency、截断后的响应预览
- 失败时写 log，并在设置页显示错误摘要

### 模型列表与请求格式测试

- 填写 `baseUrl` / `apiKey` 后，可通过 `GET {baseUrl}/models` 拉取 OpenAI-compatible 模型列表
- 若服务根路径未包含 `/v1`，客户端会在 `/models` 不存在时尝试 `/v1/models`
- 模型框为可编辑下拉框：既可选择拉取到的模型，也可手动填写
- 设置页只展示 `FIM` 和 `CHAT` 两种请求格式；历史 `AUTO` 配置继续兼容，但不再显示
- 设置页只显示一个“请求路径”输入框：选择 `FIM` 时编辑 `fimPath`，选择 `CHAT` 时编辑 `chatPath`，切换格式不会丢失另一种路径
- “测试格式”会使用当前模型实际发送最小补全请求，并分别提示成功、空响应或失败原因
- 模型拉取、连接测试和格式测试结果都显示在设置页内，不使用 IDE 顶层模态框
- 测试结果使用状态卡片区分处理中、成功、警告和失败，错误详情仍可选择复制
- HTTP 失败结果包含请求方法、完整 URL、状态码和截断后的响应内容，便于定位路径配置问题
- 模型列表 / 测试连接 / 模板探测使用 `settingsTimeoutMs` 外层硬超时；补全热路径使用 `timeoutMs`
- HTTP 客户端使用 IDE `HTTP Proxy` + 信任库（`JdkProxyProvider` / `CertificateManager`），与内置 AI 能力走同一代理通道
- 即使代理、DNS 或握手异常，也会在对应硬超时后恢复按钮并显示错误（不会一直停在「正在处理」）

## 3. Behavior（何时/何处补全）

| Key | Type | Default | Description |
|---|---|---|---|
| `enableInComments` | bool | `true` | 注释中是否补全 |
| `enableInStrings` | bool | `true` | 字符串中是否补全 |
| `disabledLanguages` | list | `[]` | 禁用语言 ID |
| `firstLineOnlyWhenMidLine` | bool | `true` | 行中仅展示首行建议 |
| `acceptOnTab` | bool | `true` | Tab 接受（受 IDE keymap 影响） |
| `sendFilePath` | bool | `true` | prompt 是否包含文件路径（设置页在「补全行为」） |
| `respectGitignore` | bool | `true` | 尊重 .gitignore（路径范围，设置页在「补全行为」） |
| `ignoreGlobs` | list | 见下 | 额外忽略路径（设置页在「补全行为」） |
| 手动触发快捷键 | Keymap | `Ctrl+Shift+Space` | IDE Keymap 动作 `AutoComplete.Trigger`（非插件 State） |
| `overrideContextBudget` | bool | `false` | 配置级：覆盖性能页前缀/后缀预算（高级选项） |
| profile `maxPrefixChars` / `maxSuffixChars` | int | 8000 / 2000 | 仅当 override 开启时用于补全 |

## 4. Performance

| Key | Type | Default | Description |
|---|---|---|---|
| `debounceMinMs` | int | `150` | 自适应下限 |
| `debounceInitialMs` | int | `300` | 初始 debounce |
| `debounceMaxMs` | int | `1000` | 自适应上限 |
| `maxPrefixChars` | int | `8000` | 全局 prefix 预算（可被配置级 override 覆盖） |
| `maxSuffixChars` | int | `2000` | 全局 suffix 预算（可被配置级 override 覆盖） |
| `maxInFlight` | int | `1` | 同文件最大并发 |
| `cacheSize` | int | `20` | suggestion history |
| `lruSize` | int | `64` | hash LRU |
| `maxFileSizeKb` | int | `512` | 超限跳过 |
| `enableRecentFileContext` | bool | `false` | 额外最近文件上下文 |
| `recentFileLimit` | int | `3` | 最近文件数 |
| `recentFileMaxChars` | int | `1200` | 单文件 snippet 上限 |

## 5. Privacy / Logs（出站数据与诊断）

| Key | Type | Default | Description |
|---|---|---|---|
| `allowRemote` | bool | `true` | **已移除 UI**；运行时始终允许远程 baseUrl |
| `logPromptBodies` | bool | `false` | 是否记录 prompt 全文（高敏） |
| `logLevel` / `logRetention` / `showCostApprox` | — | — | 日志与用量展示 |

### 默认 ignoreGlobs

```
**/.git/**
**/node_modules/**
**/dist/**
**/build/**
**/target/**
**/.idea/**
**/.gradle/**
**/vendor/**
```

## 6. Logging / UX

| Key | Type | Default | Description |
|---|---|---|---|
| `logLevel` | enum | `info` | `debug` / `info` / `warn` / `error` |
| `logRetention` | int | `1000` | 内存日志最大条数（ring：满则丢最旧） |
| `notifyOnFatalError` | bool | `true` | 401/403 等通知 |
| `showCostApprox` | bool | `false` | 无官方计费时是否估算 |

### 日志级别

| Level | 记录内容 |
|---|---|
| `debug` | 请求开始、完整 URL、FIM/CHAT 路由、gate/skip、取消、项目上下文与 gitignore 刷新 |
| `info` | 请求成功、状态码、耗时、响应长度、模型列表数量、缓存命中、补全接受、设置保存 |
| `warn` | 普通 HTTP/网络失败、空结果、无效配置和可恢复错误 |
| `error` | 401/403 等认证或致命配置错误 |

模型列表、连接测试、格式测试和自动补全共用同一个内存日志缓冲区。日志默认不记录 API Key、认证头或请求正文；只有开启 `logPromptBodies` 后才记录截断后的 prompt 内容。

## 7. Settings UI 信息架构

Web 设置页（JCEF / Webview）分 Tab，对齐原 Swing 四页能力：

1. **配置（Provider）**  
   已保存配置 CRUD、Base URL / API Key / 模型 / 提示模板 / 超时 / 高级路径与 per-profile 上下文覆盖
2. **补全行为（Behavior）**  
   enable、autoTrigger、注释/字符串、首行建议、发送路径、状态栏、禁用语言、gitignore、ignoreGlobs
3. **性能（Performance）**  
   防抖 min/initial/max、**全局** maxPrefix/maxSuffix、cache/lru、maxInFlight、maxFileSize、最近文件上下文
4. **基础设置（General）**  
   界面语言、主题（auto/light/dark）
5. **日志（Logs）**  
   logLevel、logRetention、logPromptBodies、notifyOnFatal、showCostApprox + 日志流

每页原则：

- 常用项靠上，高级项折叠
- 诊断默认内联摘要，详情按需展开（不抢主流程）
- 危险项（logPromptBodies）有说明
- 改 key/baseUrl 后自动 reset fatal backoff

## 8. 存储

| 数据 | 存储 |
|---|---|
| 普通设置 | `PersistentStateComponent` XML |
| apiKey | PasswordSafe / CredentialStore |
| snooze 截止时间 | 普通设置或内存 + 持久化时间戳 |
| 日志 | 内存 ring buffer；可选导出文件 |

## 9. 校验规则

- `baseUrl` 必须是合法 URL，无意外空白
- `timeoutMs`：`500..30000`（默认 3000）
- `settingsTimeoutMs`：`1000..120000`（默认 15000）
- `maxTokens`：`16..1024`（可调）
- `maxPrefixChars/maxSuffixChars`：> 0 且有上限
- `allowRemote=false` 时，baseUrl host 必须是 localhost / 127.0.0.1 / ::1
- `extraHeadersJson` 必须是 object JSON

## 10. 与 Kilo 设置迁移（可选，非 P0）

若未来做迁移工具，可读取 legacy：

- `ghostServiceSettings.enableAutoTrigger`
- `ghostServiceSettings.enableSmartInlineTaskKeybinding`
- `ghostServiceSettings.enableChatAutocomplete`（本项目可不支持 chat）

只迁行为开关，不迁 Kilo token / profile 大盘。

## 11. 界面语言

插件跟随 JetBrains IDE 当前界面语言，不单独保存语言设置。

- 支持英文、简体中文、日文、韩文
- 其他语言默认回退英文
- 切换 IDE 语言后，重启 IDE 即可刷新插件界面文案

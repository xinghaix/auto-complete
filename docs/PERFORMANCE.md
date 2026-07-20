# 性能与热路径

[English](PERFORMANCE.en.md) · [文档索引](README.md)

内联补全处于输入热路径。优先级是：不打断编辑、快速丢弃无价值请求、绝不让旧结果覆盖新光标状态，而不是无限扩大上下文或等待模型完成。

## 当前默认预算

| 项目 | 当前默认/限制 | 代码依据 |
|---|---:|---|
| 自动触发防抖 | `150 / 300 / 1000 ms`（最小/初始/最大） | `EngineSettings` / `core-ts` types |
| 补全硬超时 | `3000 ms`，范围 `500..30000` | `ProviderConfig` |
| 设置探测硬超时 | `15000 ms`，范围 `1000..120000` | `ProviderConfig` |
| 输出上限 | `128 tokens`，范围 `16..1024` | profile 设置 |
| prefix / suffix 预算 | `8000 / 2000` 字符 | `PromptBuilder` 设置 |
| 最大文件 | `512 KB` | engine gate |
| 全局在途请求 | `1` | `maxInFlight` |
| suggestion history / prompt LRU | `20 / 64` | engine cache |
| 内存日志 | `1000` 条 | `LogBuffer` |
| 最近文件上下文 | 关闭；开启时 `3 × 1200` 字符 | project context 设置 |

这些是实现默认值，不是端到端 SLA。模型延迟、网络、代理和 endpoint 排队均在本项目控制之外。

## 请求前 gate

`CompletionEngine` 在 debounce 和 HTTP 前依次检查：

1. 总开关、自动触发开关和 JetBrains snooze；
2. 禁用语言、注释/字符串提示、最大文件大小；
3. **JetBrains 的** `.gitignore` 与额外 glob；VS Code 当前只有额外 glob 会实际送入引擎；
4. 设置校验结果和是否存在可用 profile；
5. suggestion history 命中；
6. 上下文 skip 规则；
7. error backoff 是否阻止请求。

任何 gate 或缓存命中都应避免网络。对手动触发，宿主可跳过自动防抖；它仍会经过大小、忽略、配置和响应过滤等安全/正确性检查。

## 取消、generation 与并发

每次触发拥有递增的 `generation` 与可取消 token。

- 同一路径 scope 的新任务会取消旧任务。
- 响应到达后若 token 已取消或 generation 已落后，结果被丢弃。
- 达到 `maxInFlight` 时，引擎取消另一个 scope 的在途任务，不排无限队列。
- HTTP 客户端注册 cancellation 回调：JVM 取消 `sendAsync` future，TS 取消 `AbortController` 路径。
- 用户继续输入造成的取消属于正常路径，默认只写 debug 日志，不弹错误。

这同时防止 ghost text 闪回和积压请求。不要把取消改成“等旧请求返回后再比对”；必须尽早释放连接与任务资源。

## 上下文与缓存

`PromptBuilder` 只保留离光标最近的 prefix/suffix，并按设置限制字符数。文件路径默认可发；最近打开文件的片段默认关闭。JetBrains 会从当前 document 建立快照，但请求正文在发送前被裁剪；不要把这个实现细节误写成“默认上传整文件”。

缓存分两级：

- suggestion history 支持 exact、继续输入和退格的匹配；
- prompt LRU 以语言、模型与裁剪后的 prompt 计算 key。

命中后仍会经 `SuggestionFilter` 检查，避免向已经存在的 prefix/suffix 或行中场景插入重复、多余文本。

## 错误退避

| 分类 | 示例 | 行为 |
|---|---|---|
| 取消 | 输入继续、宿主取消 | 静默，不视为失败 |
| fatal | 401/403 | 阻止后续补全，直到设置改变/重置；可通知 |
| retriable | 429、5xx、传输/超时异常 | 退避后再允许请求；日志记录 |
| 空结果 | 2xx 空响应或过滤为空 | 不展示建议，保留诊断 |

settings 变更会重新加载缓存并刷新状态。用户调整端点、模板或 key 后，应先用连接探测验证，而不是让编辑热路径反复尝试错误连接。

## 日志与验证

性能诊断可关注：

- `latencyMs`、HTTP status、cache hit 与响应长度；
- cancel rate 与 stale-response 是否被丢弃；
- gate/skip 原因、模型列表与模板 probe 的结果；
- `idea.log`（JetBrains）或 OutputChannel（VS Code）中的同一日志流。

建议验证场景：

1. 连续输入时检查同一文件没有并发旧请求写回。
2. 大于 `maxFileSizeKb` 或命中 ignore rule 的文件不产生网络日志。
3. 401 后不应每次输入都继续请求。
4. 使用假 HTTP 服务验证取消后不会展示响应。
5. 分别验证 FIM 和 chat 模板的路径及解析。

相关单元/fixture 测试位于 `packages/completion/engine-jvm/src/test`、`apps/jetbrains/plugin/src/test`、`packages/completion/engine-ts/test` 和 `packages/settings/ui/src/*.test.ts`。
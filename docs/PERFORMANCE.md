# Performance

补全是输入热路径。慢、乱、不可取消，比“建议稍差”更伤体验。

## 1. 目标预算（P0/P1）

| 指标 | 目标 |
|---|---|
| cache hit 展示 | < 16ms 量级（本地逻辑） |
| 跳过路径（skip/gate） | < 5ms |
| 本地 debounce 默认 | 300ms 起，自适应 150–1000ms |
| 网络超时默认 | 2500ms |
| 同文件 in-flight | 1 |
| 取消生效 | 新输入后旧请求停止占用结果通道 |
| 启动 | lazy：首次需要补全再初始化 engine |

这些是工程目标，不是 SLA 承诺；实现后用本地基准/日志验证。

## 2. 红线（禁止）

1. **默认发送整文件**（v5 RPC 坑）
2. **默认 10s 超时**（v5 RPC 坑）
3. **EDT 上做 HTTP 或重计算**
4. **无 cancel 的 fire-and-forget 请求**
5. **失败后 tight loop 重试**
6. **默认开启仓库级检索 / 重 AST**
7. **默认记录 prompt 全文**
8. **双进程 extension host 架构**

## 3. 关键路径优化

### 3.1 Gate 前置

任何磁盘/网络前先判断：

- enabled / snoozed
- file size
- ignore
- language disabled
- credentials configured（若需要）
- backoff blocked

### 3.2 Cache 优先

- exact / partial typing / backspace 命中直接展示
- 命中时不发网

### 3.3 Debounce + Cancel

- 自适应 debounce，避免每个字符打爆模型
- 新请求 cancel 旧请求
- cancel 不是错误

### 3.4 Prompt 预算

- `maxPrefixChars` / `maxSuffixChars` 截断
- 优先光标附近上下文
- v1 默认不附加多文件

### 3.5 响应裁剪

- maxTokens 默认 128
- mid-line first-line-only，减少花哨多行干扰与后处理成本

## 4. 并发模型

```
scope = file path + notebook/cell if any

on request:
  if same scope has in-flight:
    cancel it
  start new job(generation++)
```

可选：

- covering pending reuse（后做）
- 全局跨文件 max 2（默认不必开放）

## 5. 内存

| 组件 | 上限 |
|---|---|
| suggestion history | cacheSize (20) |
| LRU | lruSize (64) |
| log ring | logRetention (1000，满则丢旧) |
| in-flight bodies | 1 份当前请求 |

避免：

- 无界列表存所有历史响应
- 日志永久落盘 prompt

## 6. 与 v5 对比

| 项 | v5 JetBrains 路径 | auto-complete |
|---|---|---|
| 进程 | JB + VS Code host | 单进程 |
| 传输 | RPC 全文 | HTTP 预算上下文 |
| 超时 | 10s | 2.5s |
| 缓存 | 在 VS Code 侧 | 进程内，更短路径 |
| 失败 | 依赖扩展主机状态 | 本地 backoff |

## 7. 验证方法

1. 日志统计：p50/p95 latency、cache hit rate、cancel rate、error rate
2. 假 HTTP 服务器测 cancel 是否立刻丢弃结果
3. 连续输入 50 字符，不应堆积 50 个已完成 stale 写回
4. 401 后 1 分钟内请求数接近 0（除 probe 策略外）
5. 大文件（> maxFileSizeKb）零网络

## 8. 性能相关默认值速查

见 [SETTINGS.md](SETTINGS.md) Performance 段。

核心默认：

- debounceInitialMs = 300
- timeoutMs = 3000（补全）
- settingsTimeoutMs = 15000（设置页探测）
- maxTokens = 128
- maxPrefixChars = 8000
- maxSuffixChars = 2000
- maxInFlight = 1
- enableRecentFileContext = false

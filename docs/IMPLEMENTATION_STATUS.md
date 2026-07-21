# 实现状态

[English](IMPLEMENTATION_STATUS.en.md) · [文档目录](README.md)

记录**当前代码已经有的能力**和**允许的平台差异**。不要把计划写成已交付。测试结果以本次 CI/本地命令为准。

## 已经有了什么

| 范围 | JetBrains | VS Code |
|---|---|---|
| 宿主 | 行内补全、手动触发、取消、开关、snooze、状态栏、设置/日志工具窗口 | 行内补全、命令、状态栏、Output |
| 引擎 | Kotlin 完整管线 | TypeScript 对等管线 + 共享 fixture |
| 连接 | FIM / Chat 模板、探测、拉模型 | 相同语义 |
| 设置 | 多 profile、PasswordSafe、JCEF 设置页 | 多 profile、SecretStorage、Webview |
| 共用 | — | Vue 设置页（中英日韩）+ contracts |

JetBrains：**2024.2+**，设置页需要 JCEF。VS Code：**1.85+**。

## 引擎行为（两端）

启用/自动触发、防抖与取消、缓存、FIM/Chat、超时分离、退避、日志、可选路径与最近文件、profile 与无密钥导出。

## 跨宿主原则

- **默认趋同**：同一设置、同一设置页、同一补全门控  
- **允许差异**：只因平台（存盘位置、入口 UI、密钥 API、快捷键/snooze）  
- **改 UI**：必须 JCEF + Webview 都查（见 `AGENTS.md`）  

## 允许的差异

| 项目 | 现状 |
|---|---|
| 注释/字符串 | 两端都有启发式探测 |
| `.gitignore` | 两端都会读项目/工作区根 |
| 最近文件 | 两端都支持；数据来源略有不同（打开文件 / 可见编辑器） |
| 设置入口 | 工具窗口 vs Webview（+ 部分原生设置） |
| 密钥存储 | 功能等价，文件不能手工对拷 |
| 动作 | JB 有 snooze；VS Code 以开关命令为主 |
| 发布 | tag 可自动挂 Release 产物；Marketplace/签名仍手动 |
| Agent / Next Edit | 不做 |

存盘路径不同 ≠ 功能不同。

## 验证

```bash
npm install
./gradlew :core:test :plugin:test
npm run test:js
npm run build:js
./scripts/package-local.sh
```

打包脚本只强制部分测试，完整测试用上面命令。见 [RELEASE.md](RELEASE.md)。

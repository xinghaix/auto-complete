# 贡献指南

[中文](CONTRIBUTING.zh.md) · [English](CONTRIBUTING.md)

双宿主内联补全：JetBrains（`:core` + `:plugin`）与 VS Code（`engine-ts` + extension）共用 `settings/ui` 与 `contracts`。独立实现；不引入 JB↔VS Code 桥、`kilo serve`、账号或 Agent/Next Edit。

## 开发

需要 **JDK 21**、**Node 18+**。命令与签名见 **[docs/DEV.md](docs/DEV.md)**。

```bash
npm install
npm run build:settings-ui
./gradlew :core:test :plugin:test
npm run test:js
npm run build:js
./scripts/package-local.sh
```

## 目录

| 路径 | 职责 |
|---|---|
| `packages/completion/engine-jvm` | Kotlin 引擎（`:core`） |
| `apps/jetbrains/plugin` | JetBrains 宿主 |
| `packages/completion/engine-ts` | TypeScript 引擎 |
| `apps/vscode/extension` | VS Code 宿主 |
| `packages/settings/ui` | 共用设置页 |
| `packages/completion/contracts` | 契约 / fixtures |

## 规则（摘要）

1. 先读 `AGENTS.md` 与相关文档（用户行为 → `docs/GUIDE.md`；构建 → `docs/DEV.md`）。  
2. 引擎保持宿主无关；不向 core 塞 IDE API。  
3. 保留取消与 generation 校验；设置页不直连 provider HTTP。  
4. 密钥只进 PasswordSafe / SecretStorage；禁止提交密钥、私人 endpoint、家目录路径等（见 `AGENTS.md`）。  
5. 改共享行为时两端 + fixtures 一起改；故意差异写在 `docs/DEV.md` 的「允许的平台差异」。  
6. 用户可见变更同步中英文用户文档（`README` / `GUIDE`）。  
7. 设置 UI 变更双端检查（JCEF + Webview），见 `AGENTS.md` 清单。  

## PR

聚焦说明；用户可见项写入 `CHANGELOG.md` `[Unreleased]`；建议 `feat:` / `fix:` / `docs:` 前缀。未要求时不要 push / 发布 / 打 tag。

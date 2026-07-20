# 贡献指南

[中文](CONTRIBUTING.zh.md) · [English](CONTRIBUTING.md)

感谢关注 **Auto Complete**。

## 开发环境

1. JDK **21**
2. 克隆仓库后可用 IntelliJ 打开，或任意编辑器 + Gradle CLI
3. 测试：

```bash
./gradlew :core:test :plugin:test
```

4. 带插件的隔离 IDE：

```bash
./gradlew :plugin:runIde
```

5. 打包（从磁盘安装）：

```bash
./scripts/package-local.sh
# → plugin/build/distributions/auto-complete-*.zip
```

## 产品约束（摘要）

详见 [`AGENTS.md`](AGENTS.md)：

- 不引入 VS Code Extension Host / RPC 桥，不依赖 `kilo serve` 运行时
- 不把 API 密钥写入明文 XML
- 不在 EDT 上发 HTTP
- 默认不全文件 / 全仓库上下文
- v1 范围：内联补全（非 Agent / Next Edit 产品）

## 与 kilocode 的关系

本项目的补全核心来自 / 对照 [kilocode](https://github.com/Kilo-Org/kilocode) 开源实现的能力抽离；**当前仅 JetBrains 插件**，**后续计划 VS Code**。贡献时请保持「独立补全产品」边界，勿重新绑回完整 Agent 套件。

## Pull Request

1. 变更尽量聚焦，说明动机与影响
2. 引擎 / 客户端 / 设置逻辑尽量带测试
3. 用户可见变更写入 `CHANGELOG.md` 的 `[Unreleased]`
4. 提交信息建议：`feat:` / `fix:` / `docs:` / `chore:`

## 目录

| 路径 | 职责 |
|------|------|
| `core/src/main/kotlin` | 引擎、HTTP、提示（无 IDE UI） |
| `plugin/src/main/kotlin` | 设置、InlineCompletion、状态栏、日志 |
| `plugin/src/main/resources/messages` | 界面文案（en / zh / ja / ko） |

## 问题讨论

大改动请先开 GitHub Issue。

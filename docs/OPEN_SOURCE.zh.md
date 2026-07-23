# 开源发布准备

[English](OPEN_SOURCE.md) · [文档索引](README.md)

仓库已具备开源预览的基础组成：Apache-2.0 的 `LICENSE` / `NOTICE`、中英文 README、贡献和安全策略、CI、JetBrains ZIP 与 VSIX 本地打包脚本，并且构建配置中没有 Marketplace token。

## 当前发布边界

- JetBrains：通过 Install from Disk 或 GitHub Release ZIP 分发；最低版本 2024.2 / build 242。
- VS Code：通过本地打包或 GitHub Release 的 VSIX 安装；扩展、TS 引擎与 Webview 设置界面均已在仓库中。
- Marketplace 与插件签名：可选；CI 当前不自动执行。
- API key：仅保存在 PasswordSafe / SecretStorage，不能提交。
- 运行时：两个宿主独立运行；不依赖 VS Code host、`kilo serve` 或 Kilo Gateway。

## 发布前检查

1. 确认 `git status` 只含预期文件，并扫描 `.env`、私有 endpoint、token、机器路径和构建产物。
2. 检查 `LICENSE`、`NOTICE` 以及新增第三方依赖/资源的许可归属。
3. 依照 [RELEASE.md](RELEASE.md) 完整运行 JVM 与 Node 测试、构建和双端打包。
4. 在 JetBrains 2024.2 和一个较新 IDE 验证 JCEF 设置页；在受支持 VS Code 版本验证 VSIX。
5. 验证默认隐私：没有 profile/key 时不得泄露数据；导出不含 secret；未开启 prompt body 时日志不含 prompt。
6. 更新 README、索引、CHANGELOG 和版本，确保不存在“仅 JetBrains、VS Code 计划中”“JCEF 必选”或默认 2500 ms 超时等旧叙事。
7. 只有在发布负责人明确批准时才创建 tag、push 或 GitHub Release。

## 建议产物与命名

| 宿主 | 产物 | 建议分发方式 |
|---|---|---|
| JetBrains | `apps/jetbrains/plugin/build/distributions/auto-complete-<version>.zip` | GitHub Release，Install from Disk |
| VS Code | `apps/vscode/extension/dist-vsix/auto-complete-<version>.vsix` | GitHub Release，Install from VSIX |

建议使用带注释 tag `v<version>`：

```bash
git tag -a v0.2.0 -m "Auto Complete 0.2.0"
```

Release notes 应来自相应版本的 `CHANGELOG.md`，包含已知宿主差异和安装方式。GitHub Actions 已上传 ZIP/VSIX artifact，并在 tag 触发时创建 GitHub Release；不要宣称 Marketplace、签名或跨版本兼容性 smoke test 已自动完成。

## 后续可选项

- Marketplace listing、签名与 token 管理；
- 为现有 release workflow 增加自动化端到端兼容性 smoke test；
- 截图、演示与隐私说明；
- Dependabot、Code of Conduct、更多安全披露渠道；
- 扩充跨宿主 parity 测试，特别是 VS Code `.gitignore`、最近文件、注释/字符串识别。

任何发布自动化都必须将 secret 限制在 CI 环境，且不得打包用户 provider key、模型权重或私有日志。
# 安全策略

[中文](SECURITY.zh.md) · [English](SECURITY.md)

## 支持版本

安全修复接受当前 `main` 分支与最近 release tag 的报告。项目处于开源预览阶段；不要假定未测试的历史安装包仍受支持。

## 漏洞报告

请**不要**公开提交安全敏感 Issue，包括密钥泄露、UiBridge/Webview/JCEF 注入、Provider 鉴权头处理、路径过滤绕过或意外发送代码上下文。

优先使用：

1. 仓库已启用时的 GitHub **Security Advisories** 私密报告；或
2. 仓库/组织 profile 列出的维护者联系方式。

请提供受影响版本或 commit、宿主（JetBrains/VS Code）、影响、最小复现步骤、脱敏日志，以及是否已有修复方案。除非维护者提供安全渠道，切勿提交有效 API key 或私有源码。

## 密钥与上下文处理

- API key 只能存放在 JetBrains PasswordSafe 或 VS Code SecretStorage。
- key、Authorization header、个人 endpoint 不得进入源码、文档、fixture、导出设置、CI 日志或 Issue 评论。
- UiBridge snapshot 只含 `hasApiKey`，绝不能返回专用 API key 明文；可编辑的头字段仅限本地编辑。可移植导出会移除 `apiKey`、`hasApiKey`、`authHeaderTemplate` 和 `extraHeadersJson`。
- 设置 UI 不得直接发 provider HTTP；探测必须经宿主和引擎客户端。
- 补全会向用户配置的 endpoint 发送裁剪 prefix/suffix。文件路径默认发送；最近打开文件上下文和 prompt 正文日志均为默认关闭的 opt-in 功能。
- CI 和普通 PR 构建不得依赖 Marketplace/signing secret。

## 范围说明

项目包含两个宿主；报告请注明宿主和 IDE/扩展版本。JetBrains 网络遵循 IDE 代理/信任库集成，VS Code 使用扩展网络路径。Provider 数据策略、TLS 拦截、endpoint 访问控制和网络出口策略仍由用户负责。

可传输设置的完整说明见 [docs/SETTINGS.md](docs/SETTINGS.md) 和 [docs/PROVIDERS.md](docs/PROVIDERS.md)。
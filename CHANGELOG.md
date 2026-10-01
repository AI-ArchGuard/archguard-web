# Changelog

## [Unreleased]

- 4H：新增默认关闭、精确 `true` 才启用的 Agent 展示开关；隐藏文档/解释/摘要入口并阻断文档深链接挂载，保留扫描和门禁。构建时生效，不替代 Platform 权限或模型出口。

- 4G：防止慢 Agent 状态查询重叠，补充权限撤销、网络恢复、失败脱敏与门禁不变的合成测试；真实外发仍关闭。

### Added

- Project Maintainer 显式上传架构文档、不可变版本管理及获授权读取。
- 显式 Finding 解释与已选 Finding 的 PR 摘要，异步状态、可验证引用、失败原因和版本追溯。

### Security

- 建议与质量门禁分开展示；引用版本不匹配或 Project 权限失效时停止展示；中断提交重用幂等键。
- 真实模型外发保持关闭，CI 与浏览器验收只使用确定性合成数据。

## [0.2.0] - 2026-09-27

### Added

- 只读持续治理页面：PR 当前门禁、不可变基线、分类、趋势和有期限例外。
- 独立 PR 修订差异，明确区分相对基线与相对上一 PR 修订的 Finding 变化。

### Security

- 不复用旧 head 门禁，缺少可信前驱或报告时明确显示不可用；继续保持 OIDC Token 仅在会话内。

## [0.1.0] - 2026-09-22

### Added

- 建立 React、Vite、TypeScript、ESLint、Vitest 与 Playwright 基线。
- 提供 OIDC PKCE 登录和治理平台 MVP 页面。

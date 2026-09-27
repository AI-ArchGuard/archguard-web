# Changelog

## [Unreleased]

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

# ArchGuard Web 工作约定

- 保持 React 客户端为独立仓库，不复制 Platform 领域实现。
- API 类型只能来自仓库内固定的 OpenAPI 快照。
- Token 不得写入 `localStorage`、日志、查询参数或错误页面。
- 所有业务页面必须具备加载、空数据、错误和无权限状态。
- 修改后至少运行 lint、组件测试、类型检查与生产构建。

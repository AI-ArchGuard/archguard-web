# ArchGuard Web

ArchGuard 治理平台的独立 React 客户端。提供 OIDC Authorization Code + PKCE 登录，以及 Project、Repository、RuleSet、ScanJob、Finding、Evidence 和处置页面。阶段 3F 增加只读持续治理页面：从 Repository 的“持续治理”进入，选择目标分支与 RuleSetVersion，查看 GitHub PR 当前提交门禁、不可变基线、NEW/EXISTING/RESOLVED、趋势及跨扫描例外到期状态。

阶段 3H 增加独立的 PR 修订差异展示：它比较上一个已验证的不同 PR head 与当前 head，并清楚标注“相对上一 PR 修订”；原门禁与 Finding 分类仍标注“相对基线”。缺少可信前驱或报告时显示不可用原因，不把未知误当作零。此只读展示不改变 CI 退出码或 Scanner 契约。

## 安全边界

- 浏览器只访问 Web 反向代理暴露的 `/api` 与 `/auth`。
- OIDC token 使用 `sessionStorage`，不进入 `localStorage`、URL、日志或错误正文。
- API 类型由固定的 Platform OpenAPI 快照生成并随仓库审查；治理快照分别对应基线、门禁、GitHub 与 3F 读取接口。
- 不加载外部 CDN 脚本，不接受源码上传或 Git URL。

## 本地验证

```bash
npm ci
npm run check:api
npm run check
npm run test:e2e
```

本地开发前复制 `.env.example` 到未跟踪的 `.env.local` 并按环境调整公开 OIDC 地址。完整用户旅程由 `archguard-deploy` 的 Compose 入口提供。

## 3H 兼容顺序

先发布 Platform 3F 只读接口，再发布使用固定快照生成类型的 Web。回滚时先回滚 Web，再回滚 Platform；新页面不写入治理数据，不修改 Scanner Schema，也不改变 3E CI 提交流程。

PR 修订差异需先部署 Platform V7 迁移与新接口，再部署本 Web 版本。回滚先隐藏 Web 新区块，再回退 Platform 应用；V7 追加历史保留，不执行降级迁移。旧 PR 缺少迁移前 head 历史时明确显示不可用。

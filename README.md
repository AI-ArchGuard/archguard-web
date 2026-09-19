# ArchGuard Web

ArchGuard 治理平台的独立 React 客户端。首版提供 OIDC Authorization Code + PKCE 登录，以及 Project、Repository、RuleSet、ScanJob、Finding、Evidence 和处置页面。

## 安全边界

- 浏览器只访问 Web 反向代理暴露的 `/api` 与 `/auth`。
- OIDC token 使用 `sessionStorage`，不进入 `localStorage`、URL、日志或错误正文。
- API 类型由固定的 Platform OpenAPI v1 快照生成并随仓库审查。
- 不加载外部 CDN 脚本，不接受源码上传或 Git URL。

## 本地验证

```bash
npm ci
npm run check
npm run test:e2e
```

本地开发前复制 `.env.example` 到未跟踪的 `.env.local` 并按环境调整公开 OIDC 地址。完整用户旅程由 `archguard-deploy` 的 Compose 入口提供。

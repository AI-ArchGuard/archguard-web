# ArchGuard Web

ArchGuard 治理平台的独立 React 客户端。提供 OIDC Authorization Code + PKCE 登录，以及 Project、Repository、RuleSet、ScanJob、Finding、Evidence 和处置页面。阶段 3F 增加只读持续治理页面：从 Repository 的“持续治理”进入，选择目标分支与 RuleSetVersion，查看 GitHub PR 当前提交门禁、不可变基线、NEW/EXISTING/RESOLVED、趋势及跨扫描例外到期状态。

阶段 3H 增加独立的 PR 修订差异展示：它比较上一个已验证的不同 PR head 与当前 head，并清楚标注“相对上一 PR 修订”；原门禁与 Finding 分类仍标注“相对基线”。缺少可信前驱或报告时显示不可用原因，不把未知误当作零。此只读展示不改变 CI 退出码或 Scanner 契约。

## 安全边界

阶段 4F 提供 Project 文档管理、单个 Finding 的按需解释和 Maintainer 显式选择 Finding 的 PR 摘要。请求绑定确切扫描/报告、已验证 PR 修订和不可变文档版本；页面显示异步状态、失败原因、证据覆盖、版本及 traceId。Evidence 和文档引用按当前 Project 权限重新读取，摘要和解释始终作为需人工复核的建议。

生产模型默认关闭；当前只支持已验收的合成/不可用路径。真实 DeepSeek 外发继续受 Docs ADR-0011 的独立审批关卡约束。

4G 的合成安全与恢复测试覆盖慢查询不重叠、重复提交、网络恢复、终态权限撤销、全部失败码安全展示及 `PASS/0`、`FAIL/2` 不变；不会自动重试模型或展示提供方原文。Platform 4G → Web 4G → Deploy 4H，契约版本不变，回滚仍先关闭入口和模型。

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

## 4F 兼容与回滚

先发布 Platform 4C–4E 和 4F 只读补充（PR `currentHeadRevisionId`、按版本 ID 读取文档），核对 main CI，再发布本 Web 固定 OpenAPI v1 快照消费者。Agent Output Schema 保持 `0.1.0`，Scanner `v0.2.1` 和 Scanner Schema `0.1.0` 不变。旧 Platform 缺少可信修订时摘要入口明确不可用。回滚先关闭 Web Agent 入口与模型调用，再回退应用；保留 V7–V10、文档版本及历史请求，原 PASS/FAIL 和 CI 退出码保持不变。

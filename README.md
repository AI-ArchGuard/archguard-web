# ArchGuard Web

ArchGuard 治理平台的独立 React 客户端。提供 OIDC Authorization Code + PKCE 登录，以及 Project、Repository、RuleSet、ScanJob、Finding、Evidence 和处置页面。阶段 3F 增加只读持续治理页面：从 Repository 的“持续治理”进入，选择目标分支与 RuleSetVersion，查看 GitHub PR 当前提交门禁、不可变基线、NEW/EXISTING/RESOLVED、趋势及跨扫描例外到期状态。

阶段 3H 增加独立的 PR 修订差异展示：它比较上一个已验证的不同 PR head 与当前 head，并清楚标注“相对上一 PR 修订”；原门禁与 Finding 分类仍标注“相对基线”。缺少可信前驱或报告时显示不可用原因，不把未知误当作零。此只读展示不改变 CI 退出码或 Scanner 契约。

## 安全边界

阶段 4F 提供 Project 文档管理、单个 Finding 的按需解释和 Maintainer 显式选择 Finding 的 PR 摘要。请求绑定确切扫描/报告、已验证 PR 修订和不可变文档版本；页面显示异步状态、失败原因、证据覆盖、版本及 traceId。Evidence 和文档引用按当前 Project 权限重新读取，摘要和解释始终作为需人工复核的建议。

生产模型默认关闭；当前只支持已验收的合成/不可用路径。真实 DeepSeek 外发继续受 Docs ADR-0011 的独立审批关卡约束。

个人凭据入口按 Docs [ADR-0013](https://github.com/AI-ArchGuard/archguard-docs/blob/main/adr/0013-personal-write-only-credential-management.md)提供添加/替换/删除，读取只显示元数据，不回显 Key。先撤销在聊天等处暴露的 Key，之后仅在本机受控入口输入新 Key；不要贴回聊天。后端 AES-256-GCM 持久化依赖独立主密钥与受控目录，重启后保留；Web 本身不持久化 Key，操作不验证有效性、查询余额、启用 Agent 或发起模型请求。

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

## 个人凭据兼容与运行限制

Platform #50 已合并为 `710025d`，main CI 成功后本 Web 消费固定 [API 0.1.0](openapi/agent-credentials-v1.json)。`VITE_CREDENTIAL_UI_ENABLED`（Docker 同名 build arg）默认 false，只接受精确 true，独立于 Agent 展示/后台模型开关；启用后顶栏“模型凭据”进入 `/settings/model-credentials`。仅配置的后端 owner UUID 可管理，其他用户看到无权限；仅本机 local-compose 环回 Origin 支持，远程/多人范围不开放。

无权限、管理关闭或存储错误时不展示输入框；未知写入结果提示手工刷新，不自动重试或显示旧状态。密码输入只短暂留在 DOM/请求内存，不进入 React Key 状态、URL、local/sessionStorage、缓存、错误正文或遥测；提交（包括失败）、离页/pagehide、身份切换和退出主动清空。浏览器扩展、密码管理器、XSS/已攻陷设备仍是风险，autocomplete=off 不是安全保证。删除只移除本地槽位，不撤销供应商 Key或擦除磁盘快照；须到 DeepSeek 账户撤销，历史解释/审计保留。

专用客户端固定同源路由、no-store/不重定向、15 秒取消、最多 1 KiB 元数据，只接受三个字段和合法版本/时间，不解析服务端错误正文。退出先移除本地页面再进行 OIDC 重定向；取消不能撤回已经送达后端的变更。Nginx 全站 no-store/no-referrer/CSP 同源策略也覆盖 SPA 客户端进入页面，不能只保护深链接；凭据精确路由限制 512 字节并关闭代理请求/响应缓冲，不落代理临时文件。OIDC 必须沿现有 `/auth` 同源代理，不允许直连外部 issuer 的 fetch。

部署仍待受控主密钥/目录挂载、owner/origin 配置；本 UI 不代表真实 Agent 已接通或阶段完成。兼容顺序 Docs → Platform producer → Web → Deploy；回滚关闭凭据 UI/管理/模型后退应用，保留主密钥、密文和历史。现有 Agent Output/Scanner Schema 不变，#43/4H/阶段 4 继续跟踪。

安全补丁仅将已存在的间接依赖 source-map-js 锁定版本从 1.2.1 更新至 1.2.2（BSD-3-Clause），修复[官方发布列出的拒绝服务漏洞](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2)。未增加依赖或批量升级；保持旧版本无法通过当前 high 门槛，降低扫描门槛不是备选。

## 3H 兼容顺序

先发布 Platform 3F 只读接口，再发布使用固定快照生成类型的 Web。回滚时先回滚 Web，再回滚 Platform；新页面不写入治理数据，不修改 Scanner Schema，也不改变 3E CI 提交流程。

PR 修订差异需先部署 Platform V7 迁移与新接口，再部署本 Web 版本。回滚先隐藏 Web 新区块，再回退 Platform 应用；V7 追加历史保留，不执行降级迁移。旧 PR 缺少迁移前 head 历史时明确显示不可用。

## 4F 兼容与回滚

4H 增加构建时展示开关 `VITE_AGENT_UI_ENABLED`，只有精确 `true` 才挂载文档页、Finding 解释和 PR 摘要；缺失、`false` 或非法值都关闭。关闭后文档深链接显示明确状态，不挂载 Agent 查询/轮询组件，扫描与门禁继续可用。Docker 构建参数默认 `false`，合成验收需显式设为 `true`；改动开关必须重新构建并部署 Web，单独修改容器运行环境不会改变静态包。

这不是权限或模型出口开关，不能阻止已加载旧页面或直接 API 调用。回滚部署关闭入口的 Web 包后，必须同时关闭 Platform `ARCHGUARD_AGENT_ENABLED`（真实外发还需 Project/Deployment 关卡），再回退旧应用。旧页面应刷新，历史解释/文档与已发布迁移保留。真实提供方和 Project 启用仍未交付、不因打开展示开关而获批准。

先发布 Platform 4C–4E 和 4F 只读补充（PR `currentHeadRevisionId`、按版本 ID 读取文档），核对 main CI，再发布本 Web 固定 OpenAPI v1 快照消费者。Agent Output Schema 保持 `0.1.0`，Scanner `v0.2.1` 和 Scanner Schema `0.1.0` 不变。旧 Platform 缺少可信修订时摘要入口明确不可用。回滚先关闭 Web Agent 入口与模型调用，再回退应用；保留 V7–V10、文档版本及历史请求，原 PASS/FAIL 和 CI 退出码保持不变。

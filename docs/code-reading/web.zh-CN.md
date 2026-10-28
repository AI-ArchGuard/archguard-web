# Web 中文阅读指南

从页面入口跟踪一次读取或提交，比先读组件细节更容易理解。手写 TypeScript/React、测试、样式与构建配置补中文说明；生成的 `.d.ts`、OpenAPI、Schema、锁文件及固定数据保持原内容。

## 页面、身份与 API

1. [main.tsx](../../src/main.tsx) 建立 React、路由和身份提供器；[App.tsx](../../src/App.tsx) 定义登录、回调和受保护页面。
2. [AuthContext](../../src/auth/AuthContext.tsx) 管理 OIDC 用户加载及卸载事件；[oidc.ts](../../src/auth/oidc.ts) 配置 PKCE 与会话存储。客户端登录态不是 Project 授权，服务器仍逐次检查资源归属。
3. [client.ts](../../src/api/client.ts) 附加当前 Token 并组织普通 API 错误。这里的 TypeScript 泛型断言不是 JSON 运行时校验；个人 Agent 和凭据有各自更严格的客户端，不能把它们的限制推广到全部请求。
4. [ProjectsPage](../../src/pages/ProjectsPage.tsx)、[ProjectPage](../../src/pages/ProjectPage.tsx)、[RuleSetsPage](../../src/pages/RuleSetsPage.tsx) 和 [ScanResultPage](../../src/pages/ScanResultPage.tsx) 展示扫描控制面；[GovernancePage](../../src/pages/GovernancePage.tsx) 区分基线分类与上一 PR 修订差异。

## 建议与真实请求分开阅读

[useAgentRequest](../../src/hooks/useAgentRequest.ts) 保存原合成请求的输入与幂等键、轮询状态，并核对返回的 Project/扫描/版本。轮询失败不等于重新发送模型请求；权限失效时清除结果。[AgentRequestView](../../src/components/AgentRequestView.tsx) 展示状态、版本、覆盖等级和经当前权限读取的引用。解释与摘要是建议，不重写 Finding 或 `PASS/FAIL`。

个人真实入口从 [PersonalAgentPage](../../src/pages/PersonalAgentPage.tsx)、[personalAgent.ts](../../src/api/personalAgent.ts) 和 [usePersonalLiveBatch](../../src/hooks/usePersonalLiveBatch.ts) 阅读。风险确认、Project 设置、批次批准与实际发送是不同动作。页面开关只控制显示，不能替代后端授权或费用检查。

设置写入使用服务器返回的强 ETag；固定模板槽位与幂等键不能因刷新、超时或失败而更换。Hook 从后端恢复请求与结算事实，`SETTLED` 不等于解释成功。sessionStorage 中的拒绝标记只能更保守地阻止本标签页重发，不是全局授权或永久防重机制。浏览器取消/离页不代表后台已撤销或数据从未发送。

## API Key 页面

[CredentialSettingsPage](../../src/pages/CredentialSettingsPage.tsx) 与 [credentials.ts](../../src/api/credentials.ts) 组织添加/替换/删除和元数据读取。Key 仅短暂存在输入状态，不保存到浏览器存储或通过读取接口回显。后端加密托管并调用官方 API，不在浏览器直连提供方，也不部署模型。

保存 Key、打开入口或读取状态都不测试 Key、不查余额、不自动请求模型。页面中的 owner 与 Maintainer 控件只是用户体验，服务端仍是授权权威。未知写入结果必须恢复读取，不能自动补发。

## 测试与固定契约

先看相邻组件/Hook/API 测试，再看 [e2e](../../e2e)。这些测试使用合成身份与请求拦截，验证默认关闭、范围绑定、权限撤销、幂等、失败展示和取消；不是本机真实 OIDC、收费模型或发布验收。

按仓库原命令执行 `npm run check:api`、`npm run check` 和 `npm run test:e2e`。生成快照应与固定 OpenAPI 一致，不能手改生成类型掩盖差异。注释不改变接口、UI 文案、行为、依赖或部署状态；回滚仅撤销本次注释与指南提交。

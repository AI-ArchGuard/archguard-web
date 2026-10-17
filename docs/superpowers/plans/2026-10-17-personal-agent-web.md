# Personal Agent Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已有个人 Key 托管之上，交付默认关闭、可恢复且不补发的两次合成真实验收 Web 控制。

**Architecture:** 浏览器仅访问同源 Platform，消费固定类型契约。客户端负责有界边界，hook 只恢复/观察固定批次请求，页面区分风险确认、费用批准和用户显式发送；后端始终拥有授权与费用事实。

**Tech Stack:** 现有 React/TypeScript/Vite、Vitest、Playwright；无新增依赖。

**Spec:** [个人合成真实验收 Web 控制](../../personal-agent-live-ui.md)，以及 Docs ADR-0012/0013/0014。用户已要求持续执行既定方案，只自行输入新 Key；本计划细化既定范围，不增加外发或费用授权。

## Global Constraints

- `VITE_AGENT_UI_ENABLED=true` 且 `VITE_AGENT_LIVE_UI_ENABLED=true` 才挂载，默认关闭。
- Settings/Batch 0.3.0、live 0.1.0 固定快照；原 synthetic POST 不切换。
- 每次最多 USD 0.35、两次 USD 0.70；保守预留 USD 0.316373/次；输入 8,000 为调用后阈值。
- 同源、no-store、拒绝重定向、15 秒取消；错误原文不展示；浏览器不直连 DeepSeek、测试 Key 或查询账户。
- 同 batch/template 幂等键固定；未知提交只恢复 GET，失败/UNKNOWN/stop 不补发；已分配模板不能创建替代请求。
- 强 ETag 原样保存和回传，不能从 JavaScript number 重建 int64 revision。
- Viewer/后台关闭仍可读历史；真实按钮另要求 owner+Maintainer、当前有效配置与 Key/确认匹配及串行必要条件。
- 不部署、不读运行 Secret、不消耗真实调用授权；保留用户根工作树修改，不提前关闭阶段或启动 Gateway/Evals。

## Review Focus

1. 日期推进不能使离线测试依赖过去的绝对期限；真实确认不得自动延期。
2. 身份/Project 切换后的迟到成功响应不能恢复旧权限或旧结果。
3. 关闭发送入口不能误关历史读取，也不能被迟到设置 GET 重新打开。
4. 丢失 POST 响应后刷新不得换键、创建替代请求或触发第二用途。
5. SETTLED、UNKNOWN、零费用、结果失败必须分开；新旧模板/模型/引用不能混合。

---

### Task 1: Bounded fixed-contract client

**Files:** `src/api/personalAgent.ts`、`src/api/personalAgent.test.ts`；消费已复制的三份 OpenAPI、五份输入 Schema 和生成类型。

**Interfaces:** 导出 `PersonalSettingsSnapshot { value, etag }`、PersonalSettings/Enablement/AcknowledgementInput/BatchInput/Batch/BatchPreview/BatchExecution/Purpose 类型及 PersonalAgentClientError。所有函数的最后参数为 AbortSignal：getPersonalSettings(project,signal)、updatePersonalSettings(project,input,etag,signal)、getPersonalEnablement(project,id,signal)、acknowledgePersonalRisk(project,input,signal)、revokePersonalEnablement(project,id,signal)、previewPersonalBatch(project,ids,signal)、approvePersonalBatch(project,input,signal)、getPersonalBatch/getPersonalBatchExecution/revokePersonalBatch(project,id,signal)、getPersonalRequest(project,id,signal)、runPersonalRequest(project,batch,template,signal)、getPersonalRole(project,actor,signal)。

- [x] 写默认拒绝 stub 及假 fetch 测试，验证固定路径、原始大整数 ETag、严格形状、错误脱敏、费用中间态和取消。
- [x] 实际红：29 项中 9 失败、20 通过，日志 `archguard-web-live-client-red.log`；功能尚缺，不是编译失败。
- [x] 实现固定同源边界、共享单次请求期限、受限响应、严格 scope/费用投影、确定性 tuple 幂等键。metadata/execution 最多 32 KiB，request 最多 128 KiB，出站管理正文最多 8 KiB。角色分页整体受同一期限约束。
- [x] 运行 `npm run test -- src/api/personalAgent.test.ts` 并审阅实际输出；独立任务审阅后登记结果。39/39；执行失败码与通用请求失败码分开，审阅修复已复核。

### Task 2: Recover-only live batch state

**Files:** `src/hooks/usePersonalLiveBatch.ts`、对应 `.test.ts`。

**Interfaces:** `usePersonalLiveBatch(projectId,batchId,enabled)` 返回 execution、requests、error、busy、refresh()、run(purpose)、canSubmit(purpose)。enabled 表示读取挂载，不是发送授权；页面单独控制真实按钮。

- [x] 写默认拒绝 stub 和 scope/固定槽/双击/未知/取消/GET 轮询行为测试。
- [x] 实际红：26 项中 25 失败、1 通过，日志 `archguard-web-live-hook-red.log`。
- [x] 实现 GET 恢复、精确模板/版本和结果校验、同步双击锁、未知提交停发 latch、无重叠 GET、离页/换身份取消及迟到丢弃。pending 1.5 秒、终态 30 秒仅轮询 GET。
- [x] 用冻结测试时钟验证日期边界，执行目标测试并独立审阅；不自动延长真实批准或期限。37/37，含 pagehide 与仅拒绝的标签页停发标记，审阅修复已复核。

### Task 3: Explicit management and invocation page

**Files:** `src/pages/PersonalAgentPage.tsx`、其必要的小组件和组件测试；不复制 client/hook。

**Interfaces:** 消费 Task 1/2、现有 getCredentialStatus/useAuth/AgentRequestView。outer key 为 Project+当前 subject。

- [x] 写最小页面 stub 和六项 owner/Viewer、强 ETag、412、身份迟到和默认关闭行为测试。
- [x] 实际红：六项均失败，日志 `archguard-web-live-page-red.log`；入口/routing 16 项通过。
- [x] 实现只读元数据、既有 Key 跳转、风险确认/撤销、Project 开关、模板核验/preview、明确两次批次批准/撤销及已有批次读取。所有 POST 仅事件触发；不自动勾选风险、生成核对时间或检查凭据有效性。
- [x] 增加明确付费解释/摘要按钮及历史结果展示；数据不足、撤权、未知、失败、过期保持安全不可用，不用 SETTLED 冒充成功。
- [x] 运行页面最小测试并独立审阅；验证后台关闭后的历史读取和失效批准不能发送。到期/节流与权限拒绝实际红绿，24/24 页面/live 测试及浏览器 403 整页清理通过，审阅修复已复核。

### Task 4: Entrypoints and browser journey

**Files:** 已有 App/ProjectPage、personalAgentEntry.ts/测试、Dockerfile、.env.example、Playwright 配置、README/CHANGELOG；新增 `e2e/personal-agent.spec.ts` 及纯合成 fixture。

**Interfaces:** 默认关闭的页面路由/Project 链接，明确既有批次和确认读取，按钮调用 Task 3。

- [x] 双开关 red 1/11 后 green 11/11；深链接关闭零 API 的 routing 五项通过。
- [x] 固定快照及三类生成类型已生成，旧固定契约不改。
- [x] 添加仅假 HTTP 的浏览器旅程：显式解释→已成功且已结算→显式摘要、引用核对、刷新零补发、失败/未知禁止第二用途、权限撤销清空、原 synthetic 端点零 POST。
- [x] 执行该浏览器文件；再完整生成漂移检查、lint、组件测试、类型/生产构建、所有 e2e 与依赖审计。生成类型应先进入 index，再运行基于 Git diff 的 `check:api`；不得借此隐藏漂移。195 项测试、完整构建和 10 条浏览器旅程通过；API 无漂移、审计零漏洞；全外部 HTTP 拦截回归及逐任务审阅修复已复核。最终分支审查、PR/main CI 仍在 Task 5 跟踪。

### Task 5: Review and integrate

**Files:** 本计划、设计实施状态、全部已测试变更；最终只创建一个 Web PR。

- [ ] 完成逐任务 spec/quality 审阅及一次全分支独立审阅；发现问题先实测再修复，不降低断言。
- [ ] 完整检查、快照/Secret/许可证/diff 核对，提交单一可评审 Web PR并附加到本聊天。
- [ ] 核对评审、所有 PR CI；按已有用户授权 SHA 守卫合并，再核对 main 全部 CI。
- [ ] 更新 #43 证据，仍保持 #43/4H/阶段4开放；下一步再做 Deploy 受限候选，不用本地假 HTTP 代替真实验收。

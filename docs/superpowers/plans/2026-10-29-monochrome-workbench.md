# 黑白工作台 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans with bounded disjoint annotation-preserving workers and one fresh whole-branch review. Steps use checkbox syntax. User approved the full design and requested implementation; proceed without an extra plan-approval round.

**Goal:** 将现有 Web 改为获批的黑白双主题工作台，减少常驻说明、突出结果并保留全部既有功能及安全回归。

**Architecture:** 保持现有 React Router、身份、API 与请求 hooks。主题与 Shell 只负责展示偏好和导航；管理内容用稳定挂载的 disclosure 收纳。CSS 使用统一语义变量，模型调用流程不因外观改变。

**Tech Stack:** 现有 React/TypeScript/Vite/Vitest/Playwright，无新依赖。

**Spec:** 本地已批准设计 `../../../../archguard-docs-stage4-agent-workbench/docs/superpowers/specs/2026-10-28-stage4-agent-workbench-design.md`；原型为工作区 `.superpowers/brainstorm/1257-1793247876/content/archguard-workbench-v3.html`。先读仓库 README/AGENTS、`docs/personal-agent-live-ui.md` 和相关代码。

## Global Constraints

- 以 `c343dcc9afa29bd3912be9d59a6049e3b8409b3b` 为基线，保留所有中文注释；原检出和其他工作树不动。
- 只实现本 UI 子计划；不更改 API/生成类型/Schema/锁文件/凭据生命周期、业务状态机、权限、幂等、次数/费用或默认关闭策略。
- 不假造最近会话或项目/模型结果；项目名称和资源来自现有事实，未配置时给出准确短状态。
- Theme 只持久化 `archguard.theme` 的 `light|dark|system`，不能读取/存储 Key、Token 或结果。
- 配置收纳不得卸载请求协调器、重置未知/幂等状态或丢失已填表单；不能预勾风险或静默发送。
- 新日常使用契约、费用授权、真实验收与发布由后续独立计划处理；本 UI 通过不关闭阶段四。

## Review Focus

- 浏览器存储不可用、系统主题变化：页面仍可使用，显式选择优先，不影响身份/模型调用。
- 手机侧栏关闭后退出焦点树；打开时背景隔离，Escape/导航后恢复焦点，主题/导航无 Agent POST。
- 折叠/展开配置不重挂载请求/风险/批次表单，不丢失输入，权限撤销继续清理结果。
- 深色下所有正文、错误、表单、引用及覆盖等级可读；长摘要/ID不撑破窄屏。
- 手动真实收费、删除、撤销和 UNKNOWN 的影响仍在操作上下文出现，不被说明收纳掩盖。

## Task 1: 主题与工作区导航

**Files:** Create `src/theme/ThemeContext.tsx`, `src/theme/ThemeContext.test.tsx`, `src/components/Shell.test.tsx`; Modify `src/components/Shell.tsx`, `src/App.tsx`。根执行者拥有 `src/styles.css`。

**Interfaces:** `ThemePreference = 'system'|'light'|'dark'`; `ThemeProvider({children})`; `useTheme(): {preference, resolved:'light'|'dark', setPreference(preference):void}`。App 在所有路由外稳定提供 ThemeProvider。文档根 `data-theme` 表示 resolved。Shell 只根据已存在路由/开关构造导航，不增加模型请求。

CSS contract: `workbench-layout`, `workbench-sidebar`, `sidebar-brand`, `sidebar-toggle`, `project-switcher`, `sidebar-nav`, `sidebar-link`, `sidebar-footer`, `sidebar-account`, `theme-picker`, `workbench-main`, `workbench-topbar`, `mobile-nav-button`, `sidebar-backdrop`，外壳状态 `is-collapsed`/`is-mobile-open`。

- [x] 先写失败用例：跟随系统、显式主题覆盖与保存、存储拒绝、可访问导航与手机关闭焦点；保留原登录和开关测试。
- [x] 运行 `npx vitest run src/theme/ThemeContext.test.tsx src/components/Shell.test.tsx`，确认缺失能力导致失败。
- [x] 实现纯展示主题及导航，保持所有资源深链接；登录页同样应用主题。
- [x] 运行相关测试通过，保存 RED/GREEN 证据，交根执行者统一提交。

## Task 2: 建议与个人运行结果优先

**Files:** Modify `src/components/AgentRequestView.tsx`, `src/components/AgentRequestView.test.tsx`, `src/pages/PersonalAgentPage.tsx`, `src/pages/PersonalAgentPage.test.tsx`; 如需要仅调整 `PersonalEnablementForm.tsx`/`PersonalBatchPanel.tsx` 的展示及其测试，不改 API/hook。

**Interfaces:** 保留原 props、引用解析/失权回调、固定请求和表单状态。使用 `management-disclosure`, `compact-metadata`, `agent-status-row`, `result-reading` class；原 `details` 结构可复用。

- [x] 先增加失败测试：成功建议的结论/引用可直接看到，完整 Prompt/trace 等默认收起；展开配置不丢失已填写输入或重新发送模型请求。
- [x] 执行对应 Vitest 文件确认 RED；实现结果优先、低频配置/工程元数据按需展开。
- [x] 保留费用/未知/权限/删除等实际影响，更新需要显式打开 disclosure 的现有交互测试，不降低原断言。
- [x] 相关测试 GREEN，报告准确范围和证据；不自行提交或运行全套。

## Task 3: 列表和管理页面

**Files:** Modify `src/pages/ProjectsPage.tsx`, `ProjectPage.tsx`, `AgentDocumentsPage.tsx`, `CredentialSettingsPage.tsx` 及对应测试；新增覆盖缺口的页面测试。根执行者拥有 e2e 和共享CSS。

**Interfaces:** 保留所有API、身份、版本、上传幂等、删除确认与输入清理。新建项目/注册仓库/文档上传使用 `details.management-disclosure` 收纳，表单保持挂载。扫描历史区域 `id="scans"`，仓库区域 `id="repositories"` 供 Shell 导航。凭据页面保留安全输入和操作确认，仅收纳长帮助及历史元数据。

- [x] 先写失败测试：列表优先、显式打开新建/上传表单、关闭/重开保留非敏感输入；凭据仍及时清空且默认不回显。
- [x] 运行页面相关测试确认 RED；调整展示和短文案，保留业务处理函数和原断言。
- [x] 页面测试 GREEN，说明已有 e2e 需要何处增加“展开表单”动作。

## Task 4: 统一样式与浏览器验收

**Files:** 根执行者修改 `src/styles.css`, `e2e/shell.spec.ts`, `e2e/agent.spec.ts`, `e2e/credentials.spec.ts`, `e2e/personal-agent.spec.ts`, README 与阅读指南；可增加专门主题/手机浏览器测试。

**Interfaces:** 消费 Task1 CSS class/data-theme 和 Task2/3 disclosure；不通过 CSS 隐藏错误、确认或不可用状态。

- [x] 为主题切换、侧栏/320px、引用与按需表单增加真实浏览器断言并先观察失败；保留原所有幂等、失权、未知停发和门禁断言。
- [x] 使用语义颜色变量重做全部现有页面的黑白样式，清理旧全局尺寸/颜色冲突；保持状态文字和焦点清楚。
- [x] 各任务相关测试通过后，运行 `npm run check:api`、`npm run check`、`npm run test:e2e`，检查默认/浅/深和窄屏截图；依赖审计既有问题单独记录，不降低门槛。
- [x] 一次独立全分支复核，修复真实问题后保存本地可评审提交。不得部署或调用模型；后续继续完整目标。

## 计划自检与执行决策

Task1→4 CSS class、Task2/3→4 disclosure 名称已对齐；各写入目录互斥，完整测试仅由根执行者运行。主题/导航、结果/配置、普通管理页面是独立子任务，可并行，使用已采用的有界协作与最终独立复核。所有者已明确“按这版设计实现”，不重复请求计划/执行方式确认。费用未批准不影响离线 UI 实现，但仍禁止真实发送。

## 本地执行记录

2026-10-29 已完成本 UI 实现及一次独立全分支复核。复核发现的短窗口侧栏裁切、首次/重复锚点导航与无 Project 时重复 current 均有先失败后通过的回归。最终本地检查：API 生成比对通过；lint、243 项组件测试、类型检查、生产构建通过；Edge 合成浏览器回归 18/18 通过，包含 320px、主题、引用、失权、未知结果与原门禁断言。浅/深结果和窄屏截图保存在本计划的本地执行证据目录，不作为真实模型验收。

合并就绪仍需处理基线依赖审计（3 高危、2 中危，锁文件本次未改）及完成容器冒烟：默认 Docker 缓存依赖目录出现 EBADMSG，重建构建阶段仍失败，正用独立构建缓存隔离验证。未发布、部署或调用真实模型；正常日常 Agent 的新契约和新费用授权仍由后续切片处理，阶段四保持开放。

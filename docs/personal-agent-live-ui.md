# 个人合成真实验收 Web 控制

状态：实现与回归已落盘，独立审阅及最终交付检查进行中；尚未合并、部署或真实验收。提供方 Platform #62/#63 已合并，main `9f68dea97fca7893961c8305ce84ff215be9d0df` CI 成功；本切片只消费固定契约，不部署或调用模型。依据 Docs ADR-0012/0013/0014 和个人 Agent Feature Spec。

## 1017 映射跟进

本次前向更新依据已接受的 Docs ADR-0015（Docs `077a7c5`、main CI `39144567175`），消费 Platform [#64](https://github.com/AI-ArchGuard/archguard-platform/pull/64) 的规范提交 `903ddc5987e0f6e63091ee4897d4311b9c41cbe9`，其 [main CI 39191487577](https://github.com/AI-ArchGuard/archguard-platform/actions/runs/39191487577) 成功。Web 自身生成、回归、审阅和 PR/main CI 仍须完成，不把此前实现计划中的历史结果作为本次验证。

当前新增确认仅接受 Settings/确认 `0.4.0`，固定大小写敏感的 `mappingSnapshot: DeepSeek-V4.1-Flash-1017`。请求别名及唯一响应模型均为 `deepseek-flash`；公告快照名不加入响应白名单，价格仍为 `deepseek-flash-context-peak-usd-2026-10-15`。表单明确显示批准快照，实际资料核对记录仍由操作员提供，风险框必须手动勾选。旧 0.2/0.3 Schema 不改写；历史读取、撤销和结算按原记录处理，旧映射不隐式升级，也不批准新真实发送。只读确认元数据不新增映射字段；Web 不据此推断版本，后台可用性仍由服务器决定。

Batch `0.3.0`、live `0.1.0`、模型协议/profile、费用/预留/次数、完整请求 6,000 字节、输出 1,500 Token、调用后输入 8,000 阈值、默认关闭和 Key 托管流程不变。新增假 HTTP 浏览器场景只允许显式创建风险确认；加载、编辑、刷新不写入，其他设置/批次/凭据/模型写入及全部外部请求均拦截。该场景不替代真实运行绑定或验收证据。

兼容顺序为 Docs/main CI → 上述生产者/main CI → Web 消费者/main CI → Deploy 显式固定兼容版本/摘要及其 main CI → 新鲜具体运行绑定；两个真实调用仍未使用。回滚先关闭 UI、Project、部署和出口，再回退应用，保留已发布迁移、密文、确认、费用及其他历史。#43、4H、阶段4继续开放。

## 范围与风险

新增独立 `/projects/:projectId/agent/personal` 页面，只在 `VITE_AGENT_UI_ENABLED=true` 且 `VITE_AGENT_LIVE_UI_ENABLED=true` 时挂载，默认关闭。复用已有只写 Key 页面，不新增 Key 输入/存储/回显，不访问 DeepSeek 或账户/余额。旧 Finding 解释和 PR 摘要保留 synthetic POST，不能静默切换。

仅新增个人风险确认、Project 设置、合成模板/manifest 核验、两次批次批准/撤销、独立 live POST 及已有请求读取。读取当前凭据元数据作为 owner 门禁，Project Maintainer 才显示写控件；服务端授权始终权威。页面加载、刷新、Key 保存、轮询或启用操作不触发模型 POST。

风险确认表单不自动勾选风险、不伪造资料核对时间、来源版本或 Secret/网络检查。官方协议/模型/目录/数据范围使用冻结常量；非敏感引用和实际核对记录由操作员填写。保存风险确认不是费用批准；批次批准不是实际发送。模型输入不由前端构造，模板来自同 Project 的不可变终态 synthetic 请求。

按钮明确区分无模型费用的管理操作、真实解释和真实摘要。显示每次最多 USD 0.35、总授权 USD 0.70、保守预留 USD 0.316373；本地控制不是供应商强制限费。输入 8,000 为调用后阈值，失败立即停止，不以回退/退款/换键恢复次数。关闭/撤销不能撤回已发送的数据。

## 客户端与状态

API 类型只从固定 OpenAPI 生成：enablement 0.4.0、batches 0.3.0、live 0.1.0 及其固定输入 Schema，既有 Agent/Scanner 契约不变。独立有界同源客户端固定路径、no-store、拒绝重定向、15 秒取消、受限正文，不显示错误原文。设置写入使用 GET 返回的原始强 ETag，不用 JavaScript number 重建 int64 revision。

Project/身份变更及离页取消浏览器在途工作、忽略迟到响应，明确客户端取消不等于后台撤销。批次执行视图按解释→摘要恢复确切 request ID，已有槽位不能创建替代请求；SETTLED 不等于结果成功，无 attempt 不等于可补发。摘要必须先观察解释 SUCCEEDED 且 SETTLED，仍需服务端逐次准入。单个 batch/template 的幂等键固定，不因终态、超时或渲染而更换。未知提交只手动恢复 GET，不自动 POST；401/403/404 清空敏感结果，已验证结果/引用复用现有展示及当前 Project 授权读取。

为防止同一标签页刷新/重挂载丢失未知或在途提交状态，发送前仅在 sessionStorage 写入按 Project+batch 隔离的拒绝标记，不保存 Key、Token、输入或结果。未知提交不能因后来 GET 成功而清除此标记；存储异常也只能阻止发送，历史读取不依赖它。该标记不是授权或业务历史，不能保证跨标签页、关闭标签页或清除站点存储后的全局永久停发；服务端固定槽位、幂等、次数、费用和 stop 仍为权威。不同身份看到同批次的标记也只能更保守地拒绝，不能据此获取权限。

## 验证与交付顺序

先取得相关行为的失败回归，再运行有界客户端/hook/页面/开关最小检查和完整 `check:api`、lint、组件测试、类型检查、生产构建、e2e、依赖审计。假浏览器旅程拦截所有供应商请求；不读取运行 Secret、部署或动用两次真实授权。重点覆盖默认关闭零查询/POST、owner+Maintainer、ETag 412、不可信响应/范围版本、刷新恢复、双击一次、失败/超时不补发、Key/批准失效、权限撤销清空、引用和 PASS/FAIL 不变。

兼容顺序：已冻结 Docs → Platform 已合并提供方 → 本 Web 固定快照 → Deploy 默认关闭受限候选 → 具体绑定/获批两次合成真实验收 → 最终关闭/回滚/恢复、制品和唯一 Docs 报告。回滚先隐藏 Web、关闭 Project/部署及网络出口，再退应用；V1–V16、密文/主密钥、批准/批次/费用/解释历史保留。#43、4H、阶段4不提前关闭，不启动 Gateway/Evals。

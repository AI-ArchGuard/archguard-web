// Agent 与项目文档的公共类型别名，直接引用固定 OpenAPI 生成类型，避免在客户端复制领域模型。
// Public aliases over the fixed Platform 4C/4E OpenAPI snapshots.
import type { components as agentComponents } from './agent-schema'
import type { components as documentComponents } from './agent-documents-schema'

// 异步建议请求及其绑定、结果、失败和用量的契约视图。
export type AgentRequest = agentComponents['schemas']['AgentRequest']
// 普通合成建议提交的明确扫描、报告、Finding 和文档版本选择。
export type CreateAgentRequest = agentComponents['schemas']['CreateAgentRequest']
// 平台已校验的引用索引；点击读取时仍须验证当前权限与绑定。
export type VerifiedCitation = agentComponents['schemas']['VerifiedCitation']
// 文档摘要分页，用于列表与选择器。
export type DocumentPage = documentComponents['schemas']['DocumentPage']
// 文档标识与概要，不代替不可变版本正文。
export type DocumentSummary = documentComponents['schemas']['DocumentSummary']
// 单份文档的不可变版本分页。
export type DocumentVersionPage = documentComponents['schemas']['DocumentVersionPage']
// 文档不可变版本、内容与摘要，用于展示和绑定建议依据。
export type DocumentVersion = documentComponents['schemas']['DocumentVersion']

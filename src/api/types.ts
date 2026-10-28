// 基础业务 DTO 的公共类型出口：引用固定 Platform 生成快照，不在别名层加入领域逻辑。
// Aliases over the generated Platform OpenAPI v1 snapshot. Do not add domain logic here.
import type { components } from './schema'

// 固定基础 OpenAPI 快照的 Schema 索引。
type Schemas = components['schemas']
// 客户端 UUID 文本别名；运行时边界仍须自行验证格式。
export type UUID = string
// Project 成员角色的契约枚举。
export type ProjectRole = Schemas['ProjectMemberRole']
// Project 成员及其 actor/角色元数据。
export type ProjectMember = Schemas['ProjectMember']
// 治理项目边界及其元数据。
export type Project = Schemas['Project']
// Project 下注册的受控目录与 Scanner 身份。
export type Repository = Schemas['Repository']
// 规则集元数据，不代表具体扫描使用的规则版本。
export type RuleSet = Schemas['RuleSet']
// 扫描绑定的不可变规则版本及摘要。
export type RuleSetVersion = Schemas['RuleSetVersion']
// 异步扫描任务、运行状态及报告绑定。
export type ScanJob = Schemas['ScanJob']
// 扫描调度与执行状态，区别于门禁结论。
export type ScanJobStatus = ScanJob['status']
// 确定性扫描结论，可在尚无结论时为空。
export type ScanJobOutcome = ScanJob['outcome']
// 扫描证据的文件与行列位置。
export type SourceLocation = Schemas['SourceLocation']
// 扫描发现及其规则、证据索引与人工处置状态。
export type Finding = Schemas['Finding']
// 人工处置枚举，不修改原始扫描事实。
export type FindingDisposition = Schemas['FindingDisposition']
// Scanner 提供的结构化证据读取视图。
export type Evidence = Schemas['Evidence']
// 一次人工处置记录及其原因等元数据。
export type Disposition = Schemas['Disposition']
// 普通业务接口的统一错误结构。
export type ApiError = Schemas['ApiError']

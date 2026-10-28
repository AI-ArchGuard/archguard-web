// 持续治理的公共类型别名：连接基线、门禁及只读治理快照；所有响应形状由固定 OpenAPI 决定。
// Public aliases over fixed Platform OpenAPI snapshots; never hand-maintain response shapes.
import type { components as baselineComponents } from './baselines-schema'
import type { components as gateComponents } from './gates-schema'
import type { components as readComponents } from './governance-read-schema'

// 某分支/规则范围的不可变基线版本。
export type BaselineVersion = baselineComponents['schemas']['BaselineVersion']
// 跨扫描策略例外及其状态、范围和到期信息。
export type PolicyException = gateComponents['schemas']['PolicyException']
// 一次确定性门禁评估及其计数与 CI 退出码。
export type GateEvaluation = readComponents['schemas']['GateEvaluation']
// 门禁历史分页，保留服务器分页事实。
export type GatePage = readComponents['schemas']['GatePage']
// 当前 PR head 与所关联门禁/修订的读取视图。
export type PullRequest = readComponents['schemas']['PullRequest']
// PR 列表分页。
export type PullRequestPage = readComponents['schemas']['PullRequestPage']
// 扫描相对基线的 Finding 分类结果。
export type Comparison = readComponents['schemas']['Comparison']
// 带逻辑指纹和 NEW/EXISTING/RESOLVED 分类的 Finding 视图。
export type ClassifiedFinding = readComponents['schemas']['ClassifiedFinding']
// 当前 PR head 相对上一可信不同修订的差异及不可用原因。
export type PrRevisionDelta = readComponents['schemas']['PrRevisionDelta']

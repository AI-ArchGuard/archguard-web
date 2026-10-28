// 个人真实批次执行状态机：恢复固定槽位、核对不可变模板与结果，串行允许显式解释/摘要，未知提交只允许读取。
import { useEffect, useRef, useState } from 'react'
import type { AgentRequest } from '../api/agent'
import { getPersonalBatchExecution, getPersonalRequest, PersonalAgentClientError, runPersonalRequest,
  type PersonalBatchExecution, type PersonalPurpose } from '../api/personalAgent'

const PURPOSES: PersonalPurpose[] = ['FINDING_EXPLANATION', 'PR_SUMMARY']
const PRICE = 'deepseek-flash-context-peak-usd-2026-10-15'
const VERSION_ERROR = '建议范围或版本不匹配，已停止展示和发送；请人工核对。'
const UNKNOWN_ERROR = '提交结果尚未确认；只能手动刷新恢复，不能重试或补发。'
const STORAGE_ERROR = '无法保存或核对安全停止标记，已禁止发送；只能刷新读取，不能补发。'
const ACCESS_ERROR = 'Project 权限已失效，历史结果已清除；请重新核对权限。'
// 按解释/摘要用途保存模板或请求，尚未读取的用途允许缺省。
type RequestMap = Partial<Record<PersonalPurpose, AgentRequest>>
// 提供给 React 的当前范围快照，不以渲染时的按钮状态代替发送时复核。
type View = { scope: string; execution?: PersonalBatchExecution; requests: RequestMap; error: string; busy: boolean;
  readonly accessDenied: boolean; allowed: Partial<Record<PersonalPurpose, boolean>> }
// 单个 Project/batch 的可取消执行会话，集中保存互斥锁、固定槽位、停止标记及唯一计时器。
type Session = { scope: string; project: string; batch: string; controller: AbortController; active: boolean;
  reading: boolean; writing: boolean; fresh: boolean; denied: boolean; stopped: boolean; unknownPost: boolean;
  markerUnavailable: boolean; accepted?: { purpose: PersonalPurpose; requestId: string };
  execution?: PersonalBatchExecution; templates: RequestMap; requests: RequestMap; error: string;
  allocated: Map<PersonalPurpose, string>; submitted: Set<PersonalPurpose>; fingerprint?: string;
  timer?: number; notify: () => void }

// 表示版本/范围/状态观测不一致，必须清空结果并停止发送。
class InvalidObservation extends Error { }
// 表示拒绝标记无法可靠保存或读取，发送前按失败关闭处理。
class StopMarkerUnavailable extends Error { }
// 观测不一致时抛出专用错误，由状态机清除结果并停止发送。
function requireFact(condition: unknown): asserts condition { if (!condition) throw new InvalidObservation() }
// 按 Project 与 batch 隔离标签页拒绝标记；跨身份共享只会更保守地禁止发送，不授予权限。
// Deny-only, tab-local safety state: never a credential, result, or authority grant. Scope is deliberately
// broader than identity. New tabs/site-storage clearing are not covered; durable backend slots remain authoritative.
function stopKey(project: string, batch: string) { return `archguard.agent.live.stop.v1:${project}:${batch}` }
// 恢复拒绝标记；无法访问存储时默认停发，但仍允许历史 GET。
function savedStop(project: string, batch: string) {
  try { return { stopped: window.sessionStorage.getItem(stopKey(project, batch)) !== null, unavailable: false } }
  catch { return { stopped: true, unavailable: true } }
}
// 网络发送前持久记录并读回标记，存储异常则拒绝发送，避免导航丢失未知提交。
function retainStop(session: Session) {
  try {
    const key = stopKey(session.project, session.batch)
    if (window.sessionStorage.getItem(key) !== null) throw new StopMarkerUnavailable()
    window.sessionStorage.setItem(key, '1')
    if (window.sessionStorage.getItem(key) !== '1') throw new StopMarkerUnavailable()
  } catch { throw new StopMarkerUnavailable() }
}
// 只有本会话已确认接受的 POST 被 GET 交叉证明成功且结算，才清除拒绝标记；未知 POST 永不借此恢复发送。
function completeKnownPost(session: Session, value: PersonalBatchExecution, requests: RequestMap) {
  const accepted = session.accepted
  if (!accepted || session.unknownPost || session.stopped) return
  const item = value.templates.find((candidate) => candidate.purpose === accepted.purpose)
  if (item?.request?.id !== accepted.requestId || item.request.state !== 'SUCCEEDED'
      || item.attempt?.outcome?.state !== 'SETTLED' || requests[accepted.purpose]?.state !== 'SUCCEEDED') return
  try {
    const key = stopKey(session.project, session.batch)
    if (window.sessionStorage.getItem(key) !== '1') throw new StopMarkerUnavailable()
    window.sessionStorage.removeItem(key)
    if (window.sessionStorage.getItem(key) !== null) throw new StopMarkerUnavailable()
    session.accepted = undefined
  } catch {
    session.markerUnavailable = true; session.stopped = true; session.unknownPost = true
  }
}
// 将扫描、报告、PR 修订、Finding 及文档版本摘要规范化，用于比较模板与 live 的同一输入。
function selection(value: AgentRequest) {
  const bindings = value.bindings
  return JSON.stringify([bindings.scanJobId, bindings.reportSha256, bindings.prHeadRevisionId,
    [...bindings.findingIds].sort(), [...bindings.documentVersions].sort((a, b) => a.documentVersionId.localeCompare(b.documentVersionId))
      .map((item) => [item.documentVersionId, item.contentSha256]), bindings.outputSchemaVersion])
}
// 仅接受指定 Project/用途的终态合成模板，并检查固定 fake/disabled 模型与版本。
function templateMatches(value: AgentRequest, project: string, id: string, purpose: PersonalPurpose) {
  return value.id === id && value.projectId === project && value.purpose === purpose
    && (value.state === 'FAILED' || value.state === 'SUCCEEDED')
    && value.bindings.modelProfileVersion === 'disabled-or-test-fake-0.1.0'
    && value.bindings.modelProtocolVersion === 'responses-v1-restricted'
    && value.bindings.modelId === 'deterministic-fake-or-disabled'
    && value.bindings.priceCatalogVersion === 'synthetic-0.1.0' && value.bindings.outputSchemaVersion === '0.1.0'
    && value.bindings.promptVersion === (purpose === 'PR_SUMMARY' ? 'pr-summary-0.1.0' : 'finding-explanation-0.1.0')
}
// 真实结果必须对应模板选择与固定模型配置；成功态必须有结果，引用仍逐一检查范围。
function liveMatches(value: AgentRequest, source: AgentRequest, id: string) {
  if (value.id !== id || value.id === source.id || value.projectId !== source.projectId || value.purpose !== source.purpose
      || selection(value) !== selection(source)
      || value.bindings.modelProfileVersion !== 'deepseek-personal-0.2.0'
      || value.bindings.modelProtocolVersion !== 'responses-v1-restricted' || value.bindings.modelId !== 'deepseek-flash'
      || value.bindings.priceCatalogVersion !== PRICE
      || value.bindings.promptVersion !== (value.purpose === 'PR_SUMMARY'
        ? 'pr-summary-deepseek-0.1.0' : 'finding-explanation-deepseek-0.1.0')) return false
  if (value.state === 'SUCCEEDED' && (!value.result || value.failure)) return false
  return !value.result || value.result.citations.every((citation) => citation.projectId === value.projectId
    && (citation.source === 'SCANNER_EVIDENCE'
      ? !!citation.evidenceId && citation.scanJobId === value.bindings.scanJobId && citation.reportSha256 === value.bindings.reportSha256
      : !!citation.documentVersionId && value.bindings.documentVersions.some((version) =>
        version.documentVersionId === citation.documentVersionId && version.contentSha256 === citation.contentSha256)))
}
// 判断会话仍挂载且未取消，作为所有异步发布的前提。
function current(session: Session) { return session.active && !session.controller.signal.aborted }
// 清除唯一轮询计时器，供读写互斥、离页和权限丢失路径复用。
function clearTimer(session: Session) { if (session.timer !== undefined) { window.clearTimeout(session.timer); session.timer = undefined } }

// 前端必要条件：当前用途未占用、批次无失败/未知尝试且快照新鲜；摘要还须已核对解释成功及费用结算。
// These are necessary UI conditions, not owner/Project/Secret/network authorization.
function canSubmit(session: Session, purpose: PersonalPurpose) {
  const value = session.execution
  if (!current(session) || !session.fresh || session.denied || session.reading || session.writing || session.stopped
      || !value || value.batch.revoked || value.stop || Date.parse(value.batch.expiresAt) <= Date.now()
      || !session.templates.FINDING_EXPLANATION || !session.templates.PR_SUMMARY
      || session.submitted.has(purpose) || session.allocated.has(purpose)
      || value.templates.some((item) => item.request?.state === 'FAILED' || item.attempt?.outcome?.state === 'UNKNOWN')) return false
  const item = value.templates.find((candidate) => candidate.purpose === purpose)
  if (!item || item.request || item.attempt) return false
  if (purpose === 'FINDING_EXPLANATION') return !value.templates.some((candidate) => candidate.request || candidate.attempt)
  const explanation = value.templates[0]
  return explanation.request?.state === 'SUCCEEDED' && explanation.attempt?.outcome?.state === 'SETTLED'
    && session.requests.FINDING_EXPLANATION?.state === 'SUCCEEDED'
    && !!session.requests.FINDING_EXPLANATION.result
}
// 仅向仍激活的 React 会话推送当前视图。
function publish(session: Session) { if (session.active) session.notify() }
// 一次读取结束后再安排下一次 GET，待处理请求较频繁、终态历史较慢；未知提交停止自动恢复。
function poll(session: Session) {
  clearTimer(session)
  if (!current(session) || session.denied || session.unknownPost) return
  const pending = session.execution?.templates.some((item) => item.request?.state === 'QUEUED' || item.request?.state === 'RUNNING')
    || Object.values(session.requests).some((request) => request.state === 'QUEUED' || request.state === 'RUNNING')
  session.timer = window.setTimeout(() => { void read(session) }, pending ? 1500 : 30000)
}
// 权限丢失时取消并清空历史，观测不一致时停发清空；普通网络错误只保留安全提示。
function reject(session: Session, failure: unknown) {
  session.fresh = false
  if (failure instanceof PersonalAgentClientError && [401, 403, 404].includes(failure.status)) {
    session.denied = true; session.stopped = true; session.execution = undefined; session.requests = {}; session.templates = {}
    session.error = ACCESS_ERROR; clearTimer(session); session.controller.abort()
  } else if (failure instanceof InvalidObservation) {
    session.stopped = true; session.execution = undefined; session.requests = {}; session.templates = {}; session.error = VERSION_ERROR
  } else { session.error = session.markerUnavailable ? STORAGE_ERROR : session.unknownPost
    ? UNKNOWN_ERROR : '暂时无法核对执行状态，请只刷新读取；不会自动重试模型。' }
}
// 锁定批次不可变元数据和模板顺序，后续读取不得把另一份绑定当成当前批次。
function fingerprint(value: PersonalBatchExecution) {
  const batch = value.batch
  return JSON.stringify([batch.id, batch.projectId, batch.enablementId, batch.approvedBy, batch.approvedAt,
    batch.expiresAt, batch.manifestSha256, batch.maxRequests, batch.maxCostMicrousd,
    value.templates.map((item) => [item.purpose, item.templateRequestId])])
}
// 先互斥读取执行快照，再核对模板和固定请求；允许独立 GET 之间进展，不接受终态回退。
async function read(session: Session): Promise<void> {
  if (!current(session) || session.denied || session.reading || session.writing) return
  clearTimer(session); session.reading = true; session.fresh = false; publish(session)
  try {
    const signal = session.controller.signal
    const value = await getPersonalBatchExecution(session.project, session.batch, signal)
    if (!current(session)) return
    requireFact(value.batch.projectId === session.project && value.batch.id === session.batch && value.costPolicyVersion === PRICE
      && value.templates.length === 2 && value.templates.every((item, index) => item.purpose === PURPOSES[index])
      && value.templates[0].templateRequestId !== value.templates[1].templateRequestId)
    const binding = fingerprint(value)
    requireFact(!session.fingerprint || session.fingerprint === binding)
    session.fingerprint = binding
    const templates: RequestMap = {}, requests: RequestMap = {}
    for (const item of value.templates) {
      const source = await getPersonalRequest(session.project, item.templateRequestId, signal)
      if (!current(session)) return
      requireFact(templateMatches(source, session.project, item.templateRequestId, item.purpose))
      const oldSource = session.templates[item.purpose]
      requireFact(!oldSource || selection(source) === selection(oldSource))
      templates[item.purpose] = source
    }
    for (const item of value.templates) {
      const known = session.allocated.get(item.purpose)
      requireFact(!known || item.request?.id === known)
      if (!item.request) { requireFact(!item.attempt); continue }
      session.allocated.set(item.purpose, item.request.id)
      const request = await getPersonalRequest(session.project, item.request.id, signal)
      if (!current(session)) return
      requireFact(liveMatches(request, templates[item.purpose]!, item.request.id))
      // 各次 GET 是独立已提交观测：允许状态前进，但不接受终态回退。
      requireFact(item.request.state !== 'SUCCEEDED' || request.state === 'SUCCEEDED')
      requireFact(item.request.state !== 'FAILED' || request.state === 'FAILED')
      requireFact(item.request.state !== 'RUNNING' || request.state !== 'QUEUED')
      requests[item.purpose] = request
      if (request.state === 'FAILED' || item.attempt?.outcome?.state === 'UNKNOWN') session.stopped = true
    }
    if (value.stop || value.templates.some((item) => item.request?.state === 'FAILED')) session.stopped = true
    completeKnownPost(session, value, requests)
    session.execution = value; session.templates = templates; session.requests = requests; session.fresh = true
    session.error = session.markerUnavailable ? STORAGE_ERROR : session.unknownPost ? UNKNOWN_ERROR : ''
  } catch (failure) { if (current(session)) reject(session, failure) }
  finally { session.reading = false; publish(session); poll(session) }
}
// 同步取得发送所有权，先落拒绝标记再 POST；结果只在 GET 印证固定槽位后展示，未知失败禁止补发。
async function submit(session: Session, purpose: PersonalPurpose): Promise<void> {
  // 在首次 await 前同步取得发送所有权，拦截同一渲染周期内的双击。
  if (!PURPOSES.includes(purpose) || !canSubmit(session, purpose)) return
  const item = session.execution!.templates.find((candidate) => candidate.purpose === purpose)!
  const source = session.templates[purpose]!
  session.writing = true; session.submitted.add(purpose); session.fresh = false; session.error = ''; clearTimer(session); publish(session)
  try {
    // 先保存拒绝标记再发送；导航可能早于成功或失败响应，不能丢失未知提交状态。
    retainStop(session)
    const request = await runPersonalRequest(session.project, session.batch, item.templateRequestId, session.controller.signal)
    if (!current(session)) return
    requireFact(liveMatches(request, source, request.id))
    session.allocated.set(purpose, request.id)
    session.accepted = { purpose, requestId: request.id }
    if (request.state === 'FAILED') session.stopped = true
    // 必须由批次 GET 印证不可变槽位后才展示结果，不能只根据 POST 回包发布建议。
  } catch (failure) {
    if (!current(session)) return
    session.unknownPost = true; session.stopped = true; session.error = UNKNOWN_ERROR
    if (failure instanceof StopMarkerUnavailable) { session.markerUnavailable = true; session.error = STORAGE_ERROR }
    else if (failure instanceof InvalidObservation) { reject(session, failure) }
    else if (failure instanceof PersonalAgentClientError && [401, 403, 404].includes(failure.status)) reject(session, failure)
  } finally {
    session.writing = false; publish(session)
    // POST 失败后不自动重试或恢复；用户手动刷新也只执行 GET。
    if (current(session) && !session.unknownPost) await read(session)
  }
}

// 为 Project/batch 建立可取消会话；切换、卸载或 pagehide 时清理，返回只读恢复与显式用途发送。
export function usePersonalLiveBatch(projectId: string, batchId: string, enabled: boolean) {
  const scope = `${projectId}:${batchId}`
  const sessionRef = useRef<Session | undefined>(undefined)
  const [view, setView] = useState<View>({ scope: '', requests: {}, error: '', busy: false, accessDenied: false, allowed: {} })
  useEffect(() => {
    if (!enabled || !projectId || !batchId) return
    const saved = savedStop(projectId, batchId)
    const session: Session = { scope: `${projectId}:${batchId}`, project: projectId, batch: batchId,
      controller: new AbortController(), active: true, reading: false, writing: false, fresh: false,
      denied: false, stopped: saved.stopped, unknownPost: saved.stopped, markerUnavailable: saved.unavailable,
      templates: {}, requests: {}, error: '',
      allocated: new Map(), submitted: new Set(), notify: () => {} }
    session.notify = () => setView({ scope: session.scope, execution: session.execution,
      requests: { ...session.requests }, error: session.error, busy: session.reading || session.writing, accessDenied: session.denied,
      allowed: { FINDING_EXPLANATION: canSubmit(session, 'FINDING_EXPLANATION'), PR_SUMMARY: canSubmit(session, 'PR_SUMMARY') } })
    sessionRef.current = session
    const hide = () => {
      if (!session.active) return
      session.active = false; session.fresh = false; clearTimer(session); session.controller.abort()
      session.execution = undefined; session.templates = {}; session.requests = {}
      session.notify()
    }
    window.addEventListener('pagehide', hide)
    void read(session)
    return () => { window.removeEventListener('pagehide', hide); session.active = false; clearTimer(session); session.controller.abort() }
  }, [projectId, batchId, enabled])

  const visible = enabled && view.scope === scope
  // 手动恢复只走 GET，未知提交的拒绝状态不会被一次成功读取解除。
  async function refresh() {
    const session = sessionRef.current
    if (enabled && session?.scope === scope) await read(session)
  }
  // 在当前范围调用显式发送，最终条件仍由提交函数即时检查。
  async function run(purpose: PersonalPurpose) {
    const session = sessionRef.current
    if (enabled && session?.scope === scope) await submit(session, purpose)
  }
  return { execution: visible ? view.execution : undefined, requests: visible ? view.requests : {},
    error: visible ? view.error : '', busy: visible && view.busy, accessDenied: visible && view.accessDenied, refresh, run,
    canSubmit: (purpose: PersonalPurpose) => {
      const session = sessionRef.current
      // 每次询问都重新检查当前范围与期限，已经渲染的按钮快照不能延长有效期。
      return visible && session?.scope === scope && canSubmit(session, purpose)
    } }
}

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
type RequestMap = Partial<Record<PersonalPurpose, AgentRequest>>
type View = { scope: string; execution?: PersonalBatchExecution; requests: RequestMap; error: string; busy: boolean;
  readonly accessDenied: boolean; allowed: Partial<Record<PersonalPurpose, boolean>> }
type Session = { scope: string; project: string; batch: string; controller: AbortController; active: boolean;
  reading: boolean; writing: boolean; fresh: boolean; denied: boolean; stopped: boolean; unknownPost: boolean;
  markerUnavailable: boolean; accepted?: { purpose: PersonalPurpose; requestId: string };
  execution?: PersonalBatchExecution; templates: RequestMap; requests: RequestMap; error: string;
  allocated: Map<PersonalPurpose, string>; submitted: Set<PersonalPurpose>; fingerprint?: string;
  timer?: number; notify: () => void }

class InvalidObservation extends Error { }
class StopMarkerUnavailable extends Error { }
function requireFact(condition: unknown): asserts condition { if (!condition) throw new InvalidObservation() }
// Deny-only, tab-local safety state: never a credential, result, or authority grant. Scope is deliberately
// broader than identity. New tabs/site-storage clearing are not covered; durable backend slots remain authoritative.
function stopKey(project: string, batch: string) { return `archguard.agent.live.stop.v1:${project}:${batch}` }
function savedStop(project: string, batch: string) {
  try { return { stopped: window.sessionStorage.getItem(stopKey(project, batch)) !== null, unavailable: false } }
  catch { return { stopped: true, unavailable: true } }
}
function retainStop(session: Session) {
  try {
    const key = stopKey(session.project, session.batch)
    if (window.sessionStorage.getItem(key) !== null) throw new StopMarkerUnavailable()
    window.sessionStorage.setItem(key, '1')
    if (window.sessionStorage.getItem(key) !== '1') throw new StopMarkerUnavailable()
  } catch { throw new StopMarkerUnavailable() }
}
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
function selection(value: AgentRequest) {
  const bindings = value.bindings
  return JSON.stringify([bindings.scanJobId, bindings.reportSha256, bindings.prHeadRevisionId,
    [...bindings.findingIds].sort(), [...bindings.documentVersions].sort((a, b) => a.documentVersionId.localeCompare(b.documentVersionId))
      .map((item) => [item.documentVersionId, item.contentSha256]), bindings.outputSchemaVersion])
}
function templateMatches(value: AgentRequest, project: string, id: string, purpose: PersonalPurpose) {
  return value.id === id && value.projectId === project && value.purpose === purpose
    && (value.state === 'FAILED' || value.state === 'SUCCEEDED')
    && value.bindings.modelProfileVersion === 'disabled-or-test-fake-0.1.0'
    && value.bindings.modelProtocolVersion === 'responses-v1-restricted'
    && value.bindings.modelId === 'deterministic-fake-or-disabled'
    && value.bindings.priceCatalogVersion === 'synthetic-0.1.0' && value.bindings.outputSchemaVersion === '0.1.0'
    && value.bindings.promptVersion === (purpose === 'PR_SUMMARY' ? 'pr-summary-0.1.0' : 'finding-explanation-0.1.0')
}
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
function current(session: Session) { return session.active && !session.controller.signal.aborted }
function clearTimer(session: Session) { if (session.timer !== undefined) { window.clearTimeout(session.timer); session.timer = undefined } }

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
function publish(session: Session) { if (session.active) session.notify() }
function poll(session: Session) {
  clearTimer(session)
  if (!current(session) || session.denied || session.unknownPost) return
  const pending = session.execution?.templates.some((item) => item.request?.state === 'QUEUED' || item.request?.state === 'RUNNING')
    || Object.values(session.requests).some((request) => request.state === 'QUEUED' || request.state === 'RUNNING')
  session.timer = window.setTimeout(() => { void read(session) }, pending ? 1500 : 30000)
}
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
function fingerprint(value: PersonalBatchExecution) {
  const batch = value.batch
  return JSON.stringify([batch.id, batch.projectId, batch.enablementId, batch.approvedBy, batch.approvedAt,
    batch.expiresAt, batch.manifestSha256, batch.maxRequests, batch.maxCostMicrousd,
    value.templates.map((item) => [item.purpose, item.templateRequestId])])
}
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
      // GETs are separate committed observations: progress is allowed, terminal regression is not.
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
async function submit(session: Session, purpose: PersonalPurpose): Promise<void> {
  // Synchronous ownership precedes the first await, including same-render double clicks.
  if (!PURPOSES.includes(purpose) || !canSubmit(session, purpose)) return
  const item = session.execution!.templates.find((candidate) => candidate.purpose === purpose)!
  const source = session.templates[purpose]!
  session.writing = true; session.submitted.add(purpose); session.fresh = false; session.error = ''; clearTimer(session); publish(session)
  try {
    // Persist before the network operation: navigation can happen before an acceptance or failure reply.
    retainStop(session)
    const request = await runPersonalRequest(session.project, session.batch, item.templateRequestId, session.controller.signal)
    if (!current(session)) return
    requireFact(liveMatches(request, source, request.id))
    session.allocated.set(purpose, request.id)
    session.accepted = { purpose, requestId: request.id }
    if (request.state === 'FAILED') session.stopped = true
    // Render only after the batch GET corroborates its immutable slot, never from POST alone.
  } catch (failure) {
    if (!current(session)) return
    session.unknownPost = true; session.stopped = true; session.error = UNKNOWN_ERROR
    if (failure instanceof StopMarkerUnavailable) { session.markerUnavailable = true; session.error = STORAGE_ERROR }
    else if (failure instanceof InvalidObservation) { reject(session, failure) }
    else if (failure instanceof PersonalAgentClientError && [401, 403, 404].includes(failure.status)) reject(session, failure)
  } finally {
    session.writing = false; publish(session)
    // A failed POST is never retried or automatically recovered. Manual refresh is GET only.
    if (current(session) && !session.unknownPost) await read(session)
  }
}

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
  async function refresh() {
    const session = sessionRef.current
    if (enabled && session?.scope === scope) await read(session)
  }
  async function run(purpose: PersonalPurpose) {
    const session = sessionRef.current
    if (enabled && session?.scope === scope) await submit(session, purpose)
  }
  return { execution: visible ? view.execution : undefined, requests: visible ? view.requests : {},
    error: visible ? view.error : '', busy: visible && view.busy, accessDenied: visible && view.accessDenied, refresh, run,
    canSubmit: (purpose: PersonalPurpose) => {
      const session = sessionRef.current
      // Recheck the current scope and deadline when asked; a rendered snapshot cannot extend expiry.
      return visible && session?.scope === scope && canSubmit(session, purpose)
    } }
}

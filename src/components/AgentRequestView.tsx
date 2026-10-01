import { useState } from 'react'
import { api } from '../api/client'
import type { AgentRequest, DocumentVersion, VerifiedCitation } from '../api/agent'
import type { Evidence } from '../api/types'

const failureReasons: Record<NonNullable<AgentRequest['failure']>['code'], string> = {
  MODEL_DISABLED: '模型调用已关闭', MODEL_UNAVAILABLE: '模型当前不可用',
  MODEL_TIMEOUT: '模型调用超时', QUOTA_EXHAUSTED: '额度已耗尽',
  OUTPUT_INVALID: '模型输出无效', CITATION_INVALID: '引用未通过验证',
  AUTHORIZATION_REVOKED: 'Project 授权已失效', INTERNAL_ERROR: 'Agent 请求失败',
}

function Citation({ citation, request }: { citation: VerifiedCitation; request: AgentRequest }) {
  const [detail, setDetail] = useState<string>()
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const documentBinding = request.bindings.documentVersions.find((version) => version.documentVersionId === citation.documentVersionId)
  const sameScope = citation.projectId === request.projectId
    && (citation.source === 'SCANNER_EVIDENCE' ? !!citation.evidenceId && citation.scanJobId === request.bindings.scanJobId
      && citation.reportSha256 === request.bindings.reportSha256 : !!documentBinding && documentBinding.contentSha256 === citation.contentSha256)
  async function resolve() {
    setDetail(undefined); setError(false); setLoading(true)
    if (!sameScope) { setError(true); setLoading(false); return }
    try {
      if (citation.source === 'PROJECT_DOCUMENT') {
        const value = await api<DocumentVersion>(`/api/v1/projects/${request.projectId}/documents/versions/${citation.documentVersionId}`)
        if (value.id !== citation.documentVersionId || value.projectId !== request.projectId || value.contentSha256 !== citation.contentSha256) {
          setError(true); return
        }
        setDetail(value.content)
      } else {
        const value = await api<Evidence>(`/api/v1/projects/${request.projectId}/scan-jobs/${citation.scanJobId}/evidences/${citation.evidenceId}`)
        if (value.id !== citation.evidenceId || value.projectId !== request.projectId || value.jobId !== citation.scanJobId) {
          setError(true); return
        }
        setDetail(`${value.kind} · ${value.summary} · ${value.location.path}:${value.location.startLine}`)
      }
    } catch { setError(true) } finally { setLoading(false) }
  }
  return <li>{!sameScope ? <span>引用范围不匹配</span> : citation.source === 'SCANNER_EVIDENCE'
    ? <button className="quiet" disabled={loading} onClick={() => void resolve()}>核对 Evidence：{citation.label}</button>
    : <><button className="quiet" disabled={loading} onClick={() => void resolve()}>核对文档版本：{citation.label}</button>
      <small className="mono">版本 {citation.documentVersionId} · SHA-256 {citation.contentSha256} · 片段 {citation.fragmentIndex}</small></>}
    {loading && <p role="status">正在核对引用…</p>}
    {detail && <pre className="document-content">{detail}</pre>}{(error || !sameScope) && <small>引用无法验证；引用尚不可在此页验证，请勿将其当作事实。</small>}</li>
}

export function AgentRequestView({ request }: { request: AgentRequest }) {
  return <section className="panel agent-advice" aria-label="Agent 建议状态">
    <p className="eyebrow">模型建议，不参与门禁或 CI</p>
    {request.state === 'QUEUED' && <p role="status">解释请求排队中…</p>}
    {request.state === 'RUNNING' && <p role="status">正在生成并校验建议…</p>}
    {request.state === 'FAILED' && <p role="alert">{request.failure ? failureReasons[request.failure.code] : 'Agent 请求失败'}；扫描与质量门禁不受影响。</p>}
    {request.state === 'SUCCEEDED' && request.result && <>
      <h3>已校验的建议</h3><p>{request.result.conclusion}</p>
      <h4>规则依据</h4><ul>{request.result.ruleBasis.map((item, index) => <li key={index}>{item}</li>)}</ul>
      <h4>说明</h4><ul>{request.result.claims.map((item, index) => <li key={index}>{item}</li>)}</ul>
      <h4>低风险建议</h4><ul>{request.result.suggestions.map((item, index) => <li key={index}>{item.text}（需人工复核）</li>)}</ul>
      <p>Evidence 覆盖：{({ NONE: '证据不足', PARTIAL: '部分覆盖', COMPLETE: '完整覆盖' })[request.result.evidenceCoverage]}</p>
      <h4>平台验证的引用</h4>{request.result.citations.length
        ? <ul>{request.result.citations.map((citation) => <Citation key={`${request.id}:${citation.citationId}`} citation={citation} request={request} />)}</ul>
        : <p>没有可展示的引用。</p>}
    </>}
    <small className="agent-trace">Prompt {request.bindings.promptVersion} · 模型 {request.bindings.modelId} · Schema {request.bindings.outputSchemaVersion} · traceId {request.traceId}</small>
    <details><summary>输入版本与用量</summary>
      <p className="mono">Scan {request.bindings.scanJobId} · 报告 {request.bindings.reportSha256}</p>
      {request.bindings.prHeadRevisionId && <p className="mono">PR 修订 {request.bindings.prHeadRevisionId}</p>}
      <p className="mono">Finding {request.bindings.findingIds.join(', ')}</p>
      <p>模型配置 {request.bindings.modelProfileVersion} · 协议 {request.bindings.modelProtocolVersion} · 价格目录 {request.bindings.priceCatalogVersion}</p>
      {request.bindings.documentVersions.map((version) => <p className="mono" key={version.documentVersionId}>文档版本 {version.documentVersionId} · SHA-256 {version.contentSha256}</p>)}
      {request.usage && <p>输入 Token {request.usage.inputTokens} · 输出 Token {request.usage.outputTokens} · 延迟 {request.usage.latencyMs} ms · 预估费用 {(request.usage.estimatedCostMicrousd / 1000000).toFixed(6)} USD
        {request.usage.actualCostMicrousd != null && ` · 实际费用 ${(request.usage.actualCostMicrousd / 1000000).toFixed(6)} USD`}</p>}
    </details>
  </section>
}

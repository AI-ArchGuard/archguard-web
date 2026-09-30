import { useEffect, useState } from 'react'
import { api, ApiClientError } from '../api/client'
import type { AgentRequest, CreateAgentRequest } from '../api/agent'
import type { Finding, ScanJob } from '../api/types'
import { AgentRequestView } from './AgentRequestView'
import { DocumentVersionPicker } from './DocumentVersionPicker'

export function FindingExplanation({ projectId, job, finding }: { projectId: string; job: ScanJob; finding: Finding }) {
  const [request, setRequest] = useState<AgentRequest>()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [documentVersionIds, setDocumentVersionIds] = useState<string[]>([])
  const [selectingDocuments, setSelectingDocuments] = useState(false)
  const root = `/api/v1/projects/${projectId}/agent/requests`
  useEffect(() => {
    if (!request) return
    let active = true
    const timer = window.setInterval(() => {
      api<AgentRequest>(`${root}/${request.id}`).then((value) => {
        if (active) { setRequest(value); setError('') }
      }).catch((failure: unknown) => {
        if (!active) return
        window.clearInterval(timer)
        if (failure instanceof ApiClientError && (failure.status === 401 || failure.status === 403 || failure.status === 404)) {
          setRequest(undefined); setError('Project 权限已失效，解释结果不再可查看。')
        } else { setError('无法更新解释状态，请稍后重试。') }
      })
    }, request.state === 'QUEUED' || request.state === 'RUNNING' ? 1500 : 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [request, root])

  async function explain() {
    if (job.status !== 'SUCCEEDED' || !job.reportSha256) return
    setError(''); setRequest(undefined); setSubmitting(true)
    const body: CreateAgentRequest = { purpose: 'FINDING_EXPLANATION', scanJobId: job.id,
      reportSha256: job.reportSha256, prHeadRevisionId: null, findingIds: [finding.id], documentVersionIds }
    try {
      const created = await api<AgentRequest>(root, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(body) })
      if (created.projectId !== projectId || created.bindings.scanJobId !== job.id) {
        setError('解释结果范围不匹配，已停止展示。'); return
      }
      setRequest(created)
    } catch (failure) {
      setError(failure instanceof ApiClientError && (failure.status === 401 || failure.status === 403 || failure.status === 404)
        ? '无权请求此 Finding 的解释，或资源不存在。' : '解释请求未完成，请稍后重试。')
    } finally { setSubmitting(false) }
  }

  return <div className="finding-explanation"><button className="quiet" onClick={() => setSelectingDocuments((value) => !value)}>
    {selectingDocuments ? '收起文档选择' : '选择文档版本（可选）'}</button>
    {selectingDocuments && <DocumentVersionPicker projectId={projectId} selected={documentVersionIds} onChange={setDocumentVersionIds} />}
    <button className="quiet" disabled={submitting || job.status !== 'SUCCEEDED' || !job.reportSha256}
    onClick={() => void explain()}>{submitting ? '提交中…' : '解释此 Finding'}</button>
    {error && <p className="state error" role="alert">{error}</p>}
    {request && <AgentRequestView request={request} />}
  </div>
}

import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { ownRole } from '../api/projectRole'
import type { GateEvaluation, PullRequest } from '../api/governance'
import type { Finding, ScanJob } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { useApi } from '../hooks/useApi'
import { useAgentRequest } from '../hooks/useAgentRequest'
import { AgentRequestView } from './AgentRequestView'
import { DocumentVersionPicker } from './DocumentVersionPicker'
import { Failure, Loading } from './States'

export function PrSummary({ projectId, repositoryId, pr, gate }: {
  projectId: string; repositoryId: string; pr: PullRequest; gate?: GateEvaluation
}) {
  const { user } = useAuth()
  const actorId = user?.profile.sub ?? ''
  const role = useApi(() => actorId ? ownRole(projectId, actorId) : Promise.resolve(null), `role:${projectId}:${actorId}`)
  const [findingPage, setFindingPage] = useState(0)
  const trusted = pr.projectId === projectId && pr.repositoryId === repositoryId && !!pr.currentHeadRevisionId
    && !!gate?.candidateJobId && gate.id === pr.currentGateEvaluationId && gate.projectId === projectId
    && gate.repositoryId === repositoryId && gate.targetBranch === pr.targetBranch
  const input = useApi(async () => {
    if (!trusted || role.data !== 'MAINTAINER') return undefined
    const root = `/api/v1/projects/${projectId}/scan-jobs/${gate!.candidateJobId}`
    const [job, findings] = await Promise.all([api<ScanJob>(root), api<Finding[]>(`${root}/findings?page=${findingPage}&size=100`)])
    if (job.id !== gate!.candidateJobId || job.projectId !== projectId || job.repositoryId !== repositoryId
        || job.status !== 'SUCCEEDED' || !job.reportSha256
        || findings.some((finding) => finding.projectId !== projectId || finding.jobId !== job.id)) {
      throw new Error('当前 PR 的扫描范围不可验证。')
    }
    return { job, findings }
  }, `summary-input:${projectId}:${repositoryId}:${pr.currentHeadRevisionId}:${gate?.id}:${trusted}:${role.data}:${findingPage}`)
  const [selected, setSelected] = useState<string[]>([])
  const [documents, setDocuments] = useState<string[]>([])
  const [selectingDocuments, setSelectingDocuments] = useState(false)
  const { request, error, submitting, create } = useAgentRequest(projectId)
  useEffect(() => {
    const timer = window.setInterval(role.reload, 30000)
    return () => window.clearInterval(timer)
  }, [role.reload])
  if (role.loading) return <Loading />
  if (role.error) return <Failure error={role.error} retry={role.reload} />
  if (role.data !== 'MAINTAINER') return <p className="muted">PR 摘要入口仅供 Project Maintainer 使用。</p>
  if (!trusted) return <p className="muted">缺少可信的 PR 修订或当前完成扫描，摘要暂不可用。</p>
  if (input.loading) return <Loading />
  if (input.error) return <Failure error={input.error} retry={input.reload} />
  if (!input.data) return <p className="muted">当前扫描暂不可用。</p>
  const { job, findings } = input.data
  const pending = submitting || request?.state === 'QUEUED' || request?.state === 'RUNNING'
  return <section className="panel"><h2>所选 Finding 的 PR 摘要</h2>
    <p>PR #{pr.externalId} · {pr.headSha.slice(0, 12)} · 最多选择 20 个 Finding。摘要仅覆盖所选扫描结果。</p>
    <div className="list">{findings.map((finding) => <label key={finding.id} className="summary-finding">
      <input type="checkbox" checked={selected.includes(finding.id)} disabled={!!pending || (!selected.includes(finding.id) && selected.length >= 20)}
        onChange={(event) => setSelected(event.target.checked ? [...selected, finding.id] : selected.filter((id) => id !== finding.id))} />
      <span>{finding.ruleId} · {finding.message}</span></label>)}</div>
    {!findings.length && <p>本页没有 Finding。</p>}
    <div className="pager"><button className="quiet" disabled={!!pending || findingPage === 0} onClick={() => setFindingPage(findingPage - 1)}>上一页 Finding</button>
      <span>已选择 {selected.length}/20</span><button className="quiet" disabled={!!pending || findings.length < 100} onClick={() => setFindingPage(findingPage + 1)}>下一页 Finding</button></div>
    <button className="quiet" onClick={() => setSelectingDocuments((value) => !value)}>选择文档版本（可选）</button>
    {selectingDocuments && <DocumentVersionPicker projectId={projectId} selected={documents} onChange={setDocuments} />}
    <button disabled={!!pending || !selected.length} onClick={() => void create({ purpose: 'PR_SUMMARY', scanJobId: job.id,
      reportSha256: job.reportSha256!, prHeadRevisionId: pr.currentHeadRevisionId!, findingIds: selected, documentVersionIds: documents })}>
      {submitting ? '提交中…' : '生成所选 Finding 的 PR 摘要'}</button>
    {error && <p role="alert">{error}</p>}{request && <AgentRequestView request={request} />}
  </section>
}

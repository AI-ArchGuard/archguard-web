import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import type { Evidence, Finding, FindingDisposition, ScanJob } from '../api/types'
import { Empty, Failure, Loading } from '../components/States'
import { useApi } from '../hooks/useApi'

const terminal = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED'])

export function ScanResultPage() {
  const { projectId = '', jobId = '' } = useParams()
  const job = useApi(() => api<ScanJob>(`/api/v1/projects/${projectId}/scan-jobs/${jobId}`), `job:${projectId}:${jobId}`)
  const findings = useApi(() => api<Finding[]>(`/api/v1/projects/${projectId}/scan-jobs/${jobId}/findings?size=100`), `findings:${projectId}:${jobId}`)
  const [evidence, setEvidence] = useState<Evidence>(); const [reason, setReason] = useState(''); const [next, setNext] = useState<FindingDisposition>('FALSE_POSITIVE')
  useEffect(() => { if (job.data && !terminal.has(job.data.status)) { const timer = window.setInterval(job.reload, 2000); return () => window.clearInterval(timer) } }, [job.data, job.reload])
  async function cancel() { await api(`/api/v1/projects/${projectId}/scan-jobs/${jobId}/cancel`, { method: 'POST' }); job.reload() }
  async function showEvidence(id: string) { setEvidence(await api(`/api/v1/projects/${projectId}/scan-jobs/${jobId}/evidences/${id}`)) }
  async function dispose(finding: Finding) { await api(`/api/v1/projects/${projectId}/scan-jobs/${jobId}/findings/${finding.id}/disposition`, { method: 'PUT', body: JSON.stringify({ disposition: next, reason, version: finding.version }) }); setReason(''); findings.reload() }
  if (job.loading) return <main><Loading /></main>; if (job.error) return <main><Failure error={job.error} retry={job.reload} /></main>
  return <main><div className="page-head"><div><p className="eyebrow mono">{jobId}</p><h1>Scan Result</h1></div><Link to={`/projects/${projectId}`}>返回 Project</Link></div>
    <section className="summary"><div><small>状态</small><strong className={`badge ${job.data?.status.toLowerCase()}`}>{job.data?.status}</strong></div><div><small>结论</small><strong>{job.data?.outcome ?? '—'}</strong></div><div><small>尝试</small><strong>{job.data?.attempt}</strong></div><div><small>报告 SHA-256</small><strong className="mono">{job.data?.reportSha256?.slice(0, 16) ?? '—'}</strong></div></section>
    {job.data && !terminal.has(job.data.status) && <button className="danger" onClick={() => void cancel()}>取消扫描</button>}
    {job.data?.failureMessage && <div className="state error">{job.data.failureMessage}</div>}
    <section><h2>Findings</h2>{findings.loading ? <Loading /> : findings.error ? <Failure error={findings.error} retry={findings.reload} /> : !findings.data?.length ? <Empty>本次扫描没有 Finding。</Empty> : findings.data.map((f) => <article className="finding" key={f.id}><header><span className={`severity ${f.severity}`}>{f.severity}</span><strong>{f.ruleId}</strong><span className="badge">{f.disposition}</span></header><p>{f.message}</p>{f.location && <code>{f.location.path}:{f.location.startLine}:{f.location.startColumn}</code>}<div className="evidence-links">{f.evidenceIds.map((id) => <button className="quiet" key={id} onClick={() => void showEvidence(id)}>查看 Evidence</button>)}</div><div className="disposition"><select value={next} onChange={(e) => setNext(e.target.value as FindingDisposition)}><option value="FALSE_POSITIVE">误报</option><option value="RISK_ACCEPTED">接受风险</option><option value="OPEN">重新打开</option></select><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="处置原因（必填）" maxLength={1000} /><button disabled={!reason.trim()} onClick={() => void dispose(f)}>保存处置</button></div></article>)}</section>
    {evidence && <div className="modal" role="dialog" aria-modal="true"><div className="panel"><button className="quiet close" onClick={() => setEvidence(undefined)}>关闭</button><p className="eyebrow">{evidence.kind}</p><h2>Evidence</h2><p>{evidence.summary}</p><code>{evidence.location.path}:{evidence.location.startLine}:{evidence.location.startColumn}</code></div></div>}
  </main>
}

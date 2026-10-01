import { useState } from 'react'
import type { Finding, ScanJob } from '../api/types'
import { AgentRequestView } from './AgentRequestView'
import { DocumentVersionPicker } from './DocumentVersionPicker'
import { useAgentRequest } from '../hooks/useAgentRequest'

export function FindingExplanation({ projectId, job, finding }: { projectId: string; job: ScanJob; finding: Finding }) {
  const { request, error, submitting, create } = useAgentRequest(projectId)
  const [documentVersionIds, setDocumentVersionIds] = useState<string[]>([])
  const [selectingDocuments, setSelectingDocuments] = useState(false)
  async function explain() {
    if (job.status !== 'SUCCEEDED' || !job.reportSha256) return
    await create({ purpose: 'FINDING_EXPLANATION', scanJobId: job.id,
      reportSha256: job.reportSha256, prHeadRevisionId: null, findingIds: [finding.id], documentVersionIds })
  }

  return <div className="finding-explanation"><button className="quiet" onClick={() => setSelectingDocuments((value) => !value)}>
    {selectingDocuments ? '收起文档选择' : '选择文档版本（可选）'}</button>
    {selectingDocuments && <DocumentVersionPicker projectId={projectId} selected={documentVersionIds} onChange={setDocumentVersionIds} />}
    <button className="quiet" disabled={submitting || request?.state === 'QUEUED' || request?.state === 'RUNNING' || job.status !== 'SUCCEEDED' || !job.reportSha256}
    onClick={() => void explain()}>{submitting ? '提交中…' : '解释此 Finding'}</button>
    {error && <p className="state error" role="alert">{error}</p>}
    {request && <AgentRequestView request={request} />}
  </div>
}

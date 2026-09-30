import { useState } from 'react'
import { api, ApiClientError } from '../api/client'
import type { DocumentPage, DocumentVersionPage } from '../api/agent'
import { Loading } from './States'
import { useApi } from '../hooks/useApi'

export function DocumentVersionPicker({ projectId, selected, onChange }: {
  projectId: string; selected: string[]; onChange: (ids: string[]) => void
}) {
  const documents = useApi(() => api<DocumentPage>(`/api/v1/projects/${projectId}/documents?size=100`), `picker-documents:${projectId}`)
  const [documentId, setDocumentId] = useState('')
  const [versionId, setVersionId] = useState('')
  const versions = useApi(() => documentId ? api<DocumentVersionPage>(`/api/v1/projects/${projectId}/documents/${documentId}/versions?size=100`)
    : Promise.resolve(undefined), `picker-versions:${projectId}:${documentId}`)
  if (documents.loading) return <Loading />
  if (documents.error instanceof ApiClientError && (documents.error.status === 403 || documents.error.status === 404)) {
    return <p>文档版本不可访问；解释可不附加文档继续。</p>
  }
  if (documents.error) return <p>文档版本暂不可用；解释可不附加文档继续。</p>
  if (!documents.data?.items.length) return <p className="muted">未选择项目文档；只依据 Scanner Evidence。</p>
  return <div className="document-picker"><label>可选项目文档
    <select value={documentId} onChange={(event) => { setDocumentId(event.target.value); setVersionId('') }}>
      <option value="">不附加文档</option>{documents.data.items.map((item) => <option key={item.id} value={item.id}>{item.documentKey}</option>)}
    </select></label>
    {documentId && <><label>不可变版本<select value={versionId} disabled={versions.loading || !!versions.error}
      onChange={(event) => setVersionId(event.target.value)}><option value="">请选择版本</option>
      {versions.data?.items.map((item) => <option key={item.id} value={item.id}>版本 {item.versionNumber} · {item.contentSha256.slice(0, 12)}</option>)}</select></label>
      {versions.error && <p>无法读取版本列表。</p>}
      <button className="quiet" disabled={!versionId || selected.includes(versionId) || selected.length >= 10}
        onClick={() => onChange([...selected, versionId])}>加入解释依据</button></>}
    {selected.length > 0 && <div><small>已选择 {selected.length}/10 个不可变版本</small>
      <ul>{selected.map((id) => <li key={id}><span className="mono">{id}</span> <button className="quiet"
        onClick={() => onChange(selected.filter((current) => current !== id))}>移除</button></li>)}</ul></div>}
  </div>
}

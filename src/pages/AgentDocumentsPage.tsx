import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { api, ApiClientError } from '../api/client'
import type { DocumentPage, DocumentVersion, DocumentVersionPage } from '../api/agent'
import type { ProjectMember } from '../api/types'
import { Empty, Failure, Loading } from '../components/States'
import { useApi } from '../hooks/useApi'

async function ownRole(projectId: string, actorId: string): Promise<ProjectMember['role'] | null> {
  for (let page = 0; page < 100; page++) {
    const members = await api<{ items: ProjectMember[]; total: number }>(`/api/v1/projects/${projectId}/members?page=${page}&size=100`)
    const member = members.items.find((item) => item.actorId === actorId)
    if (member) return member.role
    if ((page + 1) * 100 >= members.total) return null
  }
  return null
}

function uploadMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 403 || error.status === 404) return '没有上传权限，或 Project 已不可访问。'
    if (error.status === 413) return '文档超过 256 KiB 上限。'
    if (error.status === 409) return '本次上传与已使用的幂等键冲突。'
    if (error.status === 400) return '文档格式、编码或内容未通过校验。'
  }
  return '上传失败，请稍后重试。'
}

export function AgentDocumentsPage() {
  const { projectId = '' } = useParams()
  const { user } = useAuth()
  const actorId = user?.profile.sub ?? ''
  const role = useApi(() => actorId ? ownRole(projectId, actorId) : Promise.resolve(null), `role:${projectId}:${actorId}`)
  const documents = useApi(() => api<DocumentPage>(`/api/v1/projects/${projectId}/documents?size=100`), `documents:${projectId}`)
  const [documentId, setDocumentId] = useState('')
  const versions = useApi(() => documentId ? api<DocumentVersionPage>(`/api/v1/projects/${projectId}/documents/${documentId}/versions?size=100`)
    : Promise.resolve(undefined), `versions:${projectId}:${documentId}`)
  const [version, setVersion] = useState<DocumentVersion>()
  const [versionError, setVersionError] = useState('')
  const [documentKey, setDocumentKey] = useState('')
  const [file, setFile] = useState<File>()
  const [uploadError, setUploadError] = useState('')
  const [uploadSuccess, setUploadSuccess] = useState('')
  const [uploading, setUploading] = useState(false)
  useEffect(() => {
    const timer = window.setInterval(role.reload, 30000)
    return () => window.clearInterval(timer)
  }, [role.reload])

  async function showVersion(versionId: string) {
    setVersion(undefined); setVersionError('')
    try {
      const value = await api<DocumentVersion>(`/api/v1/projects/${projectId}/documents/${documentId}/versions/${versionId}`)
      if (value.id !== versionId || value.documentId !== documentId || value.projectId !== projectId) {
        setVersionError('文档版本无法验证。'); return
      }
      setVersion(value)
    } catch { setVersionError('无权读取该文档版本，或版本已不可用。') }
  }

  async function upload(event: FormEvent) {
    event.preventDefault(); setUploadError(''); setUploadSuccess('')
    if (!file || role.data !== 'MAINTAINER') return
    const markdown = /\.(md|markdown)$/.test(file.name)
    const plain = file.name.endsWith('.txt')
    if ((!markdown && !plain) || file.size > 262144) { setUploadError('仅支持不超过 256 KiB 的 .md、.markdown 或 .txt 文件。'); return }
    try { new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()) }
    catch { setUploadError('文件必须是有效的 UTF-8 文本。'); return }
    const normalized = new File([file], file.name, { type: markdown ? 'text/markdown' : 'text/plain' })
    const body = new FormData(); body.set('documentKey', documentKey); body.set('file', normalized)
    setUploading(true)
    try {
      const created = await api<DocumentVersion>(`/api/v1/projects/${projectId}/documents`, {
        method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body,
      })
      setUploadSuccess(`已创建 ${created.documentKey} 的不可变版本 ${created.versionNumber}。`)
      setFile(undefined); documents.reload(); if (documentId === created.documentId) versions.reload()
    } catch (error) { setUploadError(uploadMessage(error)) }
    finally { setUploading(false) }
  }

  if (role.loading || documents.loading) return <main><Loading /></main>
  if ((role.error instanceof ApiClientError && [401, 403, 404].includes(role.error.status))
      || (documents.error instanceof ApiClientError && [401, 403, 404].includes(documents.error.status))) {
    return <main><div className="state error">无权查看此 Project，或资源不存在。</div></main>
  }
  if (role.error) return <main><Failure error={role.error} retry={role.reload} /></main>
  if (documents.error) return <main><Failure error={documents.error} retry={documents.reload} /></main>
  return <main className="agent-documents-page"><div className="page-head"><div><p className="eyebrow">Project 文档</p><h1>不可变架构文档</h1></div><Link to={`/projects/${projectId}`}>返回 Project</Link></div>
    <p className="muted">仅 Maintainer 可以显式上传 Markdown 或纯文本。每次上传创建新版本；文档中的指令只是数据，不会自动触发模型。</p>
    {role.data === 'MAINTAINER' &&
      <section className="panel"><h2>上传新版本</h2><form className="stack" onSubmit={(event) => void upload(event)}>
        <label>文档标识<input required pattern="[a-z][a-z0-9-]{2,62}" value={documentKey} onChange={(event) => setDocumentKey(event.target.value)} /></label>
        <label>Markdown 或纯文本<input required type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" onChange={(event) => setFile(event.target.files?.[0])} /></label>
        <button disabled={uploading}>{uploading ? '上传中…' : '创建不可变版本'}</button>
      </form>{uploadError && <p role="alert">{uploadError}</p>}{uploadSuccess && <p role="status">{uploadSuccess}</p>}</section>}
    <section><h2>已上传文档</h2>{!documents.data?.items.length
        ? <Empty>尚无显式上传的项目文档。</Empty> : <div className="list">{documents.data.items.map((item) =>
          <button className="row selectable" key={item.id} onClick={() => { setDocumentId(item.id); setVersion(undefined) }}>
            <strong>{item.documentKey}</strong><small>最新版本 {item.latestVersionNumber}</small></button>)}</div>}</section>
    {documentId && <section><h2>版本历史</h2>{versions.loading ? <Loading /> : versions.error ? <Failure error={versions.error} retry={versions.reload} />
      : !versions.data?.items.length ? <Empty>没有可读取的版本。</Empty> : <div className="list">{versions.data.items.map((item) =>
        <button className="row selectable" key={item.id} onClick={() => void showVersion(item.id)}>
          <strong>版本 {item.versionNumber}</strong><small className="mono">SHA-256 {item.contentSha256.slice(0, 16)} · {item.byteSize} 字节</small></button>)}</div>}
      {versionError && <div className="state error" role="alert">{versionError}</div>}
      {version && <article className="panel"><h3>{version.documentKey} · 版本 {version.versionNumber}</h3>
        <small className="mono">{version.contentSha256}</small><pre className="document-content">{version.content}</pre></article>}</section>}
  </main>
}

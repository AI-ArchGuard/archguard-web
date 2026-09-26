import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import type { Project, Repository, ScanJob } from '../api/types'
import { Empty, Failure, Loading } from '../components/States'
import { useApi } from '../hooks/useApi'

export function ProjectPage() {
  const { projectId = '' } = useParams(); const project = useApi(() => api<Project>(`/api/v1/projects/${projectId}`), `project:${projectId}`)
  const repositories = useApi(() => api<Repository[]>(`/api/v1/projects/${projectId}/repositories`), `repositories:${projectId}`)
  const jobs = useApi(() => api<ScanJob[]>(`/api/v1/projects/${projectId}/scan-jobs?size=100`), `jobs:${projectId}`)
  const [repository, setRepository] = useState({ key: '', name: '', mountPath: '' }); const [versionId, setVersionId] = useState(''); const [repositoryId, setRepositoryId] = useState('')
  async function addRepository(e: FormEvent) { e.preventDefault(); await api(`/api/v1/projects/${projectId}/repositories`, { method: 'POST', body: JSON.stringify(repository) }); setRepository({ key: '', name: '', mountPath: '' }); repositories.reload() }
  async function submit(e: FormEvent) { e.preventDefault(); await api(`/api/v1/projects/${projectId}/scan-jobs`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ repositoryId, ruleSetVersionId: versionId }) }); jobs.reload() }
  if (project.loading) return <main><Loading /></main>; if (project.error) return <main><Failure error={project.error} retry={project.reload} /></main>
  return <main><div className="page-head"><div><p className="eyebrow">{project.data?.key}</p><h1>{project.data?.name}</h1></div><Link to="/projects">返回 Projects</Link></div>
    <div className="split"><section><h2>Repositories</h2><form className="stack panel" onSubmit={(e) => void addRepository(e)}><label>标识<input required value={repository.key} onChange={(e) => setRepository({ ...repository, key: e.target.value })} /></label><label>名称<input required value={repository.name} onChange={(e) => setRepository({ ...repository, name: e.target.value })} /></label><label>受控挂载相对路径<input required value={repository.mountPath} onChange={(e) => setRepository({ ...repository, mountPath: e.target.value })} placeholder="samples/order-service" /></label><button>注册目录</button></form>
      {repositories.loading ? <Loading /> : repositories.error ? <Failure error={repositories.error} retry={repositories.reload} /> : !repositories.data?.length ? <Empty>还没有 Repository。</Empty> : <div className="list">{repositories.data.map((r) => <div className="row" key={r.id}><div><strong>{r.name}</strong><small>{r.mountPath}</small></div><div className="row-actions"><Link to={`/projects/${projectId}/repositories/${r.id}/rules`}>管理规则</Link><Link to={`/projects/${projectId}/repositories/${r.id}/governance`}>持续治理</Link></div></div>)}</div>}</section>
      <section><h2>提交扫描</h2><form className="stack panel" onSubmit={(e) => void submit(e)}><label>Repository<select required value={repositoryId} onChange={(e) => setRepositoryId(e.target.value)}><option value="">请选择</option>{repositories.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label>RuleSet Version ID<input required value={versionId} onChange={(e) => setVersionId(e.target.value)} /></label><button>提交 ScanJob</button></form>
      <h2>扫描历史</h2>{jobs.loading ? <Loading /> : jobs.error ? <Failure error={jobs.error} retry={jobs.reload} /> : !jobs.data?.length ? <Empty>还没有扫描。</Empty> : <div className="list">{jobs.data.map((j) => <Link className="row" key={j.id} to={`/projects/${projectId}/scan-jobs/${j.id}`}><span className={`badge ${j.status.toLowerCase()}`}>{j.status}</span><span>{j.outcome ?? '—'}</span><small>{new Date(j.createdAt).toLocaleString()}</small></Link>)}</div>}</section></div></main>
}

import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import type { Repository, RuleSet, RuleSetVersion } from '../api/types'
import { Empty, Failure, Loading } from '../components/States'
import { useApi } from '../hooks/useApi'

export function RuleSetsPage() {
  const { projectId = '', repositoryId = '' } = useParams()
  const repository = useApi(() => api<Repository>(`/api/v1/projects/${projectId}/repositories/${repositoryId}`), `repository:${projectId}:${repositoryId}`)
  const rules = useApi(() => api<RuleSet[]>(`/api/v1/projects/${projectId}/repositories/${repositoryId}/rule-sets`), `rules:${projectId}:${repositoryId}`)
  const [meta, setMeta] = useState({ key: '', name: '' }); const [selected, setSelected] = useState(''); const [versions, setVersions] = useState<RuleSetVersion[]>([])
  const [yaml, setYaml] = useState('')
  async function create(e: FormEvent) { e.preventDefault(); await api(`/api/v1/projects/${projectId}/repositories/${repositoryId}/rule-sets`, { method: 'POST', body: JSON.stringify(meta) }); setMeta({ key: '', name: '' }); rules.reload() }
  async function choose(id: string) { setSelected(id); setVersions(await api(`/api/v1/projects/${projectId}/repositories/${repositoryId}/rule-sets/${id}/versions`))
    if (!yaml && repository.data) setYaml(`version: 0.1.0\nproject:\n  identity: ${repository.data.scannerIdentity}\n  name: ${repository.data.name}\nfailOn: high\nrules:\n  - id: archguard.dependency-cycle\n    parameters:\n      scope: component\n`) }
  async function publish(e: FormEvent) { e.preventDefault(); const value = await api<RuleSetVersion>(`/api/v1/projects/${projectId}/repositories/${repositoryId}/rule-sets/${selected}/versions`, { method: 'POST', body: JSON.stringify({ yaml }) }); setVersions([value, ...versions]) }
  return <main><div className="page-head"><div><p className="eyebrow">{repository.data?.scannerIdentity}</p><h1>RuleSets</h1></div><Link to={`/projects/${projectId}`}>返回 Project</Link></div>
    <div className="split"><section><h2>规则集</h2><form className="stack panel" onSubmit={(e) => void create(e)}><label>标识<input required value={meta.key} onChange={(e) => setMeta({ ...meta, key: e.target.value })} /></label><label>名称<input required value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} /></label><button>创建 RuleSet</button></form>
      {rules.loading ? <Loading /> : rules.error ? <Failure error={rules.error} retry={rules.reload} /> : !rules.data?.length ? <Empty>还没有规则集。</Empty> : <div className="list">{rules.data.map((r) => <button className={`row selectable ${selected === r.id ? 'selected' : ''}`} key={r.id} onClick={() => void choose(r.id)}><strong>{r.name}</strong><small>{r.key}</small></button>)}</div>}</section>
      <section><h2>不可变版本</h2>{selected ? <form className="stack" onSubmit={(e) => void publish(e)}><label>Rules YAML<textarea className="editor" spellCheck={false} required value={yaml} onChange={(e) => setYaml(e.target.value)} /></label><button>验证并发布版本</button></form> : <Empty>先选择一个 RuleSet。</Empty>}
        {versions.map((v) => <article className="version" key={v.id}><div><strong>v{v.version}</strong><span className="mono">{v.id}</span></div><small>Scanner {v.scannerVersion} · Schema {v.schemaVersion} · {v.sha256.slice(0, 12)}</small></article>)}</section></div></main>
}

import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Project } from '../api/types'
import { Empty, Failure, Loading } from '../components/States'
import { useApi } from '../hooks/useApi'

export function ProjectsPage() {
  const projects = useApi(() => api<{ items: Project[] }>('/api/v1/projects?size=100'), 'projects')
  const [key, setKey] = useState(''); const [name, setName] = useState(''); const [saving, setSaving] = useState(false)
  async function create(event: FormEvent) { event.preventDefault(); setSaving(true)
    try { await api('/api/v1/projects', { method: 'POST', body: JSON.stringify({ key, name }) }); setKey(''); setName(''); projects.reload() }
    finally { setSaving(false) } }
  return <main><div className="page-head"><div><p className="eyebrow">Workspace</p><h1>Projects</h1></div></div>
    <section className="panel"><h2>新建 Project</h2><form className="inline-form" onSubmit={(e) => void create(e)}>
      <label>标识<input required pattern="[a-z](?:[a-z0-9]|-){2,62}" value={key} onChange={(e) => setKey(e.target.value)} placeholder="order-service" /></label>
      <label>名称<input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Order Service" /></label>
      <button disabled={saving}>{saving ? '创建中…' : '创建'}</button></form></section>
    <section><h2>可访问的 Projects</h2>{projects.loading ? <Loading /> : projects.error ? <Failure error={projects.error} retry={projects.reload} />
      : !projects.data?.items.length ? <Empty>还没有 Project。</Empty> : <div className="cards">{projects.data.items.map((p) =>
        <Link className="card" key={p.id} to={`/projects/${p.id}`}><span className="mono">{p.key}</span><h3>{p.name}</h3><small>版本 {p.version}</small></Link>)}</div>}</section></main>
}

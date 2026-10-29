// Project 列表与创建页：读取可访问项目，创建成功后刷新列表；最终访问权限由服务端判断。
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Project } from '../api/types'
import { Empty, Failure, Loading } from '../components/States'
import { useApi } from '../hooks/useApi'

// 读取当前可访问 Project，维护新建表单和提交中的按钮状态。
export function ProjectsPage() {
  const projects = useApi(() => api<{ items: Project[] }>('/api/v1/projects?size=100'), 'projects')
  const [key, setKey] = useState(''); const [name, setName] = useState(''); const [saving, setSaving] = useState(false)
  // 提交项目元数据，成功后清空输入并刷新；无论成功失败都解除保存状态。
  async function create(event: FormEvent) { event.preventDefault(); setSaving(true)
    try { await api('/api/v1/projects', { method: 'POST', body: JSON.stringify({ key, name }) }); setKey(''); setName(''); projects.reload() }
    finally { setSaving(false) } }
  return <main><div className="page-head"><div><p className="eyebrow">Workspace</p><h1>Projects</h1></div></div>
    <section><h2>可访问的 Projects</h2>{projects.loading ? <Loading /> : projects.error ? <Failure error={projects.error} retry={projects.reload} />
      : !projects.data?.items.length ? <Empty>还没有 Project。</Empty> : <div className="cards">{projects.data.items.map((p) =>
        <Link className="card" key={p.id} to={`/projects/${p.id}`}><span className="mono">{p.key}</span><h3>{p.name}</h3><small>版本 {p.version}</small></Link>)}</div>}</section>
    <details className="management-disclosure"><summary>新建 Project</summary><form className="inline-form" onSubmit={(e) => void create(e)}>
      <label>标识<input required pattern="[a-z](?:[a-z0-9]|-){2,62}" value={key} onChange={(e) => setKey(e.target.value)} placeholder="order-service" /></label>
      <label>名称<input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Order Service" /></label>
      <button disabled={saving}>{saving ? '创建中…' : '创建'}</button></form></details></main>
}

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { CredentialClientError, deleteCredential, getCredentialStatus, saveCredential, type CredentialStatus } from '../api/credentials'

export function CredentialSettingsPage() {
  const { user } = useAuth()
  return <CredentialSettings key={user?.profile.sub} />
}

function CredentialSettings() {
  const [status, setStatus] = useState<CredentialStatus>()
  const [error, setError] = useState<CredentialClientError>()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const input = useRef<HTMLInputElement | null>(null)
  const pending = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const mutating = useRef(false)
  const attachInput = useCallback((node: HTMLInputElement | null) => {
    if (input.current && input.current !== node) input.current.value = ''
    input.current = node
  }, [])
  const cancelRequests = useCallback(() => {
    ++generation.current; pending.current?.abort(); if (input.current) input.current.value = ''
  }, [])

  useEffect(() => {
    const current = ++generation.current
    const controller = new AbortController(); pending.current = controller
    void getCredentialStatus(controller.signal).then(value => {
      if (generation.current === current) setStatus(value)
    }).catch((failure: unknown) => {
      if (generation.current === current) setError(failure instanceof CredentialClientError ? failure : new CredentialClientError(0))
    }).finally(() => { if (generation.current === current) setLoading(false) })
    return cancelRequests
  }, [revision, cancelRequests])

  useEffect(() => {
    function clear() { if (input.current) input.current.value = ''; pending.current?.abort() }
    window.addEventListener('pagehide', clear)
    return () => { clear(); window.removeEventListener('pagehide', clear) }
  }, [])

  function refresh() {
    if (mutating.current) return
    if (input.current) input.current.value = ''
    setStatus(undefined); setError(undefined); setLoading(true); setNotice(''); setConfirmed(false)
    setRevision(value => value + 1)
  }

  async function mutate(kind: 'write' | 'delete', event?: FormEvent) {
    event?.preventDefault()
    const key = kind === 'write' ? input.current?.value ?? '' : ''
    if (input.current) input.current.value = '' // Clear before awaiting authentication/network, including failures.
    if (mutating.current || !status || (kind === 'delete' && (!confirmed || !status.configured))) return
    if (kind === 'write' && !/^[A-Za-z0-9_-]{16,256}$/.test(key)) { setError(new CredentialClientError(400)); return }
    mutating.current = true; setBusy(true); setError(undefined); setNotice(''); setConfirmed(false)
    const current = generation.current
    const controller = new AbortController(); pending.current?.abort(); pending.current = controller
    try {
      const value = await (kind === 'write' ? saveCredential(key, controller.signal) : deleteCredential(controller.signal))
      if (generation.current !== current) return
      setStatus(value)
      setNotice(kind === 'write' ? '已加密保存；未验证 Key 有效性，也未开启模型调用。' : '已删除本地保存的 Key；如需撤销，请到 DeepSeek 控制台操作。')
    } catch (failure) {
      if (generation.current !== current) return
      setStatus(undefined) // Outcome may be unknown; never present stale metadata as current.
      setError(failure instanceof CredentialClientError ? failure : new CredentialClientError(0))
    } finally {
      mutating.current = false
      if (generation.current === current) setBusy(false)
    }
  }

  return <main className="credentials-page"><div className="page-head"><div><p className="eyebrow">Personal deployment</p>
    <h1>DeepSeek API Key</h1><p className="muted">仅部署所有者可管理。加密保存在后端，重启后保留；浏览器不保存或回显。</p></div></div>
    <section className="panel stack"><h2>凭据状态</h2>
      {loading ? <p role="status">正在读取状态…</p> : status ? <>
        <p className="badge">{status.configured ? '已配置（有效性未验证）' : '未配置'}</p>
        {status.configured && <p className="muted">版本 <span className="mono">{status.credentialVersion}</span><br />更新时间 {status.updatedAt}</p>}
      </> : <p>当前状态未确认，不会自动重试写入。</p>}
      {error && <div className="state error" role="alert">{error.message}{error.traceId && <small className="agent-trace">traceId: {error.traceId}</small>}</div>}
      {notice && <p role="status">{notice}</p>}
      <button className="quiet" disabled={busy} onClick={refresh}>手动刷新状态</button>
    </section>
    {status && <section className="panel stack"><h2>{status.configured ? '替换 Key' : '添加 Key'}</h2>
      <form className="stack" autoComplete="off" noValidate onSubmit={event => void mutate('write', event)}>
        <label>新的 DeepSeek API Key<input ref={attachInput} type="password" name="deepseek-key" maxLength={256}
          autoComplete="off" spellCheck={false} disabled={busy} aria-describedby="credential-warning" /></label>
        <p id="credential-warning" className="muted">请先撤销在聊天或日志中暴露的 Key，再输入新 Key。提交后会立即清空输入，保存不会测试账户、查询余额或产生模型费用。</p>
        <button disabled={busy}>{busy ? '处理中…' : status.configured ? '加密保存并替换' : '加密保存 Key'}</button>
      </form>
      {status.configured && <div className="stack"><h2>删除本地 Key</h2><p className="muted">只删除本部署保存的凭据，不撤销 DeepSeek 账户 Key，不清除历史解释或审计。</p>
        <label className="summary-finding"><input type="checkbox" checked={confirmed} disabled={busy}
          onChange={event => setConfirmed(event.target.checked)} />我确认删除本部署保存的 Key</label>
        <button className="danger" disabled={busy || !confirmed} onClick={() => void mutate('delete')}>删除本地 Key</button>
      </div>}
    </section>}
    <p className="muted">真实模型调用仍需独立启用记录与费用授权；此页面不改变扫描、Finding 或 PASS/FAIL。</p>
  </main>
}

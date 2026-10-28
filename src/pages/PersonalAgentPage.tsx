// 个人验收协调页：分开读取风险确认、Project 设置、凭据元数据和批次，区分管理、费用批准与显式真实发送。
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getCredentialStatus, type CredentialStatus } from '../api/credentials'
import { acknowledgePersonalRisk, getPersonalEnablement, getPersonalRole, getPersonalSettings, PersonalAgentClientError,
  revokePersonalEnablement, updatePersonalSettings, type PersonalEnablement, type PersonalSettingsSnapshot,
  type PersonalBatch } from '../api/personalAgent'
import { personalAgentEntryEnabled } from '../personalAgentEntry'
import { PersonalEnablementForm } from '../components/PersonalEnablementForm'
import { PersonalBatchPanel } from '../components/PersonalBatchPanel'
import { PersonalLivePanel } from '../components/PersonalLivePanel'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// 先检查展示开关、身份与 Project ID，再按 Project/身份挂载独立协调状态。
export function PersonalAgentPage() {
  const { projectId = '' } = useParams(); const { user } = useAuth()
  if (!personalAgentEntryEnabled()) return <main><h1>个人真实验收入口已关闭</h1><p>扫描与质量门禁继续可用。</p></main>
  if (!user || !uuid.test(projectId)) return <main><p role="alert">无权访问此 Project 或记录不存在。</p></main>
  return <PersonalAgent key={`${projectId}:${user.profile.sub}`} projectId={projectId} actorId={user.profile.sub} />
}

// 管理当前范围的元数据及写操作；代次、取消信号与同步锁共同阻止迟到响应和重复提交。
function PersonalAgent({ projectId, actorId }: { projectId: string; actorId: string }) {
  const [settings, setSettings] = useState<PersonalSettingsSnapshot>()
  const [credential, setCredential] = useState<CredentialStatus>()
  const [role, setRole] = useState<string | null>(null)
  const [approval, setApproval] = useState<PersonalEnablement>()
  const [approvalId, setApprovalId] = useState('')
  const [batch, setBatch] = useState<PersonalBatch>()
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false)
  const [error, setError] = useState<PersonalAgentClientError>(), [notice, setNotice] = useState('')
  const [permissionLost, setPermissionLost] = useState(false)
  const [reload, setReload] = useState(0)
  // 代次在切换/离页时递增；取消只是浏览器等待结束，不能撤销已到达后台的写入。
  const generation = useRef(0), pending = useRef<AbortController | null>(null), mutating = useRef(false)

  const clearMetadata = useCallback(() => {
    setSettings(undefined); setCredential(undefined); setRole(null); setApproval(undefined); setApprovalId(''); setBatch(undefined)
  }, [])
  const cancelPending = useCallback(() => {
    ++generation.current
    pending.current?.abort()
  }, [])
  const handleDenied = useCallback(() => {
    cancelPending(); mutating.current = false
    clearMetadata(); setBusy(false); setLoading(false); setError(undefined); setNotice(''); setPermissionLost(true)
  }, [cancelPending, clearMetadata])

  useEffect(() => {
    const current = ++generation.current; const controller = new AbortController(); pending.current = controller
    void (async () => {
      const [value, currentRole, key] = await Promise.all([
        getPersonalSettings(projectId, controller.signal), getPersonalRole(projectId, actorId, controller.signal),
        getCredentialStatus(controller.signal).catch(() => undefined),
      ])
      if (!currentRole) throw new PersonalAgentClientError(404)
      const selected = value.value.enablementId ? await getPersonalEnablement(projectId, value.value.enablementId, controller.signal) : undefined
      if (generation.current !== current || controller.signal.aborted) return
      setSettings(value); setRole(currentRole); setCredential(key); setApproval(selected); setApprovalId(selected?.id ?? '')
    })().catch((failure: unknown) => {
      if (generation.current !== current || controller.signal.aborted) return
      clearMetadata(); setError(failure instanceof PersonalAgentClientError ? failure : new PersonalAgentClientError(0))
    }).finally(() => { if (generation.current === current && !controller.signal.aborted) setLoading(false) })
    return () => { cancelPending(); controller.abort() }
  }, [projectId, actorId, reload, clearMetadata, cancelPending])

  useEffect(() => {
    const hide = () => { cancelPending(); mutating.current = false; setBusy(false); setLoading(false);
      clearMetadata(); setNotice('已离开页面；浏览器取消不能撤回已送达后端的操作。') }
    window.addEventListener('pagehide', hide)
    return () => window.removeEventListener('pagehide', hide)
  }, [clearMetadata, cancelPending])

  // 既要 Project Maintainer，也要能通过部署所有者凭据元数据边界；后端授权始终权威。
  const canManage = !!settings && role === 'MAINTAINER' && !!credential
  // 顺序执行一个管理操作；写入失败或权限丢失时撤下旧元数据，保留固定错误且不自动补写。
  async function perform<T>(operation: (signal: AbortSignal) => Promise<T>, accept: (value: T) => void, write = false) {
    if (mutating.current) return
    mutating.current = true; setBusy(true); setError(undefined); setNotice('')
    const current = generation.current; const controller = new AbortController(); pending.current?.abort(); pending.current = controller
    try {
      const value = await operation(controller.signal)
      if (generation.current !== current || controller.signal.aborted) return
      accept(value)
    } catch (failure) {
      if (generation.current !== current || controller.signal.aborted) return
      const safe = failure instanceof PersonalAgentClientError ? failure : new PersonalAgentClientError(0)
      if (write || [401, 403, 404].includes(safe.status)) clearMetadata()
      setError(safe)
    } finally { if (generation.current === current) { mutating.current = false; setBusy(false) } }
  }
  // 人工重新读取配置前清空元数据与提示，避免把旧权限/批准状态作为当前事实。
  function refresh() {
    if (mutating.current) return
    clearMetadata(); setLoading(true); setError(undefined); setNotice(''); setPermissionLost(false); setReload(value => value + 1)
  }
  // 风险确认变化后清除已选择批次，要求重新核对对应的费用批准。
  function changedApproval(value: PersonalEnablement) { setApproval(value); setApprovalId(value.id); setBatch(undefined) }
  // 发送资格需设置、凭据版本与当前确认一致；批次及有效期由下层在点击时再次核对。
  const effective = !!settings?.value.enabled && settings.value.modelCallsAvailable && !!credential?.configured
    && !!approval && !approval.revoked && approval.id === settings.value.enablementId
    && approval.credentialVersion === credential.credentialVersion
    && approval.priceCatalogVersion === 'deepseek-flash-context-peak-usd-2026-10-15'

  return <main className="stack"><div className="page-head"><div><p className="eyebrow">个人本机 · 合成数据限定</p>
    <h1>个人合成真实验收</h1><p className="muted">使用 DeepSeek 官方托管 API，无需部署模型。风险确认、费用批准与实际发送是三项独立操作。</p></div>
    <Link to={`/projects/${projectId}`}>返回 Project</Link></div>
    <section className="panel stack"><h2>固定边界</h2>
      <p>每次最多 USD 0.35，总授权 USD 0.70；每次保守预留 USD 0.316373。仅解释、摘要各一次，失败即停，不重试或补发。</p>
      <p className="muted">完整请求最多 6,000 字节，输出最多 1,500 Token；输入 8,000 是调用后验收阈值，不是发送前保证。本地费用控制不是厂商账户强制限费。</p>
      <p className="muted">仅使用批准的合成证据与文档，不发送源码、客户资料或 Key。模型建议不改变 Finding、PASS/FAIL 或 CI。</p>
    </section>
    <section className="panel stack"><h2>当前配置（只读，不测试 Key）</h2>
      {loading ? <p role="status">正在读取个人配置…</p> : settings ? <>
        <p>Project 模型入口：{settings.value.enabled ? '开启' : '关闭'}；后台调用条件：{settings.value.modelCallsAvailable ? '本地配置可用，发送时仍须逐次检查' : '不可用或已关闭'}</p>
        <p>Key：{credential ? credential.configured ? '已加密配置，有效性未验证' : '未配置' : '状态不可读；不具备所有者写权限或管理不可用'}</p>
        {credential?.configured && <p className="mono">凭据版本 {credential.credentialVersion}</p>}
        <Link to="/settings/model-credentials">管理已加密的 API Key</Link>
        {!canManage && <p className="muted">当前仅可读取。写操作同时需要部署所有者与本 Project Maintainer。</p>}
      </> : <p>配置状态未确认；请手动刷新，不会自动重试写入。</p>}
      <button className="quiet" disabled={busy} onClick={refresh}>手动刷新个人配置</button>
      {permissionLost && <p className="state error" role="alert">Project 权限已失效，历史结果已清除；请重新核对权限。</p>}
      {error && <p className="state error" role="alert">{error.message}{error.traceId && <small className="agent-trace">traceId: {error.traceId}</small>}</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
    {settings && <section className="panel stack"><h2>风险确认与 Project 开关</h2>
      <label>启用确认 ID<input value={approvalId} maxLength={36} disabled={busy} onChange={event => {
        setApprovalId(event.target.value); setApproval(undefined); setBatch(undefined)
      }} /></label>
      <button className="quiet" disabled={busy || !uuid.test(approvalId)} onClick={() => void perform(
        signal => getPersonalEnablement(projectId, approvalId, signal), changedApproval)}>读取启用确认</button>
      {approval && <div><p className="mono">风险确认 {approval.id}</p><p>有效期至 {approval.expiresAt}；{approval.revoked ? '已撤销' : '未撤销'}。此记录不是费用授权。</p></div>}
      {canManage && <>
        <div className="row-actions"><button disabled={busy || !approval || approval.revoked || !credential?.configured
          || approval.credentialVersion !== credential.credentialVersion} onClick={() => {
          if (!approval || !settings) return
          void perform(signal => updatePersonalSettings(projectId, { enabled: true, enablementId: approval.id }, settings.etag, signal), value => {
            setSettings(value); setBatch(undefined); setNotice('Project 入口已更新；没有发起模型调用。')
          }, true)
        }}>以此确认开启 Project</button>
        <button className="danger" disabled={busy} onClick={() => void perform(
          signal => updatePersonalSettings(projectId, { enabled: false }, settings.etag, signal), value => {
            setSettings(value); setBatch(undefined); setNotice('Project 入口已关闭；不能撤回已发送的数据或在途请求。')
          }, true)}>关闭 Project 模型入口</button>
        <button className="danger" disabled={busy || !approval || approval.revoked} onClick={() => {
          if (!approval) return
          void perform(signal => revokePersonalEnablement(projectId, approval.id, signal), () => {
            clearMetadata(); setNotice('风险确认已撤销；请手动刷新配置。历史费用保留，不能撤回在途请求。')
          }, true)
        }}>撤销此风险确认</button></div>
        <PersonalEnablementForm busy={busy} credentialVersion={credential?.configured ? credential.credentialVersion : undefined}
          onDirty={() => { setApproval(undefined); setBatch(undefined) }} onSubmit={input => perform(
            signal => acknowledgePersonalRisk(projectId, input, signal), value => {
              changedApproval(value); setNotice('风险确认已保存；Project 未自动开启，未批准费用，也未调用模型。')
            }, true)} />
      </>}
    </section>}
    {settings && <PersonalBatchPanel key={`${settings.etag}:${approval?.id ?? ''}`} projectId={projectId} enablement={approval}
      canManage={canManage} disabled={busy} onBatch={setBatch} onDenied={handleDenied} />}
    {settings && batch && <PersonalLivePanel key={batch.id} projectId={projectId} batch={batch}
      canSend={canManage && effective && batch.enablementId === approval?.id}
      authorizationExpiresAt={approval?.expiresAt} priceExpiresAt={approval?.priceCatalogExpiresAt} onDenied={handleDenied} />}
    <p className="muted">关闭或撤销不能撤回在途调用，不退款或恢复次数；退出、Project 或账号切换会取消浏览器等待，但不是后台撤销。</p>
  </main>
}

import { useEffect, useRef, useState } from 'react'
import { approvePersonalBatch, getPersonalBatch, getPersonalRequest, PersonalAgentClientError, previewPersonalBatch,
  revokePersonalBatch, type PersonalBatch, type PersonalBatchPreview, type PersonalEnablement } from '../api/personalAgent'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export function PersonalBatchPanel({ projectId, enablement, canManage, disabled, onBatch, onDenied }: {
  projectId: string; enablement?: PersonalEnablement; canManage: boolean; disabled: boolean
  onBatch: (value: PersonalBatch | undefined) => void; onDenied: () => void
}) {
  const [batchId, setBatchId] = useState(''), [loaded, setLoaded] = useState<PersonalBatch>()
  const [explanation, setExplanation] = useState(''), [summary, setSummary] = useState('')
  const [preview, setPreview] = useState<PersonalBatchPreview>()
  const [inventory, setInventory] = useState(''), [expiry, setExpiry] = useState(''), [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState<PersonalAgentClientError>()
  const generation = useRef(0), pending = useRef<AbortController | null>(null), working = useRef(false)
  useEffect(() => () => { ++generation.current; pending.current?.abort() }, [])
  const locked = disabled || busy
  async function operate<T>(action: (signal: AbortSignal) => Promise<T>, accept: (value: T) => void) {
    if (working.current || disabled) return
    working.current = true; setBusy(true); setError(undefined)
    const current = generation.current; const controller = new AbortController(); pending.current?.abort(); pending.current = controller
    try {
      const value = await action(controller.signal)
      if (current === generation.current && !controller.signal.aborted) accept(value)
    } catch (failure) {
      if (current !== generation.current || controller.signal.aborted) return
      const safe = failure instanceof PersonalAgentClientError ? failure : new PersonalAgentClientError(0)
      setError(safe); setPreview(undefined); setConsent(false); setLoaded(undefined); onBatch(undefined)
      if ([401, 403, 404].includes(safe.status)) onDenied()
    } finally { working.current = false; if (current === generation.current) setBusy(false) }
  }
  function invalidate() { setPreview(undefined); setConsent(false); setLoaded(undefined); onBatch(undefined) }
  function receive(value: PersonalBatch) { setLoaded(value); setBatchId(value.id); setConsent(false); onBatch(value) }
  function verify() {
    if (!uuid.test(explanation) || !uuid.test(summary) || explanation === summary) { setError(new PersonalAgentClientError(400)); return }
    setPreview(undefined); setConsent(false)
    void operate(async signal => {
      for (const [id, purpose] of [[explanation, 'FINDING_EXPLANATION'], [summary, 'PR_SUMMARY']] as const) {
        const request = await getPersonalRequest(projectId, id, signal)
        if (request.projectId !== projectId || request.id !== id || request.purpose !== purpose
            || !['SUCCEEDED', 'FAILED'].includes(request.state) || request.bindings.modelProfileVersion !== 'disabled-or-test-fake-0.1.0'
            || request.bindings.modelId !== 'deterministic-fake-or-disabled' || request.bindings.priceCatalogVersion !== 'synthetic-0.1.0') {
          throw new PersonalAgentClientError(409)
        }
      }
      return previewPersonalBatch(projectId, [explanation, summary], signal)
    }, setPreview)
  }
  return <section className="panel stack"><h2>合成验收批次</h2>
    <p className="muted">只读取明确 ID，不自动选择最新批次。刷新可恢复已有请求；已有槽位、失败、未知费用均不能换键补发。</p>
    <label>已有批次 ID<input value={batchId} maxLength={36} disabled={locked} onChange={event => {
      setBatchId(event.target.value); setLoaded(undefined); onBatch(undefined)
    }} /></label>
    <button className="quiet" disabled={locked || !uuid.test(batchId)} onClick={() => void operate(
      signal => getPersonalBatch(projectId, batchId, signal), receive)}>读取已有批次</button>
    {loaded && <div><p className="mono">当前批次 {loaded.id}</p><p>期限 {loaded.expiresAt}；{loaded.revoked ? '已撤销' : '未撤销'}。</p>
      {canManage && <button className="danger" disabled={locked || loaded.revoked} onClick={() => void operate(
        signal => revokePersonalBatch(projectId, loaded.id, signal), receive)}>撤销此批次（不退款或补发）</button>}</div>}
    {canManage && <div className="stack"><h3>核对两个已存在的合成模板</h3>
      <label>解释模板请求 ID<input value={explanation} maxLength={36} disabled={locked} onChange={event => { setExplanation(event.target.value); invalidate() }} /></label>
      <label>摘要模板请求 ID<input value={summary} maxLength={36} disabled={locked} onChange={event => { setSummary(event.target.value); invalidate() }} /></label>
      <button className="quiet" disabled={locked || !explanation || !summary} onClick={verify}>核对模板并预览清单（无模型调用）</button>
      {preview && <p className="mono">已核对 {preview.templateCount} 个模板；清单 SHA-256 {preview.manifestSha256}</p>}
      <label>已审核的合成来源清单 ID<input value={inventory} maxLength={36} disabled={locked} onChange={event => { setInventory(event.target.value); setConsent(false) }} /></label>
      <label>批次到期时间（UTC）<input value={expiry} maxLength={32} disabled={locked} placeholder="YYYY-MM-DDTHH:mm:ssZ"
        onChange={event => { setExpiry(event.target.value); setConsent(false) }} /></label>
      <p className="muted">清单摘要只能证明一致性，不能自行证明合成来源或费用授权。必须完成工程/CI、运行绑定及实际检查，不能靠新批次绕过既有两次授权。</p>
      <label className="summary-finding"><input type="checkbox" checked={consent} disabled={locked} onChange={event => setConsent(event.target.checked)} />
        我确认本批次仅对应已获批准的两次串行合成验收，解释、摘要各一次，总上限 USD 0.70，失败即停</label>
      <button disabled={locked || !preview || !enablement || enablement.revoked || !consent || !uuid.test(inventory)
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(expiry) || !Number.isFinite(Date.parse(expiry))}
        onClick={() => {
          if (!preview || !enablement || !consent) return
          const input = { enablementId: enablement.id, syntheticInventoryId: inventory, templateRequestIds: [explanation, summary],
            manifestSha256: preview.manifestSha256, expiresAt: expiry, maxRequests: 2 as const, maxCostMicrousd: 700000, callsApproved: true as const }
          setConsent(false); void operate(signal => approvePersonalBatch(projectId, input, signal), receive)
        }}>批准这两次合成批次（尚不发送）</button>
    </div>}
    {error && <p className="state error" role="alert">{error.message}</p>}
  </section>
}

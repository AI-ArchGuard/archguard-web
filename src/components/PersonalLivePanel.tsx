import { useCallback, useEffect, useRef, useState } from 'react'
import { AgentRequestView } from './AgentRequestView'
import { usePersonalLiveBatch } from '../hooks/usePersonalLiveBatch'
import type { PersonalBatch, PersonalPurpose } from '../api/personalAgent'

export function PersonalLivePanel({ projectId, batch, canSend, authorizationExpiresAt, priceExpiresAt, onDenied }: {
  projectId: string; batch: PersonalBatch; canSend: boolean; authorizationExpiresAt?: string; priceExpiresAt?: string; onDenied?: () => void
}) {
  const live = usePersonalLiveBatch(projectId, batch.id, true)
  const denialForwarded = useRef(false)
  const [citationDenied, setCitationDenied] = useState(false)
  const handleDenied = useCallback(() => {
    setCitationDenied(true)
    if (denialForwarded.current) return
    denialForwarded.current = true
    onDenied?.()
  }, [onDenied])
  useEffect(() => {
    if (live.accessDenied && onDenied && !denialForwarded.current) {
      denialForwarded.current = true
      onDenied()
    }
  }, [live.accessDenied, onDenied])
  const deadline = Math.min(Date.parse(batch.expiresAt), Date.parse(authorizationExpiresAt ?? batch.expiresAt),
    Date.parse(priceExpiresAt ?? batch.expiresAt))
  const [observedTime, setObservedTime] = useState(() => Date.now())
  useEffect(() => {
    if (!Number.isFinite(deadline)) return
    let active = true
    let timer: number
    const observe = () => {
      if (!active) return
      const now = Date.now()
      // A backwards system-clock adjustment must not reopen an already observed expiry.
      setObservedTime(previous => Math.max(previous, now))
      if (now < deadline) timer = window.setTimeout(observe, Math.min(1000, Math.max(1, deadline - now)))
    }
    timer = window.setTimeout(observe, Math.min(1000, Math.max(0, deadline - Date.now())))
    return () => { active = false; window.clearTimeout(timer) }
  }, [deadline])
  const denied = live.accessDenied || citationDenied
  const eligible = canSend && !denied && !batch.revoked && Number.isFinite(deadline) && deadline > observedTime
  return <section className="stack"><div className="panel stack"><h2>真实解释与摘要（显式发送）</h2>
    <p className="muted">先解释成功且费用已结算，再允许摘要。费用已结算不等于结果成功；失败或费用未知均不能补发。</p>
    {!eligible && <p>当前只读历史；后台入口关闭、权限不足或确认/Key/批次条件未齐备，不会发送。</p>}
    <button className="quiet" disabled={live.busy || denied} onClick={() => void live.refresh()}>手动恢复批次与现有结果</button>
    {live.error && <p role="alert">{live.error}</p>}
    {live.execution && <div><p>批次尝试 {live.execution.accounting.attemptCount}；保留费用 USD {(live.execution.accounting.reservedMicrousd / 1000000).toFixed(6)}；
      已结算费用 USD {(live.execution.accounting.spentMicrousd / 1000000).toFixed(6)}</p>
      {live.execution.stop && <p role="alert">本批次已停止，不再发送或补齐请求。</p>}
      <p className="muted">此快照不是发送许可，也不证明厂商账单或在途请求已撤回。</p></div>}
    {(['FINDING_EXPLANATION', 'PR_SUMMARY'] as PersonalPurpose[]).map(purpose => <div key={purpose} className="stack">
      <button disabled={!eligible || live.busy || !live.canSubmit(purpose)} onClick={() => {
        const now = Date.now()
        setObservedTime(previous => Math.max(previous, now))
        // Timers can be throttled in background tabs. Fresh event-time checks never extend a deadline.
        if (!denialForwarded.current && eligible && Number.isFinite(deadline) && now < deadline && live.canSubmit(purpose)) void live.run(purpose)
      }}>{purpose === 'FINDING_EXPLANATION' ? '调用 DeepSeek 官方 API · 合成解释（最多 USD 0.35）' : '调用 DeepSeek 官方 API · 合成摘要（最多 USD 0.35）'}</button>
      {live.execution?.templates.find(template => template.purpose === purpose)?.request && <p className="muted">已有固定请求槽位；仅恢复读取，不创建替代请求。</p>}
    </div>)}
  </div>
    {(['FINDING_EXPLANATION', 'PR_SUMMARY'] as PersonalPurpose[]).map(purpose => {
      const request = live.requests[purpose]
      return request && !denied ? <AgentRequestView key={request.id} request={request} onDenied={handleDenied} /> : null
    })}
  </section>
}

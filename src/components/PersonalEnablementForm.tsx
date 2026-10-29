// 个人风险确认表单：固定协议、映射与数据范围，要求操作者填写实际核对记录并手动接受风险。
import { useState, type FormEvent } from 'react'
import type { PersonalAcknowledgementInput } from '../api/personalAgent'

const sources = [
  ['TERMS', '服务条款', 'https://cdn.deepseek.com/policies/zh-CN/deepseek-open-platform-terms-of-service.html'],
  ['PRIVACY', '隐私政策', 'https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html'],
  ['CACHE', '缓存说明', 'https://api-docs.deepseek.com/guides/kv_cache/'],
  ['MODEL_PRICE', '模型与价格', 'https://api-docs.deepseek.com/quick_start/pricing/'],
] as const
const reference = /^(?!sk-)[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/

// 收集非敏感索引、来源版本和实际核对时间；不预勾风险，也不生成核对记录。
export function PersonalEnablementForm({ busy, credentialVersion, onSubmit, onDirty }: {
  busy: boolean; credentialVersion: string | null | undefined; onSubmit: (input: PersonalAcknowledgementInput) => Promise<void>; onDirty: () => void
}) {
  const [error, setError] = useState('')
  // 验证显式勾选及当前凭据版本后构造冻结契约输入；提交结束后取消风险勾选，需再次明确确认。
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !credentialVersion) return
    const form = event.currentTarget; const data = new FormData(form)
    const text = (name: string) => String(data.get(name) ?? '').trim()
    const references = ['accountRef', 'deploymentRef', 'secretCheckRef', 'networkCheckRef']
    const dates = ['expiresAt', 'priceCatalogExpiresAt', ...sources.map(([kind]) => `${kind}-checkedAt`)]
    if (data.get('riskAccepted') !== 'on' || references.some(name => !reference.test(text(name)))
        || sources.some(([kind]) => !reference.test(text(`${kind}-version`)))
        || dates.some(name => !utc.test(text(name)) || !Number.isFinite(Date.parse(text(name))))) {
      setError('请填写实际核对记录、UTC 时间与非敏感检查编号，并明确确认未核实风险。'); return
    }
    setError('')
    const input: PersonalAcknowledgementInput = { schemaVersion: '0.4.0', scope: 'PERSONAL', accountRef: text('accountRef'),
      deploymentRef: text('deploymentRef'), expiresAt: text('expiresAt'), sources: sources.map(([kind, , url]) => ({
        kind, url, version: text(`${kind}-version`), checkedAt: text(`${kind}-checkedAt`),
      })), unknowns: ['PROCESSING_REGION', 'STORAGE_REGION', 'TRAINING', 'HUMAN_REVIEW', 'LOG_RETENTION', 'CACHE_ISOLATION', 'CACHE_RETENTION', 'SUBPROCESSORS'],
      riskAccepted: true, modelAlias: 'deepseek-flash', mappingSnapshot: 'DeepSeek-V4.1-Flash-1017', allowedResponseModels: ['deepseek-flash'],
      priceCatalogVersion: 'deepseek-flash-context-peak-usd-2026-10-15', priceCatalogExpiresAt: text('priceCatalogExpiresAt'),
      secretCheckRef: text('secretCheckRef'), networkCheckRef: text('networkCheckRef'), dataScope: 'SYNTHETIC_ACCEPTANCE',
      revocationConditions: ['OWNER_REVOKED', 'SCOPE_CHANGED', 'POLICY_CHANGED', 'MODEL_CHANGED', 'PRICE_CHANGED', 'SECRET_CHECK_INVALID', 'NETWORK_CHECK_INVALID'],
      credentialVersion,
    }
    await onSubmit(input)
    const checkbox = form.elements.namedItem('riskAccepted') as HTMLInputElement | null
    if (checkbox) checkbox.checked = false
  }
  return <form className="stack" noValidate autoComplete="off" onSubmit={event => void submit(event)} onChange={onDirty}>
    <h3>新增个人风险确认（不批准费用）</h3>
    <p className="muted">固定官方 Responses / deepseek-flash / 已批准映射 DeepSeek-V4.1-Flash-1017 / 2026-10-15 上下文价格策略，仅限合成验收。响应模型仅允许 deepseek-flash。以下仅填非敏感索引，不填真实账户标识、路径、凭据或资料正文。</p>
    <label>非敏感账户记录编号<input name="accountRef" maxLength={128} disabled={busy} /></label>
    <label>非敏感部署记录编号<input name="deploymentRef" maxLength={128} disabled={busy} /></label>
    <label>风险确认到期时间（UTC）<input name="expiresAt" placeholder="YYYY-MM-DDTHH:mm:ssZ" maxLength={32} disabled={busy} /></label>
    <label>价格目录到期时间（UTC）<input name="priceCatalogExpiresAt" placeholder="YYYY-MM-DDTHH:mm:ssZ" maxLength={32} disabled={busy} /></label>
    <label>Secret 托管实际检查编号<input name="secretCheckRef" maxLength={128} disabled={busy} /></label>
    <label>受限网络出口实际检查编号<input name="networkCheckRef" maxLength={128} disabled={busy} /></label>
    {sources.map(([kind, label, url]) => <fieldset className="stack" key={kind} disabled={busy}><legend>{label}</legend>
      <a href={url} target="_blank" rel="noreferrer noopener">打开官方{label}（手动核对）</a>
      <label>{label}实际版本记录<input name={`${kind}-version`} maxLength={128} /></label>
      <label>{label}实际核对时间（UTC）<input name={`${kind}-checkedAt`} placeholder="YYYY-MM-DDTHH:mm:ssZ" maxLength={32} /></label>
    </fieldset>)}
    <p className="muted">处理/存储地区、训练、人工复核、日志保留、缓存隔离/保留和分包商均未核实；不承诺零保留。所有者撤销、范围/政策/模型/价格变化、Secret/网络检查失效时须停止。</p>
    <label className="summary-finding"><input type="checkbox" name="riskAccepted" disabled={busy} />我已实际核对上述资料并接受列明的未核实风险；这不批准模型调用或费用</label>
    {error && <p role="alert">{error}</p>}
    <button disabled={busy || !credentialVersion}>创建风险确认（无模型调用）</button>
  </form>
}

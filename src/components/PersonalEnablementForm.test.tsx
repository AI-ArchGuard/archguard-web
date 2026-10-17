import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PersonalEnablementForm } from './PersonalEnablementForm'

const credential = '40000000-0000-4000-8000-000000000001'
function validFields() {
  for (const label of ['非敏感账户记录编号', '非敏感部署记录编号', 'Secret 托管实际检查编号', '受限网络出口实际检查编号']) {
    fireEvent.change(screen.getByLabelText(label), { target: { value: 'synthetic-review-20261016' } })
  }
  for (const label of ['风险确认到期时间（UTC）', '价格目录到期时间（UTC）']) {
    fireEvent.change(screen.getByLabelText(label), { target: { value: '2026-10-17T08:00:00Z' } })
  }
  for (const label of ['服务条款', '隐私政策', '缓存说明', '模型与价格']) {
    fireEvent.change(screen.getByLabelText(`${label}实际版本记录`), { target: { value: 'reviewed-20261016' } })
    fireEvent.change(screen.getByLabelText(`${label}实际核对时间（UTC）`), { target: { value: '2026-10-16T08:00:00Z' } })
  }
}

it('never fabricates checked times or pre-accepts risk and rejects an incomplete acknowledgement', async () => {
  const submit = vi.fn(); render(<PersonalEnablementForm busy={false} credentialVersion={credential} onSubmit={submit} onDirty={() => {}} />)
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  for (const input of screen.getAllByRole('textbox')) expect(input).toHaveValue('')
  fireEvent.click(screen.getByRole('button', { name: '创建风险确认（无模型调用）' }))
  await screen.findByRole('alert'); expect(submit).not.toHaveBeenCalled()
  expect(screen.getByRole('link', { name: '打开官方模型与价格（手动核对）' })).toHaveAttribute('href', 'https://api-docs.deepseek.com/quick_start/pricing/')
})

it('requires explicit acceptance and sends only the frozen context policy plus actual operator records', async () => {
  const submit = vi.fn().mockResolvedValue(undefined)
  render(<PersonalEnablementForm busy={false} credentialVersion={credential} onSubmit={submit} onDirty={() => {}} />)
  validFields(); fireEvent.click(screen.getByRole('button', { name: '创建风险确认（无模型调用）' }))
  expect(submit).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: '创建风险确认（无模型调用）' }))
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
  const input = submit.mock.calls[0][0]
  expect(input).toMatchObject({ schemaVersion: '0.3.0', scope: 'PERSONAL', dataScope: 'SYNTHETIC_ACCEPTANCE',
    credentialVersion: credential, modelAlias: 'deepseek-flash', mappingSnapshot: 'deepseek-v4.1-flash-2026-10-15',
    priceCatalogVersion: 'deepseek-flash-context-peak-usd-2026-10-15', riskAccepted: true,
    accountRef: 'synthetic-review-20261016', secretCheckRef: 'synthetic-review-20261016', networkCheckRef: 'synthetic-review-20261016' })
  expect(input.sources).toHaveLength(4); expect(input.sources[0].checkedAt).toBe('2026-10-16T08:00:00Z')
  expect(input.unknowns).toHaveLength(8); expect(input.revocationConditions).toHaveLength(7)
  expect(input).not.toHaveProperty('callsApproved'); expect(input).not.toHaveProperty('apiKey')
  await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeChecked())
})

it('does not accept a key-shaped reference or allow submission without current credential metadata', async () => {
  const submit = vi.fn(); const view = render(<PersonalEnablementForm busy={false} credentialVersion={credential} onSubmit={submit} onDirty={() => {}} />)
  validFields(); fireEvent.change(screen.getByLabelText('Secret 托管实际检查编号'), { target: { value: 'sk-synthetic-forbidden-index' } })
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: '创建风险确认（无模型调用）' }))
  await screen.findByRole('alert'); expect(submit).not.toHaveBeenCalled()
  view.rerender(<PersonalEnablementForm busy={false} credentialVersion={undefined} onSubmit={submit} onDirty={() => {}} />)
  expect(screen.getByRole('button', { name: '创建风险确认（无模型调用）' })).toBeDisabled()
})

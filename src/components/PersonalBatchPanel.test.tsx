// 批次面板回归：核对合成模板、清单与明确费用同意，变化/错误使旧预览失效，Viewer 仅可读。
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AgentRequest } from '../api/agent'
import { PersonalAgentClientError, type PersonalEnablement } from '../api/personalAgent'
import { PersonalBatchPanel } from './PersonalBatchPanel'

const project = '10000000-0000-4000-8000-000000000001', approval = '30000000-0000-4000-8000-000000000001'
const explanation = '50000000-0000-4000-8000-000000000001', summary = '50000000-0000-4000-8000-000000000002'
const batch = '60000000-0000-4000-8000-000000000001', inventory = '70000000-0000-4000-8000-000000000001'
const calls = vi.hoisted(() => ({ read: vi.fn(), preview: vi.fn(), approve: vi.fn(), get: vi.fn(), revoke: vi.fn() }))
vi.mock('../api/personalAgent', async original => ({ ...await original<typeof import('../api/personalAgent')>(),
  getPersonalRequest: calls.read, previewPersonalBatch: calls.preview, approvePersonalBatch: calls.approve,
  getPersonalBatch: calls.get, revokePersonalBatch: calls.revoke }))
const enablement: PersonalEnablement = { id: approval, projectId: project, approvedBy: project, approvedAt: '2026-10-16T08:00:00Z',
  expiresAt: '2026-10-17T08:00:00Z', credentialVersion: project, modelAlias: 'deepseek-flash',
  priceCatalogVersion: 'deepseek-flash-context-peak-usd-2026-10-15', priceCatalogExpiresAt: '2026-10-17T08:00:00Z',
  dataScope: 'SYNTHETIC_ACCEPTANCE', revoked: false, revokedAt: null }
const metadata = { id: batch, projectId: project, enablementId: approval, approvedBy: project,
  approvedAt: '2026-10-16T08:00:00Z', manifestSha256: 'a'.repeat(64), expiresAt: '2026-10-16T09:00:00Z',
  maxRequests: 2, maxCostMicrousd: 700000, revoked: false }
// 按指定 ID 生成对应解释/摘要的终态合成模板，供后续故意改变范围或状态。
function template(id: string): AgentRequest {
  const purpose = id === explanation ? 'FINDING_EXPLANATION' : 'PR_SUMMARY'
  return { id, projectId: project, requesterId: project, traceId: 'b'.repeat(32), purpose, state: 'FAILED', result: null,
    failure: { code: 'MODEL_DISABLED', message: 'Synthetic template' }, usage: null,
    createdAt: '2026-10-16T08:00:00Z', updatedAt: '2026-10-16T08:00:00Z',
    bindings: { scanJobId: project, reportSha256: 'c'.repeat(64), prHeadRevisionId: purpose === 'PR_SUMMARY' ? project : null,
      findingIds: [project], documentVersions: [], promptVersion: purpose === 'PR_SUMMARY' ? 'pr-summary-0.1.0' : 'finding-explanation-0.1.0',
      modelProfileVersion: 'disabled-or-test-fake-0.1.0', modelProtocolVersion: 'responses-v1-restricted',
      modelId: 'deterministic-fake-or-disabled', outputSchemaVersion: '0.1.0', priceCatalogVersion: 'synthetic-0.1.0', inputDigest: 'd'.repeat(64) } }
}
beforeEach(() => {
  vi.clearAllMocks(); calls.read.mockImplementation((_project: string, id: string) => Promise.resolve(template(id)))
  calls.preview.mockResolvedValue({ schemaVersion: '0.1.0', manifestSha256: 'a'.repeat(64), templateCount: 2 })
  calls.approve.mockResolvedValue(metadata); calls.get.mockResolvedValue(metadata)
})
// 挂载可控管理权限的批次面板，并返回接收/失权回调供断言。
function show(canManage = true, onDenied = vi.fn()) {
  const receive = vi.fn()
  const view = render(<PersonalBatchPanel projectId={project} enablement={enablement} canManage={canManage} disabled={false}
    onBatch={receive} onDenied={onDenied} />)
  return { ...view, receive, denied: onDenied }
}
// 通过真实表单交互填写两个固定模板 ID，显式点击预览并等待核对完成。
async function preview() {
  fireEvent.change(screen.getByLabelText('解释模板请求 ID'), { target: { value: explanation } })
  fireEvent.change(screen.getByLabelText('摘要模板请求 ID'), { target: { value: summary } })
  fireEvent.click(screen.getByRole('button', { name: '核对模板并预览清单（无模型调用）' }))
  await screen.findByText(/已核对 2 个模板/)
}

// 验证只接受同 Project 终态模板及显式费用同意，输入变化后取消同意。
it('requires terminal same-Project templates and explicit batch consent, then clears consent on every input change', async () => {
  show(); await preview()
  expect(calls.read.mock.calls.map(call => call.slice(0, 2))).toEqual([[project, explanation], [project, summary]])
  expect(calls.preview.mock.calls[0].slice(0, 2)).toEqual([project, [explanation, summary]])
  const approve = screen.getByRole('button', { name: '批准这两次合成批次（尚不发送）' })
  fireEvent.change(screen.getByLabelText('已审核的合成来源清单 ID'), { target: { value: inventory } })
  fireEvent.change(screen.getByLabelText('批次到期时间（UTC）'), { target: { value: '2026-10-16T09:00:00Z' } })
  expect(approve).toBeDisabled(); fireEvent.click(screen.getByRole('checkbox')); expect(approve).toBeEnabled()
  fireEvent.change(screen.getByLabelText('批次到期时间（UTC）'), { target: { value: '2026-10-16T09:30:00Z' } })
  expect(screen.getByRole('checkbox')).not.toBeChecked(); expect(approve).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(approve)
  await screen.findByText(`当前批次 ${batch}`)
  expect(calls.approve).toHaveBeenCalledTimes(1)
  expect(calls.approve.mock.calls[0].slice(0, 2)).toEqual([project, { enablementId: approval, syntheticInventoryId: inventory,
    templateRequestIds: [explanation, summary], manifestSha256: 'a'.repeat(64), expiresAt: '2026-10-16T09:30:00Z',
    maxRequests: 2, maxCostMicrousd: 700000, callsApproved: true }])
})

// 验证跨 Project、未终态或用途错误的模板不能形成可信预览。
it.each(['foreign', 'running', 'purpose'])('rejects a %s template before producing a trusted preview', async invalid => {
  calls.read.mockImplementation((_project: string, id: string) => {
    const value = template(id)
    return Promise.resolve(invalid === 'foreign' ? { ...value, projectId: inventory }
      : invalid === 'running' ? { ...value, state: 'RUNNING', failure: null } : { ...value, purpose: 'PR_SUMMARY' })
  })
  show()
  fireEvent.change(screen.getByLabelText('解释模板请求 ID'), { target: { value: explanation } })
  fireEvent.change(screen.getByLabelText('摘要模板请求 ID'), { target: { value: summary } })
  fireEvent.click(screen.getByRole('button', { name: '核对模板并预览清单（无模型调用）' }))
  await screen.findByRole('alert'); expect(calls.preview).not.toHaveBeenCalled(); expect(calls.approve).not.toHaveBeenCalled()
})

// 验证模板变化撤销旧预览，批准结果未知后不自动重试。
it('invalidates preview when templates change and never auto-retries an unknown approval outcome', async () => {
  show(); await preview()
  fireEvent.change(screen.getByLabelText('解释模板请求 ID'), { target: { value: inventory } })
  expect(screen.queryByText(/已核对 2 个模板/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '批准这两次合成批次（尚不发送）' })).toBeDisabled()
  await preview(); calls.approve.mockRejectedValue(new PersonalAgentClientError(0))
  fireEvent.change(screen.getByLabelText('已审核的合成来源清单 ID'), { target: { value: inventory } })
  fireEvent.change(screen.getByLabelText('批次到期时间（UTC）'), { target: { value: '2026-10-16T09:00:00Z' } })
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: '批准这两次合成批次（尚不发送）' }))
  await screen.findByRole('alert'); expect(calls.approve).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('checkbox')).not.toBeChecked(); expect(screen.queryByText(/已核对 2 个模板/)).not.toBeInTheDocument()
})

// 验证 Viewer 可读历史但无写入口，读取失权后清除批次。
it('allows Viewer history reads without any mutation control and clears a denied read', async () => {
  const view = show(false)
  expect(screen.queryByLabelText('解释模板请求 ID')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('已有批次 ID'), { target: { value: batch } })
  fireEvent.click(screen.getByRole('button', { name: '读取已有批次' })); await screen.findByText(`当前批次 ${batch}`)
  expect(view.receive).toHaveBeenLastCalledWith(metadata)
  calls.get.mockRejectedValue(new PersonalAgentClientError(403))
  fireEvent.click(screen.getByRole('button', { name: '读取已有批次' })); await screen.findByRole('alert')
  await waitFor(() => expect(view.denied).toHaveBeenCalledTimes(1))
  expect(screen.queryByText(`当前批次 ${batch}`)).not.toBeInTheDocument(); expect(calls.approve).not.toHaveBeenCalled()
})

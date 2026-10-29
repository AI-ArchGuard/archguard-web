// 个人验收协调页回归：假 owner/角色/元数据验证准入、ETag 冲突、到期、取消和全页失权清理。
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { CredentialClientError } from '../api/credentials'
import { PersonalAgentClientError } from '../api/personalAgent'
import { PersonalAgentPage } from './PersonalAgentPage'

const project = '10000000-0000-4000-8000-000000000001'
const owner = '20000000-0000-4000-8000-000000000001'
const approval = '30000000-0000-4000-8000-000000000001'
const credential = '40000000-0000-4000-8000-000000000001'
const state = vi.hoisted(() => ({ actor: '20000000-0000-4000-8000-000000000001', enabled: true, liveDenied: false,
  settings: vi.fn(), role: vi.fn(), key: vi.fn(), update: vi.fn(), enablement: vi.fn(), acknowledge: vi.fn(),
  revoke: vi.fn(), preview: vi.fn(), approve: vi.fn(), batch: vi.fn(), request: vi.fn(), revokeBatch: vi.fn(), run: vi.fn(), liveRun: vi.fn() }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { profile: { sub: state.actor } } }) }))
vi.mock('../personalAgentEntry', () => ({ personalAgentEntryEnabled: () => state.enabled }))
vi.mock('../hooks/usePersonalLiveBatch', () => ({ usePersonalLiveBatch: () => ({ execution: undefined,
  requests: {}, error: state.liveDenied ? 'Project 权限已失效，历史结果已清除；请重新核对权限。' : '',
  accessDenied: state.liveDenied, busy: false, refresh: async () => {}, run: state.liveRun,
  canSubmit: (purpose: string) => purpose === 'FINDING_EXPLANATION' }) }))
vi.mock('../api/credentials', async original => ({ ...await original<typeof import('../api/credentials')>(), getCredentialStatus: state.key }))
vi.mock('../api/personalAgent', async original => ({ ...await original<typeof import('../api/personalAgent')>(),
  getPersonalSettings: state.settings, getPersonalRole: state.role, updatePersonalSettings: state.update,
  getPersonalEnablement: state.enablement, acknowledgePersonalRisk: state.acknowledge,
  revokePersonalEnablement: state.revoke, previewPersonalBatch: state.preview, approvePersonalBatch: state.approve,
  getPersonalBatch: state.batch, getPersonalRequest: state.request, revokePersonalBatch: state.revokeBatch,
  runPersonalRequest: state.run }))

const settings = { value: { enabled: false, revision: 9007199254740992, enablementId: null, modelCallsAvailable: false,
  unavailableReason: 'PROJECT_DISABLED' }, etag: '"9007199254740993"' }
const acknowledgement = { id: approval, projectId: project, approvedBy: owner, approvedAt: '2026-10-16T00:00:00Z',
  expiresAt: '2026-10-17T00:00:00Z', credentialVersion: credential, modelAlias: 'deepseek-flash',
  priceCatalogVersion: 'deepseek-flash-context-peak-usd-2026-10-15', priceCatalogExpiresAt: '2026-10-17T00:00:00Z',
  dataScope: 'SYNTHETIC_ACCEPTANCE', revoked: false, revokedAt: null }
beforeEach(() => {
  vi.clearAllMocks(); state.actor = owner; state.enabled = true; state.liveDenied = false
  state.settings.mockResolvedValue(settings); state.role.mockResolvedValue('MAINTAINER')
  state.key.mockResolvedValue({ configured: true, credentialVersion: credential, updatedAt: '2026-10-16T00:00:00Z' })
  state.enablement.mockResolvedValue(acknowledgement)
})
afterEach(() => vi.useRealTimers())
// 挂载个人验收深链接并返回渲染句柄，供切换/卸载场景检查取消行为。
function show() {
  return render(<MemoryRouter initialEntries={[`/projects/${project}/agent/personal`]}><Routes>
    <Route path="/projects/:projectId/agent/personal" element={<PersonalAgentPage />} />
  </Routes></MemoryRouter>)
}

// 配置折叠只改变展示，保持未提交输入与协调器，不产生管理或模型写入。
it('keeps management collapsed and preserves nonsecret input when reopened without POSTs', async () => {
  show()
  await screen.findByText('风险确认与 Project 开关')
  for (const label of ['当前配置（只读，不测试 Key）', '风险确认与 Project 开关', '合成验收批次管理']) {
    expect(screen.getByText(label).closest('details')).not.toHaveAttribute('open')
  }
  expect(screen.getByText(/当前未选择批次/)).toBeVisible()
  const toggle = screen.getByText('风险确认与 Project 开关')
  fireEvent.click(toggle)
  const input = screen.getByLabelText('非敏感账户记录编号')
  fireEvent.change(input, { target: { value: 'review-record-42' } })
  fireEvent.click(toggle); fireEvent.click(toggle)
  expect(screen.getByLabelText('非敏感账户记录编号')).toBe(input)
  expect(input).toHaveValue('review-record-42')
  expect(screen.getByRole('checkbox', { name: /我已实际核对/ })).not.toBeChecked()
  expect(state.settings).toHaveBeenCalledTimes(1)
  for (const operation of [state.update, state.acknowledge, state.approve, state.run, state.liveRun]) {
    expect(operation).not.toHaveBeenCalled()
  }
})

// 既有管理交互先显式展开；折叠行为在独立用例中检查。
async function openManagement(waitForLoad = true) {
  if (waitForLoad) await screen.findByText('风险确认与 Project 开关')
  for (const label of ['当前配置（只读，不测试 Key）', '风险确认与 Project 开关', '合成验收批次管理']) {
    const summary = screen.getByText(label)
    if (!summary.closest('details')?.open) fireEvent.click(summary)
  }
}

// 验证入口关闭时无任何 API 工作。
it('keeps the disabled entry completely free of API work', () => {
  state.enabled = false; show()
  expect(screen.getByText(/个人真实验收入口已关闭/)).toBeInTheDocument()
  expect(state.settings).not.toHaveBeenCalled(); expect(state.key).not.toHaveBeenCalled(); expect(state.role).not.toHaveBeenCalled()
})

// 验证 owner 且 Maintainer 只读取元数据，不增加 Key 表单或调用模型。
it('loads metadata for an owner Maintainer without adding a second Key form or calling models', async () => {
  show(); await openManagement(); await screen.findByRole('button', { name: '创建风险确认（无模型调用）' })
  expect(screen.getByRole('link', { name: '管理已加密的 API Key' })).toHaveAttribute('href', '/settings/model-credentials')
  expect(document.querySelector('input[type=password]')).toBeNull()
  expect(screen.getAllByText(/每次最多 USD 0.35/)[0]).toBeInTheDocument()
  expect(state.acknowledge).not.toHaveBeenCalled(); expect(state.approve).not.toHaveBeenCalled(); expect(state.run).not.toHaveBeenCalled()
})

// 验证 Viewer 只有读取控件，没有写控件。
it('shows read controls but hides mutation controls for a Viewer', async () => {
  state.role.mockResolvedValue('VIEWER'); show(); await openManagement()
  await screen.findByRole('button', { name: '读取已有批次' })
  expect(screen.queryByRole('button', { name: '创建风险确认（无模型调用）' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '关闭 Project 模型入口' })).not.toBeInTheDocument()
  expect(state.run).not.toHaveBeenCalled()
})

// 验证仅有 Maintainer 身份不能获得部署所有者的写权限。
it('does not grant write controls merely because the actor is a Maintainer', async () => {
  state.key.mockRejectedValue(new CredentialClientError(403)); show(); await openManagement()
  await screen.findByRole('button', { name: '读取已有批次' })
  expect(screen.queryByRole('button', { name: '创建风险确认（无模型调用）' })).not.toBeInTheDocument()
})

// 验证原样沿用强 ETag，412 后不覆盖也不重试。
it('uses the exact strong ETag and never overwrites or retries a 412', async () => {
  state.update.mockRejectedValue(new PersonalAgentClientError(412)); show(); await openManagement()
  await screen.findByRole('button', { name: '关闭 Project 模型入口' })
  fireEvent.click(screen.getByRole('button', { name: '关闭 Project 模型入口' }))
  await screen.findByText(/设置版本已变化/)
  expect(state.update).toHaveBeenCalledTimes(1)
  expect(state.update.mock.calls[0].slice(0, 3)).toEqual([project, { enabled: false }, '"9007199254740993"'])
  expect(state.settings).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('button', { name: '关闭 Project 模型入口' })).not.toBeInTheDocument()
})

// 验证 Project 失权清空元数据，身份变化后忽略迟到响应。
it('keeps configuration failures visible and their trace collapsed', async () => {
  state.settings.mockRejectedValue(new PersonalAgentClientError(404, 'abcdef0123456789abcdef0123456789')); show()
  expect(await screen.findByRole('alert')).toHaveTextContent(/无权访问此 Project/)
  const trace = screen.getByText(/abcdef0123456789abcdef0123456789/)
  expect(trace.closest('details')).not.toHaveAttribute('open')
  expect(trace).not.toBeVisible()
  fireEvent.click(screen.getByText('运行详情'))
  expect(trace).toBeVisible()
})

// 验证 Project 失权清空元数据，身份变化后忽略迟到响应。
it('clears Project metadata when its authorization fails and ignores late identity responses', async () => {
  let complete: (value: typeof settings) => void = () => undefined
  state.settings.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
  const view = show(); state.actor = '20000000-0000-4000-8000-000000000002'
  state.settings.mockRejectedValue(new PersonalAgentClientError(404)); view.rerender(<MemoryRouter initialEntries={[`/projects/${project}/agent/personal`]}><Routes>
    <Route path="/projects/:projectId/agent/personal" element={<PersonalAgentPage />} />
  </Routes></MemoryRouter>)
  await screen.findByText(/无权访问此 Project/)
  complete(settings)
  await waitFor(() => expect(screen.queryByRole('button', { name: '关闭 Project 模型入口' })).not.toBeInTheDocument())
  expect(state.run).not.toHaveBeenCalled()
})

// 验证离页取消最新设置写入并忽略迟到成功。
it('cancels the latest settings mutation on leaving and never applies its late response', async () => {
  let signal: AbortSignal | undefined
  let finish: (value: typeof settings) => void = () => undefined
  state.update.mockImplementation((_project: string, _input: unknown, _etag: string, currentSignal: AbortSignal) => {
    signal = currentSignal; return new Promise(resolve => { finish = resolve })
  })
  const view = show(); await screen.findByRole('button', { name: '关闭 Project 模型入口' })
  fireEvent.click(screen.getByRole('button', { name: '关闭 Project 模型入口' }))
  view.unmount(); expect(signal?.aborted).toBe(true)
  finish(settings); expect(state.update).toHaveBeenCalledTimes(1); expect(state.run).not.toHaveBeenCalled()
})

// 验证批准或价格到期时关闭付费资格，保留只读操作。
it.each(['approval', 'price'])('closes paid eligibility when %s expires while mounted, retaining read controls', async kind => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-16T08:00:00Z'))
  state.settings.mockResolvedValue({ value: { ...settings.value, enabled: true, modelCallsAvailable: true,
    enablementId: approval, unavailableReason: null }, etag: '"1"' })
  state.enablement.mockResolvedValue({ ...acknowledgement,
    expiresAt: kind === 'approval' ? '2026-10-16T08:00:01Z' : '2026-10-16T09:00:00Z',
    priceCatalogExpiresAt: kind === 'price' ? '2026-10-16T08:00:01Z' : '2026-10-16T09:00:00Z' })
  const batchId = '60000000-0000-4000-8000-000000000001'
  state.batch.mockResolvedValue({ id: batchId, projectId: project, enablementId: approval, approvedBy: owner,
    approvedAt: '2026-10-16T08:00:00Z', manifestSha256: 'a'.repeat(64), expiresAt: '2026-10-16T09:00:00Z',
    maxRequests: 2, maxCostMicrousd: 700000, revoked: false })
  await act(async () => { show() }); await openManagement(false)
  await act(async () => {
    fireEvent.change(screen.getByLabelText('已有批次 ID'), { target: { value: batchId } })
    fireEvent.click(screen.getByRole('button', { name: '读取已有批次' }))
  })
  const send = screen.getByRole('button', { name: /调用 DeepSeek 官方 API.*合成解释/ })
  expect(send).toBeEnabled()
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(send).toBeDisabled()
  expect(screen.getByRole('button', { name: '手动恢复批次与现有结果' })).toBeEnabled()
  expect(state.liveRun).not.toHaveBeenCalled(); expect(state.run).not.toHaveBeenCalled()
})

const batchId = '60000000-0000-4000-8000-000000000001'
// 构造已经绑定指定风险确认的设置，保留原始 ETag。
function selectedSettings() {
  return { value: { ...settings.value, enablementId: approval }, etag: settings.etag }
}
// 构造属于当前 Project/确认的固定两次合成批次。
function loadedBatch() {
  return { id: batchId, projectId: project, enablementId: approval, approvedBy: owner,
    approvedAt: '2026-10-16T00:00:00Z', manifestSha256: 'a'.repeat(64), expiresAt: '2026-10-17T00:00:00Z',
    maxRequests: 2, maxCostMicrousd: 700000, revoked: false }
}
// 复用同一路由树重渲染，让测试区分身份变化与整页重新创建。
function samePage() {
  return <MemoryRouter initialEntries={[`/projects/${project}/agent/personal`]}><Routes>
    <Route path="/projects/:projectId/agent/personal" element={<PersonalAgentPage />} />
  </Routes></MemoryRouter>
}
// 先读取已选择确认，再由界面显式加载指定批次，准备失权传播场景。
async function loadSelectedBatch() {
  state.settings.mockResolvedValue(selectedSettings()); state.batch.mockResolvedValue(loadedBatch())
  const view = show(); await openManagement(); await screen.findByText(`风险确认 ${approval}`)
  fireEvent.change(screen.getByLabelText('已有批次 ID'), { target: { value: batchId } })
  fireEvent.click(screen.getByRole('button', { name: '读取已有批次' }))
  await screen.findByText(`当前批次 ${batchId}`)
  return view
}

// 管理区开合不替换运行面板或批次输入，运行结果始终位于低频配置之前。
it('keeps selected live controls mounted ahead of management while disclosures toggle', async () => {
  await loadSelectedBatch()
  const live = screen.getByRole('button', { name: '手动恢复批次与现有结果' })
  const batchInput = screen.getByLabelText('已有批次 ID')
  const config = screen.getByText('当前配置（只读，不测试 Key）')
  expect(live.compareDocumentPosition(config) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  for (const label of ['当前配置（只读，不测试 Key）', '风险确认与 Project 开关', '合成验收批次管理']) {
    const summary = screen.getByText(label)
    fireEvent.click(summary)
    expect(summary.closest('details')).not.toHaveAttribute('open')
    expect(live).toBeVisible()
    fireEvent.click(summary)
  }
  expect(screen.getByRole('button', { name: '手动恢复批次与现有结果' })).toBe(live)
  expect(screen.getByLabelText('已有批次 ID')).toBe(batchInput)
  expect(batchInput).toHaveValue(batchId)
  expect(state.batch).toHaveBeenCalledTimes(1)
  expect(state.settings).toHaveBeenCalledTimes(1)
  expect(state.enablement).toHaveBeenCalledTimes(1)
  for (const operation of [state.update, state.acknowledge, state.approve, state.run, state.liveRun]) {
    expect(operation).not.toHaveBeenCalled()
  }
})
// 集中断言批准、凭据、批次及写控件都已撤下，避免只清除建议而保留旧管理权限。
function expectNoStaleManagement() {
  expect(screen.queryByText(`风险确认 ${approval}`)).not.toBeInTheDocument()
  expect(screen.queryByText(`当前批次 ${batchId}`)).not.toBeInTheDocument()
  expect(screen.queryByText(new RegExp(credential))).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '创建风险确认（无模型调用）' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '关闭 Project 模型入口' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('已有批次 ID')).not.toBeInTheDocument()
}

// 验证 live 失权清空所属 Project、凭据、批准和批次元数据。
it('clears owning Project, credential, approval and batch metadata when live permission is denied', async () => {
  const view = await loadSelectedBatch()
  expect(screen.getByRole('button', { name: '关闭 Project 模型入口' })).toBeInTheDocument()
  expect(screen.getByText(new RegExp(credential))).toBeInTheDocument()
  state.liveDenied = true; view.rerender(samePage())
  await screen.findByText(/Project 权限已失效/)
  expectNoStaleManagement()
  expect(state.settings).toHaveBeenCalledTimes(1); expect(state.update).not.toHaveBeenCalled()
  expect(state.acknowledge).not.toHaveBeenCalled(); expect(state.approve).not.toHaveBeenCalled()
  expect(state.run).not.toHaveBeenCalled(); expect(state.liveRun).not.toHaveBeenCalled()
})

// 验证失权前在途设置写入被取消，迟到成功不能恢复旧管理控件。
it('cancels a pre-denial settings mutation and prevents its late success from reviving stale management', async () => {
  let signal: AbortSignal | undefined
  let finish: (value: ReturnType<typeof selectedSettings>) => void = () => undefined
  state.update.mockImplementation((_project: string, _input: unknown, _etag: string, currentSignal: AbortSignal) => {
    signal = currentSignal; return new Promise(resolve => { finish = resolve })
  })
  const view = await loadSelectedBatch()
  fireEvent.click(screen.getByRole('button', { name: '关闭 Project 模型入口' }))
  expect(state.update).toHaveBeenCalledTimes(1); expect(signal?.aborted).toBe(false)
  state.liveDenied = true; view.rerender(samePage())
  await screen.findByText(/Project 权限已失效/)
  expect(signal?.aborted).toBe(true); expectNoStaleManagement()
  await act(async () => { finish(selectedSettings()) })
  expectNoStaleManagement()
  expect(screen.getByText(/Project 权限已失效/)).toBeInTheDocument()
  expect(state.update).toHaveBeenCalledTimes(1); expect(state.settings).toHaveBeenCalledTimes(1)
  expect(state.run).not.toHaveBeenCalled(); expect(state.liveRun).not.toHaveBeenCalled()
})

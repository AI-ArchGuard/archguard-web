// 真实操作面板回归：串行准入、三类期限即时关闭、历史读取及引用失权传播均由合成状态驱动。
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AgentRequest } from '../api/agent'
import { ApiClientError } from '../api/client'
import type { PersonalBatch } from '../api/personalAgent'
import { PersonalLivePanel } from './PersonalLivePanel'

const project = '10000000-0000-4000-8000-000000000001', batchId = '60000000-0000-4000-8000-000000000001'
const state = vi.hoisted(() => ({ mount: vi.fn(), run: vi.fn(), refresh: vi.fn(), submit: vi.fn(),
  busy: false, error: '', accessDenied: false, requests: {} as Record<string, unknown>, execution: undefined as unknown }))
const apiMock = vi.hoisted(() => vi.fn())
vi.mock('../api/client', async load => ({ ...await load<typeof import('../api/client')>(), api: apiMock }))
vi.mock('../hooks/usePersonalLiveBatch', () => ({ usePersonalLiveBatch: (...args: unknown[]) => {
  state.mount(...args)
  return { execution: state.execution, requests: state.requests, error: state.error, busy: state.busy, accessDenied: state.accessDenied,
    run: state.run, refresh: state.refresh, canSubmit: state.submit }
} }))
const batch: PersonalBatch = { id: batchId, projectId: project, enablementId: project, approvedBy: project,
  approvedAt: '2026-10-16T08:00:00Z', expiresAt: '2026-10-16T09:00:00Z', manifestSha256: 'a'.repeat(64),
  maxRequests: 2, maxCostMicrousd: 700000, revoked: false }
// 构造已校验的合成历史建议，验证只读展示与发送准入互不替代。
function advice(): AgentRequest {
  return { id: '80000000-0000-4000-8000-000000000001', projectId: project, requesterId: project,
    traceId: 'b'.repeat(32), purpose: 'FINDING_EXPLANATION', state: 'SUCCEEDED', failure: null,
    result: { conclusion: '已校验合成建议', claims: [], ruleBasis: [], suggestions: [], citations: [], evidenceCoverage: 'NONE' },
    usage: null, createdAt: '2026-10-16T08:00:00Z', updatedAt: '2026-10-16T08:00:00Z',
    bindings: { scanJobId: project, reportSha256: 'c'.repeat(64), prHeadRevisionId: null, findingIds: [project], documentVersions: [],
      promptVersion: 'finding-explanation-deepseek-0.1.0', modelProfileVersion: 'deepseek-personal-0.2.0', modelId: 'deepseek-flash',
      modelProtocolVersion: 'responses-v1-restricted', outputSchemaVersion: '0.1.0',
      priceCatalogVersion: 'deepseek-flash-context-peak-usd-2026-10-15', inputDigest: 'd'.repeat(64) } }
}
beforeEach(() => {
  vi.clearAllMocks(); apiMock.mockReset(); state.busy = false; state.error = ''; state.accessDenied = false; state.requests = {}; state.execution = undefined
  state.submit.mockReturnValue(true); vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-16T08:00:00Z'))
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

// 验证服务端模型关闭或写权限不足时仍可读既有已校验历史。
it('keeps existing verified history readable when provider settings or write permissions are closed', () => {
  state.requests = { FINDING_EXPLANATION: advice() }
  render(<PersonalLivePanel projectId={project} batch={batch} canSend={false} />)
  expect(screen.getByText('已校验合成建议')).toBeInTheDocument()
  expect(screen.getByText(/当前只读历史/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /调用 DeepSeek 官方 API.*合成解释/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: /调用 DeepSeek 官方 API.*合成摘要/ })).toBeDisabled()
  expect(state.mount).toHaveBeenCalledWith(project, batchId, true)
  expect(state.run).not.toHaveBeenCalled()
})

// 验证真实点击同时需要页面准入和 Hook 串行许可。
it('requires both page admission and hook serial permission for an explicit real action', () => {
  state.submit.mockImplementation((purpose: string) => purpose === 'FINDING_EXPLANATION')
  render(<PersonalLivePanel projectId={project} batch={batch} canSend />)
  const explanation = screen.getByRole('button', { name: /调用 DeepSeek 官方 API.*合成解释/ })
  expect(explanation).toBeEnabled()
  expect(screen.getByRole('button', { name: /调用 DeepSeek 官方 API.*合成摘要/ })).toBeDisabled()
  expect(state.run).not.toHaveBeenCalled(); fireEvent.click(explanation)
  expect(state.run).toHaveBeenCalledExactlyOnceWith('FINDING_EXPLANATION')
})

// 验证过期/撤销/忙碌/无授权条件阻止发送，刷新只恢复读取。
it.each(['expired', 'revoked', 'busy', 'not-authorized'])('does not send when %s and never invokes model work on refresh', reason => {
  if (reason === 'busy') state.busy = true
  const value = { ...batch, revoked: reason === 'revoked', expiresAt: reason === 'expired' ? '2026-10-16T07:59:59Z' : batch.expiresAt }
  render(<PersonalLivePanel projectId={project} batch={value} canSend={reason !== 'not-authorized'} />)
  expect(screen.getByRole('button', { name: /调用 DeepSeek 官方 API.*合成解释/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: /调用 DeepSeek 官方 API.*合成摘要/ })).toBeDisabled()
  if (reason !== 'busy') fireEvent.click(screen.getByRole('button', { name: '手动恢复批次与现有结果' }))
  expect(state.run).not.toHaveBeenCalled()
})

// 验证已停止批次不提供重试或额外发送。
it('does not offer retries or another call when the execution hook has stopped the batch', () => {
  state.submit.mockReturnValue(false); state.error = '操作结果未确认；只能手动恢复读取，不会重试或补发。'
  render(<PersonalLivePanel projectId={project} batch={batch} canSend />)
  expect(screen.getByRole('alert')).toHaveTextContent('只能手动恢复读取')
  expect(screen.getByRole('button', { name: /调用 DeepSeek 官方 API.*合成解释/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: /调用 DeepSeek 官方 API.*合成摘要/ })).toBeDisabled()
  expect(state.run).not.toHaveBeenCalled()
})

// 验证精确到期时独立关闭按钮并清理计时器。
it('closes at the exact batch expiry without a parent render and cleans its timer on leaving', async () => {
  vi.restoreAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-16T08:00:00Z'))
  const view = render(<PersonalLivePanel projectId={project} batch={{ ...batch, expiresAt: '2026-10-16T08:00:01Z' }} canSend />)
  const send = screen.getByRole('button', { name: /调用 DeepSeek 官方 API.*合成解释/ })
  expect(send).toBeEnabled()
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(send).toBeDisabled()
  expect(screen.getByRole('button', { name: '手动恢复批次与现有结果' })).toBeEnabled()
  view.unmount(); expect(vi.getTimerCount()).toBe(0); expect(state.run).not.toHaveBeenCalled()
})

// 验证浏览器计时器未执行时，点击仍即时检查批次/批准/价格期限。
it.each(['batch', 'approval', 'price'])('rechecks %s expiry in the click handler even if browser timers have not run', kind => {
  vi.restoreAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-16T08:00:00Z'))
  render(<PersonalLivePanel projectId={project} batch={{ ...batch,
    expiresAt: kind === 'batch' ? '2026-10-16T08:00:01Z' : '2026-10-16T09:00:00Z' }} canSend
    authorizationExpiresAt={kind === 'approval' ? '2026-10-16T08:00:01Z' : '2026-10-16T09:00:00Z'}
    priceExpiresAt={kind === 'price' ? '2026-10-16T08:00:01Z' : '2026-10-16T09:00:00Z'} />)
  const send = screen.getByRole('button', { name: /调用 DeepSeek 官方 API.*合成解释/ })
  expect(send).toBeEnabled()
  // Moving the clock intentionally does not run timers: reproduce a throttled background tab.
  vi.setSystemTime(new Date('2026-10-16T08:00:01Z')); fireEvent.click(send)
  expect(state.run).not.toHaveBeenCalled(); expect(send).toBeDisabled()
})

// 验证到期前离页移除唯一时钟计时器。
it('removes its single bounded clock timer when leaving before expiry', () => {
  vi.restoreAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-16T08:00:00Z'))
  const view = render(<PersonalLivePanel projectId={project} batch={batch} canSend />)
  expect(vi.getTimerCount()).toBe(1)
  view.unmount(); expect(vi.getTimerCount()).toBe(0)
})

// 验证类型化失权只向父页报告一次，不解析错误文本或另发请求。
it('forwards typed live authorization denial once without parsing an error message or making another call', () => {
  const denied = vi.fn()
  const view = render(<PersonalLivePanel projectId={project} batch={batch} canSend onDenied={denied} />)
  expect(denied).not.toHaveBeenCalled()
  state.accessDenied = true; state.error = 'Unrelated display text must not control authorization.'
  view.rerender(<PersonalLivePanel projectId={project} batch={batch} canSend onDenied={denied} />)
  expect(denied).toHaveBeenCalledTimes(1)
  view.rerender(<PersonalLivePanel projectId={project} batch={batch} canSend onDenied={() => denied()} />)
  expect(denied).toHaveBeenCalledTimes(1)
  expect(state.run).not.toHaveBeenCalled(); expect(state.refresh).not.toHaveBeenCalled()
})

// 在基础建议中加入同范围 Evidence 引用，专门触发按当前权限重新核对的路径。
function citationAdvice(): AgentRequest {
  const request = advice()
  return { ...request, result: { ...request.result!, citations: [{ citationId: 'e-1', source: 'SCANNER_EVIDENCE',
    label: 'Synthetic evidence', projectId: project, scanJobId: project, reportSha256: 'c'.repeat(64), evidenceId: 'evidence-1',
    documentVersionId: null, contentSha256: null, fragmentIndex: null, fragmentSha256: null }] } }
}

// 验证引用读取失权立即停发并只上报一次，不等待父页卸载。
it.each([401, 403, 404])('forwards citation denial %s once and stops sends before its owning page unmounts', async status => {
  state.requests = { FINDING_EXPLANATION: citationAdvice() }
  apiMock.mockRejectedValue(new ApiClientError(status, { code: 'opaque', message: 'unsafe provider text', traceId: '', details: {} }))
  const denied = vi.fn()
  const view = render(<PersonalLivePanel projectId={project} batch={batch} canSend onDenied={denied} />)
  expect(screen.getByRole('button', { name: /调用 DeepSeek 官方 API.*合成摘要/ })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: /核对 Evidence/ }))
  await waitFor(() => expect(denied).toHaveBeenCalledExactlyOnceWith())
  const explanation = screen.getByRole('button', { name: /调用 DeepSeek 官方 API.*合成解释/ })
  const summary = screen.getByRole('button', { name: /调用 DeepSeek 官方 API.*合成摘要/ })
  expect(explanation).toBeDisabled(); expect(summary).toBeDisabled()
  fireEvent.click(explanation); fireEvent.click(summary)
  state.accessDenied = true
  view.rerender(<PersonalLivePanel projectId={project} batch={batch} canSend onDenied={() => denied()} />)
  expect(denied).toHaveBeenCalledTimes(1)
  expect(state.run).not.toHaveBeenCalled(); expect(state.refresh).not.toHaveBeenCalled()
  expect(screen.queryByText('unsafe provider text')).not.toBeInTheDocument()
})

// 验证非授权类引用错误只影响引用展示，不撤销有效发送条件。
it('keeps non-auth citation errors local without closing an otherwise eligible live panel', async () => {
  state.requests = { FINDING_EXPLANATION: citationAdvice() }
  apiMock.mockRejectedValue(new ApiClientError(503, { code: 'opaque', message: '403 denied', traceId: '', details: {} }))
  const denied = vi.fn()
  render(<PersonalLivePanel projectId={project} batch={batch} canSend onDenied={denied} />)
  fireEvent.click(screen.getByRole('button', { name: /核对 Evidence/ }))
  expect(await screen.findByText(/引用无法验证/)).toBeInTheDocument()
  expect(denied).not.toHaveBeenCalled()
  expect(screen.getByText('已校验合成建议')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /调用 DeepSeek 官方 API.*合成摘要/ })).toBeEnabled()
  expect(state.run).not.toHaveBeenCalled(); expect(state.refresh).not.toHaveBeenCalled()
})

// 真实批次状态机回归：以可控异步响应与时钟验证固定槽位、费用状态、串行发送及跨重挂载拒绝标记。
import { act, renderHook } from '@testing-library/react'
import type { AgentRequest } from '../api/agent'
import { PersonalAgentClientError, type PersonalBatchExecution, type PersonalPurpose } from '../api/personalAgent'
import { usePersonalLiveBatch } from './usePersonalLiveBatch'

const mocks = vi.hoisted(() => ({ execution: vi.fn(), request: vi.fn(), run: vi.fn() }))
vi.mock('../api/personalAgent', async (load) => ({ ...await load<typeof import('../api/personalAgent')>(),
  getPersonalBatchExecution: mocks.execution, getPersonalRequest: mocks.request, runPersonalRequest: mocks.run }))

const PROJECT = '11111111-1111-4111-8111-111111111111'
const BATCH = '22222222-2222-4222-8222-222222222222'
const EXPLANATION = '33333333-3333-4333-8333-333333333333'
const SUMMARY = '44444444-4444-4444-8444-444444444444'
const LIVE = '55555555-5555-4555-8555-555555555555'
const NEXT_PROJECT = '66666666-6666-4666-8666-666666666666'
const NOW = '2026-10-16T08:00:00Z'
const PRICE = 'deepseek-flash-context-peak-usd-2026-10-15'
const PURPOSE: PersonalPurpose = 'FINDING_EXPLANATION'
const STOP_KEY = `archguard.agent.live.stop.v1:${PROJECT}:${BATCH}`
let snapshot: PersonalBatchExecution
let requestRecords: Map<string, AgentRequest>

// 生成固定用途的终态 synthetic 模板，绑定扫描、报告和不可变文档版本。
function template(purpose: PersonalPurpose): AgentRequest {
  return { id: purpose === PURPOSE ? EXPLANATION : SUMMARY, projectId: PROJECT,
    requesterId: PROJECT, traceId: 'a'.repeat(32), purpose, state: 'FAILED',
    bindings: { scanJobId: '77777777-7777-4777-8777-777777777777', reportSha256: 'b'.repeat(64),
      prHeadRevisionId: purpose === PURPOSE ? null : '88888888-8888-4888-8888-888888888888',
      findingIds: ['99999999-9999-4999-8999-999999999999'],
      documentVersions: [{ documentVersionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', contentSha256: 'c'.repeat(64) }],
      promptVersion: purpose === PURPOSE ? 'finding-explanation-0.1.0' : 'pr-summary-0.1.0',
      modelProfileVersion: 'disabled-or-test-fake-0.1.0', modelProtocolVersion: 'responses-v1-restricted',
      modelId: 'deterministic-fake-or-disabled', outputSchemaVersion: '0.1.0',
      priceCatalogVersion: 'synthetic-0.1.0', inputDigest: 'd'.repeat(64) },
    result: null, failure: { code: 'MODEL_DISABLED', message: 'Synthetic template' }, usage: null,
    createdAt: NOW, updatedAt: NOW }
}
// 沿用模板选择并切换为固定 live 配置，用于模拟不同异步状态。
function live(purpose: PersonalPurpose = PURPOSE, state: AgentRequest['state'] = 'QUEUED'): AgentRequest {
  const source = template(purpose)
  return { ...source, id: LIVE, state, failure: state === 'FAILED' ? { code: 'OUTPUT_INVALID', message: 'Synthetic failed' } : null,
    bindings: { ...source.bindings, modelProfileVersion: 'deepseek-personal-0.2.0', modelId: 'deepseek-flash',
      priceCatalogVersion: PRICE, promptVersion: purpose === PURPOSE ? 'finding-explanation-deepseek-0.1.0' : 'pr-summary-deepseek-0.1.0' },
    result: state === 'SUCCEEDED' ? { conclusion: 'Synthetic advice', ruleBasis: ['Synthetic rule'], claims: [],
      suggestions: [], citations: [], evidenceCoverage: 'NONE' } : null }
}
// 生成尚无请求/费用尝试的批次快照；空槽位本身并不是补发授权。
function empty(): PersonalBatchExecution {
  return { schemaVersion: '0.1.0', observedAt: NOW, costPolicyVersion: PRICE,
    batch: { id: BATCH, projectId: PROJECT, enablementId: PROJECT, approvedBy: PROJECT, approvedAt: NOW,
      manifestSha256: 'e'.repeat(64), expiresAt: '2026-10-16T09:00:00Z', maxRequests: 2, maxCostMicrousd: 700000, revoked: false },
    accounting: { attemptCount: 0, reservedMicrousd: 0, spentMicrousd: 0 }, stop: null,
    templates: [{ templateRequestId: EXPLANATION, purpose: PURPOSE, request: null, attempt: null },
      { templateRequestId: SUMMARY, purpose: 'PR_SUMMARY', request: null, attempt: null }] }
}
// 将明确请求放入固定解释槽位，并按场景附加已结算或未知费用观测。
function allocated(value: AgentRequest, outcome?: 'SETTLED' | 'UNKNOWN') {
  requestRecords.set(value.id, value)
  snapshot.templates[0].request = { id: value.id, state: value.state, failureCode: value.failure?.code ?? null,
    traceId: value.traceId, createdAt: value.createdAt, updatedAt: value.updatedAt }
  if (outcome) {
    snapshot.templates[0].attempt = { attemptId: PROJECT, utcDay: '2026-10-16', priceCatalogVersion: PRICE,
      reservedMicrousd: 316373, createdAt: NOW, outcome: outcome === 'UNKNOWN'
        ? { state: 'UNKNOWN', actualMicrousd: null, usage: null, recordedAt: NOW }
        : { state: 'SETTLED', actualMicrousd: 273,
          usage: { inputTokens: 110, outputTokens: 200, cachedInputTokens: 0, totalTokens: 310, reasoningTokens: 0 }, recordedAt: NOW } }
    snapshot.accounting = { attemptCount: 1, reservedMicrousd: outcome === 'UNKNOWN' ? 316373 : 0,
      spentMicrousd: outcome === 'SETTLED' ? 273 : 0 }
  }
}
// 启用 Hook 并等待首次异步读取，返回句柄用于控制刷新、发送和卸载。
async function mounted() {
  const hook = renderHook(() => usePersonalLiveBatch(PROJECT, BATCH, true))
  await act(async () => {})
  return hook
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(NOW))
  window.sessionStorage.clear()
  snapshot = empty(); requestRecords = new Map([[EXPLANATION, template(PURPOSE)], [SUMMARY, template('PR_SUMMARY')]])
  mocks.execution.mockReset().mockImplementation(async () => structuredClone(snapshot))
  mocks.request.mockReset().mockImplementation(async (_project: string, id: string) => structuredClone(requestRecords.get(id)))
  mocks.run.mockReset()
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

// 验证默认关闭时，显式刷新或调用 run 也不产生 GET/POST。
it('default disabled performs no GET or POST, even when explicitly refreshed or run', async () => {
  const { result } = renderHook(() => usePersonalLiveBatch(PROJECT, BATCH, false))
  await act(async () => { await result.current.refresh(); await result.current.run(PURPOSE); await vi.advanceTimersByTimeAsync(60000) })
  expect(mocks.execution).not.toHaveBeenCalled(); expect(mocks.request).not.toHaveBeenCalled(); expect(mocks.run).not.toHaveBeenCalled()
  expect(result.current.canSubmit(PURPOSE)).toBe(false)
})

// 验证初次仅 GET，两个不可变合成模板均核对后才允许显式解释。
it('loads only GETs and verifies both immutable synthetic templates before offering an initial explicit explanation', async () => {
  const { result } = await mounted()
  expect(result.current.execution?.batch.id).toBe(BATCH)
  expect(result.current.accessDenied).toBe(false)
  expect(mocks.request.mock.calls.map((call) => call[1])).toEqual([EXPLANATION, SUMMARY])
  expect(result.current.canSubmit(PURPOSE)).toBe(true); expect(result.current.canSubmit('PR_SUMMARY')).toBe(false)
  expect(mocks.run).not.toHaveBeenCalled()
})

// 验证批次精确到期时无需新轮询就关闭发送。
it('disables submission exactly at batch expiry without needing a new poll or changing the authorization', async () => {
  const { result } = await mounted()
  expect(result.current.canSubmit(PURPOSE)).toBe(true)
  vi.setSystemTime(new Date('2026-10-16T09:00:00Z'))
  expect(result.current.canSubmit(PURPOSE)).toBe(false)
  await act(() => result.current.run(PURPOSE))
  expect(mocks.run).not.toHaveBeenCalled()
  expect(result.current.execution?.batch.expiresAt).toBe('2026-10-16T09:00:00Z')
})

// 验证重挂载恢复既有固定请求，不 POST 替代请求。
it('recovers a previously allocated request after remount and never posts a replacement', async () => {
  allocated(live())
  const { result } = await mounted()
  expect(result.current.requests[ PURPOSE ]?.id).toBe(LIVE)
  expect(result.current.canSubmit(PURPOSE)).toBe(false)
  await act(() => result.current.run(PURPOSE))
  expect(mocks.run).not.toHaveBeenCalled()
})

// 验证同一渲染周期双击被同步拦截，只发送一次固定模板。
it('synchronously blocks double clicks and performs a single explicit POST with the fixed template', async () => {
  let resolve!: (value: AgentRequest) => void
  mocks.run.mockImplementation(() => new Promise<AgentRequest>((done) => { resolve = done }))
  const { result } = await mounted()
  let first!: Promise<void>
  act(() => { first = result.current.run(PURPOSE); void result.current.run(PURPOSE) })
  expect(mocks.run).toHaveBeenCalledTimes(1)
  expect(mocks.run.mock.calls[0].slice(0, 3)).toEqual([PROJECT, BATCH, EXPLANATION])
  allocated(live())
  await act(async () => { resolve(live()); await first })
  expect(result.current.requests[PURPOSE]?.id).toBe(LIVE)
  expect(result.current.canSubmit(PURPOSE)).toBe(false)
})

// 验证 POST 结果未知即锁定停止；后续空槽位 GET 也不能补发。
it('unknown POST outcome latches stop even when later GET still has no slot; refresh never retries POST', async () => {
  mocks.run.mockRejectedValue(new Error('private synthetic provider error'))
  const { result } = await mounted()
  await act(() => result.current.run(PURPOSE))
  await act(async () => { await result.current.refresh(); await result.current.run(PURPOSE); await vi.advanceTimersByTimeAsync(60000) })
  expect(mocks.run).toHaveBeenCalledTimes(1)
  expect(result.current.canSubmit(PURPOSE)).toBe(false); expect(result.current.canSubmit('PR_SUMMARY')).toBe(false)
  expect(result.current.error).toContain('补发'); expect(result.current.error).not.toContain('private synthetic')
})

// 验证中断 POST 后可以 GET 恢复已提交请求，仍不再次发送。
it('can recover a committed request with GET after an interrupted POST without sending again', async () => {
  mocks.run.mockRejectedValue(new PersonalAgentClientError(0))
  const { result } = await mounted(); await act(() => result.current.run(PURPOSE))
  allocated(live(PURPOSE, 'SUCCEEDED'), 'SETTLED')
  await act(() => result.current.refresh())
  expect(result.current.requests[PURPOSE]?.id).toBe(LIVE)
  expect(result.current.canSubmit('PR_SUMMARY')).toBe(false)
  await act(() => result.current.run('PR_SUMMARY')); expect(mocks.run).toHaveBeenCalledTimes(1)
})

// 验证只有解释已核对成功且费用结算后才允许显式摘要。
it('permits only the explicit summary after observing a verified successful settled explanation', async () => {
  allocated(live(PURPOSE, 'SUCCEEDED'), 'SETTLED')
  const { result } = await mounted()
  expect(result.current.requests[PURPOSE]?.result?.conclusion).toBe('Synthetic advice')
  expect(result.current.canSubmit('PR_SUMMARY')).toBe(true); expect(result.current.canSubmit(PURPOSE)).toBe(false)
  expect(mocks.run).not.toHaveBeenCalled()
})

// 验证 RUNNING 即使已结算也不代表解释成功，不授予摘要许可。
it('SETTLED while RUNNING is billable but not a successful explanation or summary permit', async () => {
  allocated(live(PURPOSE, 'RUNNING'), 'SETTLED')
  const { result } = await mounted()
  expect(result.current.execution?.accounting.spentMicrousd).toBe(273)
  expect(result.current.canSubmit('PR_SUMMARY')).toBe(false)
  expect(result.current.requests[PURPOSE]?.state).toBe('RUNNING')
})

// 验证 FAILED、UNKNOWN 或 stop 都永久停发，不捏造退款或恢复次数。
it.each(['FAILED', 'UNKNOWN', 'stop'] as const)('%s permanently stops subsequent sends without inventing a refund', async (kind) => {
  allocated(live(PURPOSE, kind === 'FAILED' ? 'FAILED' : 'RUNNING'), kind === 'UNKNOWN' ? 'UNKNOWN' : 'SETTLED')
  if (kind === 'stop') snapshot.stop = { requestId: LIVE, code: 'OUTPUT_INVALID', stoppedAt: NOW }
  const { result } = await mounted()
  expect(result.current.execution?.accounting.reservedMicrousd).toBe(kind === 'UNKNOWN' ? 316373 : 0)
  expect(result.current.canSubmit(PURPOSE)).toBe(false); expect(result.current.canSubmit('PR_SUMMARY')).toBe(false)
  await act(() => result.current.run('PR_SUMMARY')); expect(mocks.run).not.toHaveBeenCalled()
})

// 验证扫描/报告/模型/价格/协议绑定变化会拒绝结果。
it.each(['scanJobId', 'reportSha256', 'modelProfileVersion', 'modelId', 'priceCatalogVersion', 'modelProtocolVersion'] as const)(
  'rejects a recovered live result with a mismatched %s', async (field) => {
    const value = live(PURPOSE, 'SUCCEEDED'); value.bindings[field] = 'private-invalid-version'
    allocated(value, 'SETTLED')
    const { result } = await mounted()
    expect(result.current.requests[PURPOSE]).toBeUndefined(); expect(result.current.canSubmit('PR_SUMMARY')).toBe(false)
    expect(result.current.error).toContain('版本'); expect(result.current.error).not.toContain('private-invalid')
  })

// 验证文档摘要或 Finding 选择变化不能作为同一输入展示。
it('rejects changed document hashes and Finding selections rather than showing a result for another input', async () => {
  const value = live(PURPOSE, 'SUCCEEDED'); value.bindings.documentVersions[0].contentSha256 = 'f'.repeat(64)
  value.bindings.findingIds = [PROJECT]; allocated(value, 'SETTLED')
  const { result } = await mounted()
  expect(result.current.requests[PURPOSE]).toBeUndefined(); expect(result.current.canSubmit('PR_SUMMARY')).toBe(false)
  expect(result.current.error).toContain('版本')
})

// 验证跨 Project 或未绑定文档版本的引用被拒绝。
it('rejects a citation outside the verified Project and pinned document versions', async () => {
  const value = live(PURPOSE, 'SUCCEEDED')
  value.result!.citations = [{ citationId: 'doc-1', source: 'PROJECT_DOCUMENT', label: 'Synthetic citation', projectId: NEXT_PROJECT,
    scanJobId: null, reportSha256: null, evidenceId: null, documentVersionId: PROJECT, contentSha256: 'f'.repeat(64),
    fragmentIndex: 0, fragmentSha256: 'f'.repeat(64) }]
  allocated(value, 'SETTLED')
  const { result } = await mounted()
  expect(result.current.requests[PURPOSE]).toBeUndefined(); expect(result.current.canSubmit('PR_SUMMARY')).toBe(false)
  expect(result.current.error).toContain('版本')
})

// 验证授权错误清空历史并停止轮询。
it.each([401, 403, 404])('clears recovered history and stops polling after authorization loss %s', async (status) => {
  allocated(live(PURPOSE, 'SUCCEEDED'), 'SETTLED')
  const { result } = await mounted(); expect(result.current.requests[PURPOSE]).toBeDefined()
  mocks.execution.mockRejectedValue(new PersonalAgentClientError(status, 'b'.repeat(32)))
  await act(() => result.current.refresh())
  expect(result.current.execution).toBeUndefined(); expect(result.current.requests).toEqual({})
  expect(result.current.accessDenied).toBe(true)
  expect(result.current.error).toContain('权限'); const count = mocks.execution.mock.calls.length
  await act(() => vi.advanceTimersByTimeAsync(60000)); expect(mocks.execution).toHaveBeenCalledTimes(count)
})

// 验证切换 Project 取消并忽略旧 GET 的迟到结果。
it('ignores and cancels a late GET after Project changes', async () => {
  let resolve!: (value: PersonalBatchExecution) => void
  mocks.execution.mockImplementationOnce(() => new Promise<PersonalBatchExecution>((done) => { resolve = done }))
  const { result, rerender } = renderHook(({ project }) => usePersonalLiveBatch(project, BATCH, true), { initialProps: { project: PROJECT } })
  const oldSignal = mocks.execution.mock.calls[0][2] as AbortSignal
  mocks.execution.mockRejectedValue(new PersonalAgentClientError(404)); rerender({ project: NEXT_PROJECT })
  await act(async () => { resolve(empty()) })
  expect(oldSignal.aborted).toBe(true); expect(result.current.execution).toBeUndefined()
  expect(result.current.requests).toEqual({}); expect(mocks.run).not.toHaveBeenCalled()
})

// 验证慢 GET 不重叠，待处理请求的自动恢复只用 GET。
it('never overlaps slow GET recovery and only polls pending requests using GET', async () => {
  allocated(live())
  let resolve!: (value: PersonalBatchExecution) => void
  mocks.execution.mockImplementationOnce(() => new Promise<PersonalBatchExecution>((done) => { resolve = done }))
  const { result } = renderHook(() => usePersonalLiveBatch(PROJECT, BATCH, true))
  await act(async () => { await result.current.refresh(); await vi.advanceTimersByTimeAsync(10000) })
  expect(mocks.execution).toHaveBeenCalledTimes(1)
  await act(async () => { resolve(structuredClone(snapshot)) })
  const count = mocks.execution.mock.calls.length
  await act(() => vi.advanceTimersByTimeAsync(1499)); expect(mocks.execution).toHaveBeenCalledTimes(count)
  await act(() => vi.advanceTimersByTimeAsync(1)); expect(mocks.execution).toHaveBeenCalledTimes(count + 1)
  expect(mocks.run).not.toHaveBeenCalled()
})

// 验证终态历史每三十秒复核，始终没有模型 POST。
it('rechecks terminal history at 30 seconds with no model POST', async () => {
  allocated(live(PURPOSE, 'SUCCEEDED'), 'SETTLED')
  await mounted(); const count = mocks.execution.mock.calls.length
  await act(() => vi.advanceTimersByTimeAsync(29999)); expect(mocks.execution).toHaveBeenCalledTimes(count)
  await act(() => vi.advanceTimersByTimeAsync(1)); expect(mocks.execution).toHaveBeenCalledTimes(count + 1)
  expect(mocks.run).not.toHaveBeenCalled()
})

// 验证卸载取消在途 POST，不能自动开始新发送。
it('aborts an in-flight submission on unmount and never starts another POST', async () => {
  mocks.run.mockImplementation(() => new Promise<AgentRequest>(() => {}))
  const { result, unmount } = await mounted()
  act(() => { void result.current.run(PURPOSE) }); expect(mocks.run).toHaveBeenCalledTimes(1)
  const signal = mocks.run.mock.calls[0][3] as AbortSignal; unmount()
  expect(signal.aborted).toBe(true); await act(() => vi.advanceTimersByTimeAsync(60000))
  expect(mocks.run).toHaveBeenCalledTimes(1)
})

// 验证 pagehide 无需卸载即可取消 GET 并忽略迟到成功。
it('pagehide immediately cancels a pending GET and ignores its late success without polling', async () => {
  let resolve!: (value: PersonalBatchExecution) => void
  mocks.execution.mockImplementationOnce(() => new Promise<PersonalBatchExecution>((done) => { resolve = done }))
  const { result } = renderHook(() => usePersonalLiveBatch(PROJECT, BATCH, true))
  const signal = mocks.execution.mock.calls[0][2] as AbortSignal
  act(() => { window.dispatchEvent(new Event('pagehide')) })
  await act(async () => { resolve(empty()) })
  expect(signal.aborted).toBe(true)
  expect(result.current.execution).toBeUndefined(); expect(result.current.requests).toEqual({})
  expect(result.current.canSubmit(PURPOSE)).toBe(false)
  await act(() => vi.advanceTimersByTimeAsync(60000))
  expect(mocks.execution).toHaveBeenCalledTimes(1); expect(mocks.request).not.toHaveBeenCalled(); expect(mocks.run).not.toHaveBeenCalled()
})

// 验证 pagehide 取消 POST，迟到响应不能启动恢复读取或发布建议。
it('pagehide cancels a pending POST and prevents its late reply from starting GET recovery or publishing advice', async () => {
  let resolve!: (value: AgentRequest) => void
  mocks.run.mockImplementationOnce(() => new Promise<AgentRequest>((done) => { resolve = done }))
  const { result } = await mounted(); const reads = mocks.execution.mock.calls.length
  let sending!: Promise<void>
  act(() => { sending = result.current.run(PURPOSE) })
  const signal = mocks.run.mock.calls[0][3] as AbortSignal
  act(() => { window.dispatchEvent(new Event('pagehide')) })
  allocated(live(PURPOSE, 'SUCCEEDED'), 'SETTLED')
  await act(async () => { resolve(live(PURPOSE, 'SUCCEEDED')); await sending; await vi.advanceTimersByTimeAsync(60000) })
  expect(signal.aborted).toBe(true); expect(result.current.requests).toEqual({})
  expect(result.current.canSubmit('PR_SUMMARY')).toBe(false)
  expect(mocks.execution).toHaveBeenCalledTimes(reads); expect(mocks.run).toHaveBeenCalledTimes(1)
})

// 验证 pagehide 清理已安排的终态历史轮询。
it('pagehide clears an already scheduled terminal GET poll without requiring React unmount', async () => {
  allocated(live(PURPOSE, 'SUCCEEDED'), 'SETTLED')
  await mounted(); const reads = mocks.execution.mock.calls.length
  act(() => { window.dispatchEvent(new Event('pagehide')) })
  await act(() => vi.advanceTimersByTimeAsync(90000))
  expect(mocks.execution).toHaveBeenCalledTimes(reads); expect(mocks.run).not.toHaveBeenCalled()
})

// 验证未知 POST 的标签页拒绝标记跨重挂载保留，即使槽位仍为空。
it('an unknown POST remains stopped across hook remount even when GET still shows an empty slot', async () => {
  mocks.run.mockRejectedValue(new PersonalAgentClientError(0))
  const original = await mounted(); await act(() => original.result.current.run(PURPOSE)); original.unmount()
  const restored = await mounted()
  expect(restored.result.current.execution?.batch.id).toBe(BATCH)
  expect(restored.result.current.canSubmit(PURPOSE)).toBe(false)
  await act(() => restored.result.current.run(PURPOSE))
  expect(mocks.run).toHaveBeenCalledTimes(1); expect(restored.result.current.error).toContain('补发')
})

// 验证未知 POST 即使后续读到成功/已结算解释，也不能恢复发送。
it('an unknown POST remains stopped across remount after GET finds a successful settled explanation', async () => {
  mocks.run.mockRejectedValue(new PersonalAgentClientError(0))
  const original = await mounted(); await act(() => original.result.current.run(PURPOSE))
  allocated(live(PURPOSE, 'SUCCEEDED'), 'SETTLED'); await act(() => original.result.current.refresh()); original.unmount()
  const restored = await mounted()
  expect(restored.result.current.requests[PURPOSE]?.id).toBe(LIVE)
  expect(restored.result.current.canSubmit('PR_SUMMARY')).toBe(false)
  await act(() => restored.result.current.run('PR_SUMMARY'))
  expect(mocks.run).toHaveBeenCalledTimes(1); expect(restored.result.current.error).toContain('补发')
})

// 验证已知接受且交叉证实成功/结算的解释可在重挂载后允许显式摘要。
it('a known accepted POST corroborated as successful and settled still permits the explicit summary after remount', async () => {
  mocks.run.mockImplementationOnce(async () => {
    allocated(live(PURPOSE, 'SUCCEEDED'), 'SETTLED')
    return live(PURPOSE, 'SUCCEEDED')
  })
  const original = await mounted(); await act(() => original.result.current.run(PURPOSE))
  expect(original.result.current.canSubmit('PR_SUMMARY')).toBe(true); original.unmount()
  const restored = await mounted()
  expect(restored.result.current.requests[PURPOSE]?.id).toBe(LIVE)
  expect(restored.result.current.canSubmit('PR_SUMMARY')).toBe(true)
  expect(mocks.run).toHaveBeenCalledTimes(1)
})

// 验证在 POST 尚无响应时卸载，拒绝标记已经先保存。
it('teardown during a pending POST preserves a deny-only marker before any reply exists', async () => {
  mocks.run.mockImplementationOnce(() => new Promise<AgentRequest>(() => {}))
  const original = await mounted(); act(() => { void original.result.current.run(PURPOSE) }); original.unmount()
  const restored = await mounted()
  expect(restored.result.current.execution?.templates[0].request).toBeNull()
  expect(restored.result.current.canSubmit(PURPOSE)).toBe(false)
  await act(() => restored.result.current.run(PURPOSE))
  expect(mocks.run).toHaveBeenCalledTimes(1)
})

// 验证安全标记写入失败时，在 POST 之前就停发。
it('a storage write failure stops before POST instead of losing the navigation safety marker', async () => {
  const { result } = await mounted()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('private-storage-error') })
  await act(() => result.current.run(PURPOSE))
  expect(mocks.run).not.toHaveBeenCalled(); expect(result.current.canSubmit(PURPOSE)).toBe(false)
  expect(result.current.error).not.toContain('private-storage-error')
})

// 验证安全标记不可读时停发，历史 GET 仍可恢复。
it('unreadable marker storage fails closed for sends without preventing historical GET recovery', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('private-storage-error') })
  const { result } = await mounted()
  expect(result.current.execution?.batch.id).toBe(BATCH)
  expect(result.current.canSubmit(PURPOSE)).toBe(false)
  await act(() => result.current.run(PURPOSE))
  expect(mocks.run).not.toHaveBeenCalled(); expect(result.current.error).not.toContain('private-storage-error')
})

// 验证未知标记只能拒绝发送，绝不能作为授权。
it('an unrecognized marker can only deny sending and never becomes an authorization grant', async () => {
  window.sessionStorage.setItem(STOP_KEY, 'private-malformed-marker')
  const { result } = await mounted()
  expect(result.current.execution?.batch.id).toBe(BATCH)
  expect(result.current.canSubmit(PURPOSE)).toBe(false)
  await act(() => result.current.run(PURPOSE))
  expect(mocks.run).not.toHaveBeenCalled(); expect(result.current.error).not.toContain('private-malformed-marker')
})

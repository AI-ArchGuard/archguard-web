// 个人 Agent 客户端回归：假 HTTP 覆盖强 ETag、冻结确认契约、固定幂等、费用与引用校验，以及完整超时边界。
import {
  acknowledgePersonalRisk, approvePersonalBatch, getPersonalBatch, getPersonalBatchExecution, getPersonalEnablement,
  getPersonalRequest, getPersonalRole, getPersonalSettings, PersonalAgentClientError, previewPersonalBatch,
  revokePersonalBatch, revokePersonalEnablement, runPersonalRequest, updatePersonalSettings,
  type PersonalAcknowledgementInput, type PersonalBatchInput,
} from './personalAgent'

const auth = vi.hoisted(() => ({ getUser: vi.fn() }))
vi.mock('../auth/oidc', () => ({ userManager: auth }))
const project = '11111111-1111-4111-8111-111111111111'
const owner = '22222222-2222-4222-8222-222222222222'
const acknowledgement = '33333333-3333-4333-8333-333333333333'
const batchId = '44444444-4444-4444-8444-444444444444'
const explanation = '55555555-5555-4555-8555-555555555555'
const summary = '66666666-6666-4666-8666-666666666666'
const requestId = '77777777-7777-4777-8777-777777777777'
const credential = '88888888-8888-4888-8888-888888888888'
const policy = 'deepseek-flash-context-peak-usd-2026-10-15'
const stamp = '2026-10-16T00:00:00Z'
const expiry = '2026-10-17T00:00:00Z'
const signal = () => new AbortController().signal
const settings = { enabled: true, revision: 12, enablementId: acknowledgement, modelCallsAvailable: false, unavailableReason: 'LIVE_ADAPTER_NOT_READY' }
const enablement = { id: acknowledgement, projectId: project, approvedBy: owner, approvedAt: stamp, expiresAt: expiry,
  credentialVersion: credential, modelAlias: 'deepseek-flash', priceCatalogVersion: policy, priceCatalogExpiresAt: expiry,
  dataScope: 'SYNTHETIC_ACCEPTANCE', revoked: false, revokedAt: null }
const batch = { id: batchId, projectId: project, enablementId: acknowledgement, approvedBy: owner, approvedAt: stamp,
  manifestSha256: 'a'.repeat(64), expiresAt: expiry, maxRequests: 2, maxCostMicrousd: 700000, revoked: false }
const execution = () => ({ schemaVersion: '0.1.0', observedAt: stamp, batch: { ...batch }, costPolicyVersion: policy,
  accounting: { attemptCount: 0, reservedMicrousd: 0, spentMicrousd: 0 }, stop: null,
  templates: [{ templateRequestId: explanation, purpose: 'FINDING_EXPLANATION', request: null, attempt: null },
    { templateRequestId: summary, purpose: 'PR_SUMMARY', request: null, attempt: null }] })
const agentRequest = () => ({ id: requestId, projectId: project, requesterId: owner, traceId: 'a'.repeat(32), purpose: 'FINDING_EXPLANATION',
  state: 'QUEUED', createdAt: stamp, updatedAt: stamp, result: null, failure: null, usage: null,
  bindings: { scanJobId: explanation, reportSha256: 'b'.repeat(64), prHeadRevisionId: null, findingIds: [summary], documentVersions: [],
    promptVersion: 'finding-explanation-deepseek-0.1.0', modelProfileVersion: 'deepseek-personal-0.2.0', modelProtocolVersion: 'responses-v1-restricted',
    modelId: 'deepseek-flash', outputSchemaVersion: '0.1.0', priceCatalogVersion: policy, inputDigest: 'c'.repeat(64) } })
const successfulRequest = () => ({ ...agentRequest(), state: 'SUCCEEDED',
  bindings: { ...agentRequest().bindings, documentVersions: [{ documentVersionId: credential, contentSha256: 'd'.repeat(64) }] },
  result: { conclusion: 'Synthetic finding advice.', ruleBasis: ['Synthetic rule basis.'], claims: ['Synthetic scoped claim.'],
    suggestions: [{ text: 'Verify the synthetic boundary manually.', kind: 'HUMAN_VERIFICATION', requiresHumanReview: true }],
    evidenceCoverage: 'COMPLETE', citations: [
      { citationId: 'evidence-1', source: 'SCANNER_EVIDENCE', label: 'Synthetic evidence', projectId: project, scanJobId: explanation,
        reportSha256: 'b'.repeat(64), evidenceId: summary, documentVersionId: null, contentSha256: null, fragmentIndex: null, fragmentSha256: null },
      { citationId: 'document-1', source: 'PROJECT_DOCUMENT', label: 'Synthetic document fragment', projectId: project, scanJobId: null,
        reportSha256: null, evidenceId: null, documentVersionId: credential, contentSha256: 'd'.repeat(64), fragmentIndex: 0, fragmentSha256: 'e'.repeat(64) },
    ] }, usage: { inputTokens: 1000, outputTokens: 100, latencyMs: 20, providerLatencyMs: 10, estimatedCostMicrousd: 316373,
    actualCostMicrousd: 273, providerResponseId: 'synthetic-response-only', actualModelId: 'deepseek-flash' } })
const riskInput = (): PersonalAcknowledgementInput => ({ schemaVersion: '0.4.0', scope: 'PERSONAL', accountRef: 'personal-local',
  deploymentRef: 'local-compose', expiresAt: expiry, sources: [
    { kind: 'TERMS', url: 'https://cdn.deepseek.com/policies/zh-CN/deepseek-open-platform-terms-of-service.html', version: 'review-1', checkedAt: stamp },
    { kind: 'PRIVACY', url: 'https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html', version: 'review-1', checkedAt: stamp },
    { kind: 'CACHE', url: 'https://api-docs.deepseek.com/guides/kv_cache/', version: 'review-1', checkedAt: stamp },
    { kind: 'MODEL_PRICE', url: 'https://api-docs.deepseek.com/quick_start/pricing/', version: 'review-1', checkedAt: stamp },
  ], unknowns: ['PROCESSING_REGION', 'STORAGE_REGION', 'TRAINING', 'HUMAN_REVIEW', 'LOG_RETENTION', 'CACHE_ISOLATION', 'CACHE_RETENTION', 'SUBPROCESSORS'],
  riskAccepted: true, modelAlias: 'deepseek-flash', mappingSnapshot: 'DeepSeek-V4.1-Flash-1017', allowedResponseModels: ['deepseek-flash'],
  priceCatalogVersion: policy, priceCatalogExpiresAt: expiry, secretCheckRef: 'secret-check-1', networkCheckRef: 'network-check-1',
  dataScope: 'SYNTHETIC_ACCEPTANCE', revocationConditions: ['OWNER_REVOKED', 'SCOPE_CHANGED', 'POLICY_CHANGED', 'MODEL_CHANGED', 'PRICE_CHANGED', 'SECRET_CHECK_INVALID', 'NETWORK_CHECK_INVALID'], credentialVersion: credential })
const batchInput = (): PersonalBatchInput => ({ enablementId: acknowledgement, syntheticInventoryId: credential,
  templateRequestIds: [explanation, summary], manifestSha256: 'a'.repeat(64), expiresAt: expiry,
  maxRequests: 2, maxCostMicrousd: 700000, callsApproved: true })
// 统一生成带 JSON 媒体类型的假 HTTP 响应；各场景可单独覆盖状态或头部。
function response(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}
// 替换 fetch 并返回 spy，使测试可核对路径、发送次数、正文和头部。
function mock(value: unknown, status = 200, headers: Record<string, string> = {}) {
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response(value, status, headers)))
  vi.stubGlobal('fetch', fetcher); return fetcher
}

beforeEach(() => { auth.getUser.mockResolvedValue({ expired: false, access_token: 'synthetic-test-token', profile: { sub: owner } }) })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })

// 验证超出 JS 整数精度的强 ETag 原样保留，只使用固定同源设置接口。
it('preserves the original strong ETag beyond JS integer precision and uses only fixed same-origin controls', async () => {
  const raw = JSON.stringify(settings).replace('"revision":12', '"revision":9007199254740993')
  const fetcher = vi.fn().mockImplementation((_path: string, init: RequestInit) => Promise.resolve(new Response(init.method === 'PUT'
    ? JSON.stringify({ ...settings, enabled: false, enablementId: null, unavailableReason: 'PROJECT_DISABLED' })
      .replace('"revision":12', '"revision":9007199254740994') : raw,
  { headers: { 'Content-Type': 'application/json', ETag: init.method === 'PUT' ? '"9007199254740994"' : '"9007199254740993"' } })))
  vi.stubGlobal('fetch', fetcher)
  const read = await getPersonalSettings(project, signal())
  expect(read.etag).toBe('"9007199254740993"')
  await updatePersonalSettings(project, { enabled: false, enablementId: null }, read.etag, signal())
  expect(fetcher).toHaveBeenCalledTimes(2)
  const [path, init] = fetcher.mock.calls[1] as [string, RequestInit]
  expect(path).toBe(`/api/v1/projects/${project}/agent/settings`)
  expect(init).toMatchObject({ method: 'PUT', cache: 'no-store', credentials: 'same-origin', redirect: 'error', referrerPolicy: 'no-referrer' })
  expect(new Headers(init.headers).get('If-Match')).toBe('"9007199254740993"')
  expect(new Headers(init.headers).get('Authorization')).toBe('Bearer synthetic-test-token')
})

// 逐项拒绝弱 ETag、非规范数值、超范围、与正文不符或缺失的设置版本。
it.each(['W/"12"', '"01"', '"9223372036854775808"', '"13"', '"12", "13"', ''])('rejects invalid, stale-body or missing settings ETags %s', async etag => {
  mock(settings, 200, { ETag: etag })
  await expect(getPersonalSettings(project, signal())).rejects.toBeInstanceOf(PersonalAgentClientError)
})

// 验证每项管理操作独立，不触发 live 路由也不保存输入。
it('exposes every management operation without triggering the live endpoint or persisting input', async () => {
  const local = vi.spyOn(window.localStorage, 'setItem'), session = vi.spyOn(window.sessionStorage, 'setItem')
  const fetcher = vi.fn().mockImplementation((path: string, init: RequestInit) => {
    const status = path.endsWith('/enablements') || (path.endsWith('/batches') && init.method === 'POST') ? 201 : 200
    return Promise.resolve(response(path.includes('/enablement') ? path.endsWith('/revoke') ? { ...enablement, revoked: true, revokedAt: stamp } : enablement : path.endsWith('/preview')
      ? { schemaVersion: '0.1.0', manifestSha256: 'a'.repeat(64), templateCount: 2 }
      : path.endsWith('/execution') ? execution() : path.endsWith('/revoke') ? { ...batch, revoked: true } : batch, status))
  })
  vi.stubGlobal('fetch', fetcher)
  await getPersonalEnablement(project, acknowledgement, signal()); await acknowledgePersonalRisk(project, riskInput(), signal())
  await revokePersonalEnablement(project, acknowledgement, signal()); await previewPersonalBatch(project, [explanation, summary], signal())
  await approvePersonalBatch(project, batchInput(), signal()); await getPersonalBatch(project, batchId, signal())
  await getPersonalBatchExecution(project, batchId, signal()); await revokePersonalBatch(project, batchId, signal())
  expect(fetcher).toHaveBeenCalledTimes(8)
  for (const [path, init] of fetcher.mock.calls as [string, RequestInit][]) {
    expect(path.startsWith(`/api/v1/projects/${project}/agent/`)).toBe(true)
    expect(path).not.toContain('live-requests')
    expect(init).toMatchObject({ cache: 'no-store', credentials: 'same-origin', redirect: 'error', referrerPolicy: 'no-referrer' })
    if (path.endsWith('/revoke')) expect(init.body).toBeUndefined()
  }
  expect(local).not.toHaveBeenCalled(); expect(session).not.toHaveBeenCalled()
})

// 验证终态回包或人工重复调用后，batch/template 幂等键始终不变。
it('keeps one deterministic batch/template key even after terminal replies or manual repeated invocation', async () => {
  const fetcher = mock(agentRequest(), 202)
  await runPersonalRequest(project, batchId, explanation, signal()); await runPersonalRequest(project, batchId, explanation, signal())
  const [path, init] = fetcher.mock.calls[0] as [string, RequestInit]
  expect(path).toBe(`/api/v1/projects/${project}/agent/live-requests`)
  expect(JSON.parse(init.body as string)).toEqual({ batchId, templateRequestId: explanation })
  const keys = fetcher.mock.calls.map(call => new Headers(call[1].headers).get('Idempotency-Key'))
  expect(keys[0]).toBe(keys[1]); expect(keys[0]?.length).toBeLessThanOrEqual(128)
  expect(keys[0]).toMatch(/^[!-~]+$/)
  expect(fetcher).toHaveBeenCalledTimes(2)
})

// 验证错误正文不解析，只展示经过筛选的头部 trace，不重试。
it('never parses untrusted error bodies, exposes only safe header trace and performs no retry', async () => {
  const secret = 'synthetic-private-error-only'
  const reply = response({ message: secret, apiKey: secret }, 503, { 'X-Request-Id': 'd'.repeat(32) })
  const parse = vi.spyOn(reply, 'json'), text = vi.spyOn(reply, 'text')
  const fetcher = vi.fn().mockResolvedValue(reply); vi.stubGlobal('fetch', fetcher)
  try { await runPersonalRequest(project, batchId, explanation, signal()); expect.fail('must reject') }
  catch (error) {
    expect(error).toBeInstanceOf(PersonalAgentClientError)
    expect((error as PersonalAgentClientError).status).toBe(503)
    expect((error as PersonalAgentClientError).traceId).toBe('d'.repeat(32))
    expect(String(error)).not.toContain(secret)
  }
  expect(parse).not.toHaveBeenCalled(); expect(text).not.toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledTimes(1)
  expect(new PersonalAgentClientError(500, secret).traceId).toBe('')
})

// 验证路径注入在 fetch 前拒绝。
it.each(['https://api.deepseek.com', '../projects', `${project}/../${owner}`, '1-1-1-1-1'])('rejects path injection before fetching: %s', async id => {
  const fetcher = mock(batch)
  await expect(getPersonalBatch(id, batchId, signal())).rejects.toBeInstanceOf(PersonalAgentClientError)
  await expect(runPersonalRequest(project, id, explanation, signal())).rejects.toBeInstanceOf(PersonalAgentClientError)
  expect(fetcher).not.toHaveBeenCalled()
})

// 逐项拒绝不可信元数据或范围/契约不一致的回包。
it.each([
  { ...enablement, projectId: owner }, { ...enablement, priceCatalogVersion: 'deepseek-flash-peak-usd-2026-10-06' },
  { ...enablement, apiKey: 'synthetic-forbidden-success-field' }, { ...enablement, revoked: true, revokedAt: null },
])('rejects out-of-scope, legacy and malformed acknowledgement metadata', async value => {
  mock(value)
  await expect(getPersonalEnablement(project, acknowledgement, signal())).rejects.toBeInstanceOf(PersonalAgentClientError)
})

// 验证 UTF-8 正文大小、媒体类型及状态限制，网络错误不泄露细节。
it('bounds UTF-8 metadata, validates media/status and rejects network error detail', async () => {
  const fetcher = mock({ ...batch, extra: '中'.repeat(11000) })
  await expect(getPersonalBatch(project, batchId, signal())).rejects.toBeInstanceOf(PersonalAgentClientError)
  fetcher.mockResolvedValue(new Response(JSON.stringify(batch), { headers: { 'Content-Type': 'text/html' } }))
  await expect(getPersonalBatch(project, batchId, signal())).rejects.toBeInstanceOf(PersonalAgentClientError)
  fetcher.mockResolvedValue(response(batch, 201))
  await expect(getPersonalBatch(project, batchId, signal())).rejects.toBeInstanceOf(PersonalAgentClientError)
  fetcher.mockRejectedValue(new Error('synthetic-private-network-diagnostic'))
  await expect(getPersonalBatch(project, batchId, signal())).rejects.not.toThrow('synthetic-private-network-diagnostic')
  expect(fetcher).toHaveBeenCalledTimes(4)
})

// 验证批准的 1017 确认只通过固定同源边界显式发送。
it('accepts the explicitly approved 1017 acknowledgement through the fixed same-origin client boundary', async () => {
  const fetcher = mock(enablement, 201), input = riskInput()
  await expect(acknowledgePersonalRisk(project, input, signal())).resolves.toEqual(enablement)
  expect(fetcher).toHaveBeenCalledTimes(1)
  const [path, init] = fetcher.mock.calls[0] as [string, RequestInit]
  expect(path).toBe(`/api/v1/projects/${project}/agent/enablements`)
  expect(init).toMatchObject({ method: 'POST', cache: 'no-store', credentials: 'same-origin', redirect: 'error', referrerPolicy: 'no-referrer' })
  const body = JSON.parse(init.body as string)
  expect(body).toEqual(input)
  expect(body).toMatchObject({ schemaVersion: '0.4.0', mappingSnapshot: 'DeepSeek-V4.1-Flash-1017',
    modelAlias: 'deepseek-flash', allowedResponseModels: ['deepseek-flash'],
    priceCatalogVersion: 'deepseek-flash-context-peak-usd-2026-10-15' })
  expect(body).not.toHaveProperty('$defs'); expect(body).not.toHaveProperty('apiKey'); expect(body).not.toHaveProperty('callsApproved')
})

// 逐项拒绝不符合冻结确认契约的出站字段或映射。
it.each([
  ['old 0.3.0 mapping', { schemaVersion: '0.3.0', mappingSnapshot: 'deepseek-v4.1-flash-2026-10-15' }],
  ['old 0.2.0 mapping and price', { schemaVersion: '0.2.0', mappingSnapshot: 'deepseek-v4.1-flash-2026-10-06', priceCatalogVersion: 'deepseek-flash-peak-usd-2026-10-06' }],
  ['new schema with old mapping', { mappingSnapshot: 'deepseek-v4.1-flash-2026-10-15' }],
  ['old schema with approved mapping', { schemaVersion: '0.3.0' }],
  ['wrong-case approved mapping', { mappingSnapshot: 'deepseek-v4.1-flash-1017' }],
  ['snapshot used as request alias', { modelAlias: 'DeepSeek-V4.1-Flash-1017' }],
  ['empty response model list', { allowedResponseModels: [] }],
  ['duplicate response alias', { allowedResponseModels: ['deepseek-flash', 'deepseek-flash'] }],
  ['extra response model', { allowedResponseModels: ['deepseek-flash', 'DeepSeek-V4.1-Flash-1017'] }],
  ['snapshot used as response model', { allowedResponseModels: ['DeepSeek-V4.1-Flash-1017'] }],
  ['wrong-case response alias', { allowedResponseModels: ['DeepSeek-Flash'] }],
  ['legacy price', { priceCatalogVersion: 'deepseek-flash-peak-usd-2026-10-06' }],
  ['unknown outbound field', { unexpected: true }],
  ['$defs in request body', { $defs: {} }],
  ['credential material in request body', { apiKey: 'synthetic-forbidden' }],
  ['oversized acknowledgement', { accountRef: 'x'.repeat(9000) }],
] as const)('rejects unexpected outbound fields, oversized bodies and legacy body before network: %s', async (_label, changed) => {
  const fetcher = mock(enablement, 201)
  const input = { ...riskInput(), ...changed } as unknown as PersonalAcknowledgementInput
  await expect(acknowledgePersonalRisk(project, input, signal())).rejects.toMatchObject({ status: 400 })
  expect(fetcher).not.toHaveBeenCalled()
})

// 验证批次输入有额外字段时在网络前拒绝。
it('rejects unexpected outbound batch fields before network', async () => {
  const fetcher = mock(enablement, 201)
  await expect(approvePersonalBatch(project, { ...batchInput(), apiKey: 'synthetic-forbidden' } as PersonalBatchInput, signal())).rejects.toBeInstanceOf(PersonalAgentClientError)
  expect(fetcher).not.toHaveBeenCalled()
})

// 验证无 attempt、待结算、已知零费用及未知预留是不同事实。
it('does not confuse absent attempt, pending settlement, known zero and unknown retained reservation', async () => {
  const request = { id: requestId, state: 'RUNNING', failureCode: null, traceId: 'a'.repeat(32), createdAt: stamp, updatedAt: stamp }
  const attempt = { attemptId: credential, utcDay: '2026-10-16', priceCatalogVersion: policy, reservedMicrousd: 316373, createdAt: stamp, outcome: null }
  const fresh = execution()
  const allocated = { ...fresh, templates: [{ ...fresh.templates[0], request }, fresh.templates[1]] }
  const pending = { ...allocated, accounting: { attemptCount: 1, reservedMicrousd: 316373, spentMicrousd: 0 },
    templates: [{ ...allocated.templates[0], attempt }, fresh.templates[1]] }
  const known = { ...pending, accounting: { attemptCount: 1, reservedMicrousd: 0, spentMicrousd: 0 },
    templates: [{ ...pending.templates[0], attempt: { ...attempt, outcome: { state: 'SETTLED', actualMicrousd: 0,
      usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, totalTokens: 0, reasoningTokens: 0 }, recordedAt: stamp } } }, fresh.templates[1]] }
  const unknown = { ...pending, stop: { requestId, code: 'OUTPUT_INVALID', stoppedAt: stamp }, templates: [
    { ...pending.templates[0], attempt: { ...attempt, outcome: { state: 'UNKNOWN', actualMicrousd: null, usage: null, recordedAt: stamp } } }, fresh.templates[1]] }
  for (const value of [fresh, allocated, pending, known, unknown]) {
    mock(value); expect(await getPersonalBatchExecution(project, batchId, signal())).toEqual(value)
  }
})

// 验证输入 Token 超限失败保留固定槽位、停止原因和已知费用。
it('recovers a failed input-token-limit slot and stop while retaining its known charge', async () => {
  const fresh = execution()
  const value = { ...fresh, accounting: { attemptCount: 1, reservedMicrousd: 0, spentMicrousd: 2521 },
    stop: { requestId, code: 'INPUT_TOKEN_LIMIT', stoppedAt: stamp }, templates: [{ ...fresh.templates[0],
      request: { id: requestId, state: 'FAILED', failureCode: 'INPUT_TOKEN_LIMIT', traceId: 'a'.repeat(32), createdAt: stamp, updatedAt: stamp },
      attempt: { attemptId: credential, utcDay: '2026-10-16', priceCatalogVersion: policy, reservedMicrousd: 316373, createdAt: stamp,
        outcome: { state: 'SETTLED', actualMicrousd: 2521, recordedAt: stamp,
          usage: { inputTokens: 8001, outputTokens: 100, cachedInputTokens: 0, totalTokens: 8101, reasoningTokens: 0 } } },
    }, fresh.templates[1]] }
  const fetcher = mock(value)
  const recovered = await getPersonalBatchExecution(project, batchId, signal())
  expect(recovered.templates[0].request?.failureCode).toBe('INPUT_TOKEN_LIMIT')
  expect(recovered.stop?.code).toBe('INPUT_TOKEN_LIMIT')
  expect(recovered.accounting).toEqual({ attemptCount: 1, reservedMicrousd: 0, spentMicrousd: 2521 })
  expect(recovered.templates[0].attempt?.outcome?.usage?.inputTokens).toBe(8001)
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(fetcher.mock.calls[0][1].method).toBe('GET')
})

// 验证执行视图的 Token 超限代码不扩展普通 AgentRequest 失败契约。
it('keeps the generic AgentRequest failure contract narrow even when execution has a token-limit code', async () => {
  mock({ ...agentRequest(), state: 'FAILED', failure: { code: 'INPUT_TOKEN_LIMIT', message: 'Synthetic unsupported generic code.' } })
  await expect(getPersonalRequest(project, requestId, signal())).rejects.toBeInstanceOf(PersonalAgentClientError)
})

// 逐项拒绝槽位、费用或异步状态不一致的执行快照。
it.each([
  () => ({ ...execution(), batch: { ...batch, projectId: owner } }),
  () => ({ ...execution(), accounting: { attemptCount: 0, reservedMicrousd: 1, spentMicrousd: 0 } }),
  () => ({ ...execution(), templates: [...execution().templates].reverse() }),
  () => ({ ...execution(), canCall: true }),
  () => ({ ...execution(), accounting: { attemptCount: 0, reservedMicrousd: 0, spentMicrousd: Number.MAX_SAFE_INTEGER + 1 } }),
])('rejects inconsistent execution facts rather than manufacturing available calls', async create => {
  mock(create())
  await expect(getPersonalBatchExecution(project, batchId, signal())).rejects.toBeInstanceOf(PersonalAgentClientError)
})

// 验证读取请求身份/Project，合成模板读取不混入 live 发送。
it('validates request ID/Project and keeps the synthetic template route distinct from live submission', async () => {
  const fetcher = mock(agentRequest())
  expect((await getPersonalRequest(project, requestId, signal())).id).toBe(requestId)
  expect(fetcher.mock.calls[0][0]).toBe(`/api/v1/projects/${project}/agent/requests/${requestId}`)
  fetcher.mockResolvedValue(response({ ...agentRequest(), id: owner }))
  await expect(getPersonalRequest(project, requestId, signal())).rejects.toBeInstanceOf(PersonalAgentClientError)
  fetcher.mockResolvedValue(response({ ...agentRequest(), projectId: owner }, 202))
  await expect(runPersonalRequest(project, batchId, explanation, signal())).rejects.toBeInstanceOf(PersonalAgentClientError)
  const synthetic = agentRequest(); synthetic.bindings.modelProfileVersion = 'disabled-or-test-fake-0.1.0'
  synthetic.bindings.modelId = 'deterministic-fake-or-disabled'; synthetic.bindings.priceCatalogVersion = 'synthetic-0.1.0'
  synthetic.bindings.promptVersion = 'finding-explanation-0.1.0'
  fetcher.mockResolvedValue(response(synthetic, 202))
  await expect(runPersonalRequest(project, batchId, explanation, signal())).rejects.toBeInstanceOf(PersonalAgentClientError)
})

// 验证成功请求只接受绑定 Evidence 与不可变文档摘要的引用。
it('accepts a successful request only with its bound Evidence and immutable document citations', async () => {
  const fetcher = mock(successfulRequest())
  const value = await getPersonalRequest(project, requestId, signal())
  expect(value.state).toBe('SUCCEEDED')
  expect(value.result?.conclusion).toBe('Synthetic finding advice.')
  expect(value.result?.citations).toHaveLength(2)
  expect(value.result?.citations[0]).toMatchObject({ source: 'SCANNER_EVIDENCE', projectId: project, scanJobId: explanation,
    reportSha256: 'b'.repeat(64), evidenceId: summary })
  expect(value.result?.citations[1]).toMatchObject({ source: 'PROJECT_DOCUMENT', documentVersionId: credential,
    contentSha256: 'd'.repeat(64), fragmentIndex: 0, fragmentSha256: 'e'.repeat(64) })
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(fetcher.mock.calls[0][1].method).toBe('GET')
})

// 逐项拒绝不可信结果、引用或绑定字段。
it.each([
  ['Project', 0, 'projectId', owner],
  ['scan', 0, 'scanJobId', owner],
  ['report', 0, 'reportSha256', 'f'.repeat(64)],
  ['document version', 1, 'documentVersionId', acknowledgement],
  ['document content', 1, 'contentSha256', 'f'.repeat(64)],
] as const)('rejects a successful response whose citation crosses the bound %s', async (_label, index, field, changed) => {
  const value = successfulRequest()
  value.result.citations[index][field] = changed
  mock(value)
  await expect(getPersonalRequest(project, requestId, signal())).rejects.toBeInstanceOf(PersonalAgentClientError)
})

// 验证成员角色有界分页且使用可取消专用路径。
it('reads role with bounded pagination and never invokes the old uncancellable role helper', async () => {
  const members = Array.from({ length: 100 }, (_, index) => ({ actorId: `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
    role: 'VIEWER', createdAt: stamp }))
  const fetcher = vi.fn().mockResolvedValueOnce(response({ items: members, page: 0, size: 100, total: 101 }))
    .mockResolvedValueOnce(response({ items: [{ actorId: owner, role: 'MAINTAINER', createdAt: stamp }], page: 1, size: 100, total: 101 }))
  vi.stubGlobal('fetch', fetcher)
  expect(await getPersonalRole(project, owner, signal())).toBe('MAINTAINER')
  expect(fetcher.mock.calls.map(call => call[0])).toEqual([`/api/v1/projects/${project}/members?page=0&size=100`, `/api/v1/projects/${project}/members?page=1&size=100`])
  expect(fetcher.mock.calls[0][1].signal).toBe(fetcher.mock.calls[1][1].signal)
})

// 验证预先取消或认证等待超时均不启动 fetch。
it('aborts before network and cancels a stalled authentication wait without starting fetch', async () => {
  const fetcher = mock(batch)
  const controller = new AbortController(); controller.abort()
  await expect(getPersonalBatch(project, batchId, controller.signal)).rejects.toBeInstanceOf(PersonalAgentClientError)
  auth.getUser.mockResolvedValue({ expired: true })
  await expect(getPersonalBatch(project, batchId, signal())).rejects.toMatchObject({ status: 401 })
  expect(fetcher).not.toHaveBeenCalled()
  auth.getUser.mockImplementation(() => new Promise(() => {}))
  const waiting = new AbortController(), result = getPersonalBatch(project, batchId, waiting.signal)
  waiting.abort(); await expect(result).rejects.toBeInstanceOf(PersonalAgentClientError)
  expect(fetcher).not.toHaveBeenCalled()
})

// 验证模拟传输忽略 abort 时，原始十五秒期限仍结束等待。
it('cancels a stalled fetch at the original fifteen-second deadline even when the fake transport ignores abort', async () => {
  vi.useFakeTimers()
  const fetcher = vi.fn().mockImplementation(() => new Promise(() => {})); vi.stubGlobal('fetch', fetcher)
  const observed = getPersonalBatch(project, batchId, signal()).then(() => 'unexpected-success', error => error as unknown)
  await vi.advanceTimersByTimeAsync(0)
  expect(fetcher).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(14999)
  expect((fetcher.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(await observed).toBeInstanceOf(PersonalAgentClientError)
  expect((fetcher.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true)
  expect(fetcher).toHaveBeenCalledTimes(1)
})

// 验证 JSON 流中途停滞会取消，不返回或展示部分元数据。
it('cancels a response stream stalled mid-JSON and does not return or display partial metadata', async () => {
  let started!: () => void
  const reading = new Promise<void>(resolve => { started = resolve }), cancel = vi.fn()
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode('{"id":')) },
    pull() { started(); return new Promise(() => {}) },
    cancel,
  })
  const fetcher = vi.fn().mockResolvedValue(new Response(body, { headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', fetcher)
  const controller = new AbortController()
  const observed = getPersonalBatch(project, batchId, controller.signal).then(() => 'unexpected-success', error => error as unknown)
  await reading; controller.abort()
  expect(await observed).toBeInstanceOf(PersonalAgentClientError)
  expect(cancel).toHaveBeenCalledTimes(1); expect(fetcher).toHaveBeenCalledTimes(1)
})

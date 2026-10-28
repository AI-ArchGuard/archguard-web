// 个人 Agent 专用边界：消费固定契约，对输入与不可信响应逐项校验；管理操作、历史读取和显式 live 发送分开。
import type { components as Enablement, operations as EnablementOperations } from './agent-enablement-schema'
import type { components as Batches, operations as BatchOperations } from './agent-batches-schema'
import type { AgentRequest } from './agent'
import type { ProjectMember } from './types'
import { userManager } from '../auth/oidc'

// 当前 Project 开关与服务器可用性快照。
export type PersonalSettings = Enablement['schemas']['Settings']
// 把设置与原始强 ETag 作为同一读取结果传递，后续并发写入必须沿用该 ETag。
export type PersonalSettingsSnapshot = { value: PersonalSettings; etag: string }
// 带凭据/价格及有效期绑定的个人风险确认，不等于费用批次批准。
export type PersonalEnablement = Enablement['schemas']['Enablement']
// 只允许当前 0.4.0 确认请求；Schema 的 $defs 是描述信息，不进入 JSON 请求正文。
// $defs describes the fixed schema, not a field accepted in the JSON request body.
export type PersonalAcknowledgementInput = Omit<Extract<EnablementOperations['acknowledgePersonalAgentRisk']['requestBody']['content']['application/json'], { schemaVersion: '0.4.0' }>, '$defs'>
// 费用批次批准请求限定为两次调用，模板与清单必须明确。
export type PersonalBatchInput = Extract<BatchOperations['approvePersonalSyntheticBatch']['requestBody']['content']['application/json'], { maxRequests: 2 }>
// 既有批次的批准、清单、额度和撤销元数据。
export type PersonalBatch = Batches['schemas']['Batch']
// 服务器提供的批次槽位、尝试和费用执行事实；本身不授予发送权限。
export type PersonalBatchExecution = Batches['schemas']['BatchExecution']
// 批次的两个用途：解释与摘要，按固定顺序串行执行。
export type PersonalPurpose = Batches['schemas']['TemplateExecution']['purpose']
// 模板预览的版本、数量和清单摘要，用于后续明确批准。
export type PersonalBatchPreview = Batches['schemas']['Preview']

// 个人 Agent 边界的安全错误类型：状态映射为固定操作建议，不保留不可信正文。
export class PersonalAgentClientError extends Error {
  public readonly traceId: string
  constructor(public readonly status: number, traceId = '') {
    super(status === 401 ? '会话已失效，请重新登录。' : status === 403 || status === 404 ? '无权访问此 Project 或记录不存在。'
      : status === 400 ? '输入或接口格式无效，请核对后重新操作。'
      : status === 409 ? '批准或请求状态冲突；请只刷新读取，不要补发。'
      : status === 412 || status === 428 ? '设置版本已变化；请手动刷新后重新确认。'
      : status === 429 ? '额度或请求上限已达到；不会自动重试。'
      : status === 503 ? '个人 Agent 已关闭或安全条件不可用；请只刷新读取。'
      : '操作结果未确认；请手动恢复读取，不会自动重试或补发。')
    this.traceId = /^[0-9a-f]{32}$/.test(traceId) ? traceId : ''
  }
}

const policy = 'deepseek-flash-context-peak-usd-2026-10-15'
const reservation = 316373
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const sha = /^[a-f0-9]{64}$/
const requestStates = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED']
const failures: NonNullable<AgentRequest['failure']>['code'][] = ['MODEL_DISABLED', 'MODEL_UNAVAILABLE', 'MODEL_TIMEOUT', 'QUOTA_EXHAUSTED', 'OUTPUT_INVALID', 'CITATION_INVALID', 'AUTHORIZATION_REVOKED', 'INTERNAL_ERROR']
const executionFailures: Batches['schemas']['FailureCode'][] = [...failures, 'INPUT_TOKEN_LIMIT']
const unavailableReasons = ['PROJECT_DISABLED', 'DEPLOYMENT_DISABLED', 'LIVE_ADAPTER_NOT_READY', 'DEPLOYMENT_CHANGED',
  'ENABLEMENT_REVOKED', 'ENABLEMENT_EXPIRED', 'PRICE_EXPIRED', 'CREDENTIAL_CHANGED', 'CREDENTIAL_UNAVAILABLE']
const sources: Record<string, string> = {
  TERMS: 'https://cdn.deepseek.com/policies/zh-CN/deepseek-open-platform-terms-of-service.html',
  PRIVACY: 'https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html', CACHE: 'https://api-docs.deepseek.com/guides/kv_cache/',
  MODEL_PRICE: 'https://api-docs.deepseek.com/quick_start/pricing/', PROTOCOL: 'https://api-docs.deepseek.com/guides/responses_api/',
}
const unknownRisks = ['PROCESSING_REGION', 'STORAGE_REGION', 'TRAINING', 'HUMAN_REVIEW', 'LOG_RETENTION', 'CACHE_ISOLATION', 'CACHE_RETENTION', 'SUBPROCESSORS']
const revocations = ['OWNER_REVOKED', 'SCOPE_CHANGED', 'POLICY_CHANGED', 'MODEL_CHANGED', 'PRICE_CHANGED', 'SECRET_CHECK_INVALID', 'NETWORK_CHECK_INVALID']
// 待逐项校验的 JSON 对象；unknown 字段尚未被视为可信业务数据。
type JsonObject = Record<string, unknown>
// 保留解析值、原始正文和响应头，支持 ETag 与 int64 原始文本交叉核对。
type Reply = { value: unknown; source: string; headers: Headers }

// 所有专用校验失败都转为固定客户端错误，未知响应默认不被接受。
function requireValue(condition: unknown, status = 0): asserts condition { if (!condition) throw new PersonalAgentClientError(status) }
// 校验对象必填字段及完整白名单，防止类型断言掩盖多余或缺失的字段。
function object(value: unknown, required: string[], optional: string[] = []): JsonObject {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value))
  const data = value as JsonObject, allowed = [...required, ...optional]
  requireValue(required.every(key => Object.hasOwn(data, key)) && Object.keys(data).every(key => allowed.includes(key)))
  return data
}
function isUuid(value: unknown): value is string { return typeof value === 'string' && uuid.test(value) }
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max }
function text(value: unknown, max = 128): value is string { return typeof value === 'string' && value.length > 0 && value.length <= max }
// 验证带时区的时间文本及可解析性，供批准、费用和历史响应使用。
function date(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
}
// 检查 UUID 列表数量与唯一性，防止重复模板或重复选择。
function ids(value: unknown, min: number, max: number): value is string[] {
  return Array.isArray(value) && value.length >= min && value.length <= max && value.every(isUuid) && new Set(value).size === value.length
}
function inList(value: unknown, allowed: string[]): value is string { return typeof value === 'string' && allowed.includes(value) }
// 将出站参数校验失败统一标记为输入错误，网络调用前拒绝。
function input<T>(action: () => T): T {
  try { return action() } catch { throw new PersonalAgentClientError(400) }
}
// 先校验 Project UUID 再构造固定同源根路径，拒绝路径注入。
function root(project: string) { requireValue(isUuid(project), 400); return `/api/v1/projects/${project}/agent` }
function id(value: string) { requireValue(isUuid(value), 400); return value }

// 整个操作共享十五秒期限，覆盖认证、请求、流式正文及角色的每一页；无自动重试。
// One deadline includes authentication, headers, streamed body and every role page. No retry layer.
async function deadline<T>(signal: AbortSignal, action: (bounded: AbortSignal) => Promise<T>): Promise<T> {
  const own = new AbortController(), bounded = AbortSignal.any([signal, own.signal])
  const timer = globalThis.setTimeout(() => own.abort(), 15000)
  try { bounded.throwIfAborted(); const value = await action(bounded); bounded.throwIfAborted(); return value }
  catch (error) { if (error instanceof PersonalAgentClientError) throw error; throw new PersonalAgentClientError(0) }
  finally { globalThis.clearTimeout(timer); own.abort() }
}
// 让认证等待或忽略取消的传输也受 AbortSignal 约束，并在完成后移除监听。
async function wait<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  let rejectAbort: (() => void) | undefined
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = () => reject(new PersonalAgentClientError(0)); signal.addEventListener('abort', rejectAbort, { once: true }) })
  try { const value = await Promise.race([promise, aborted]); signal.throwIfAborted(); return value }
  finally { if (rejectAbort) signal.removeEventListener('abort', rejectAbort) }
}
// 丢弃无需信任或展示的响应体；取消流失败不转而读取错误原文。
function discard(body: ReadableStream<Uint8Array> | null) { if (body) void body.cancel().catch(() => {}) }
// 序列化有界输入，发送 no-store/拒绝重定向的同源请求；按字节读取有限 JSON，再交给专用校验器。
async function request(path: string, signal: AbortSignal, method: 'GET' | 'PUT' | 'POST' = 'GET',
  payload?: unknown, expectedStatus = 200, limit = 32768, extraHeaders?: Record<string, string>): Promise<Reply> {
  const body = payload === undefined ? undefined : JSON.stringify(payload)
  requireValue(body === undefined || new TextEncoder().encode(body).byteLength <= 8192, 400)
  const user = await wait(userManager.getUser(), signal)
  if (!user || user.expired) throw new PersonalAgentClientError(401)
  signal.throwIfAborted()
  const response = await wait(fetch(path, { method, signal, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    referrerPolicy: 'no-referrer', headers: { Authorization: `Bearer ${user.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders },
    ...(body === undefined ? {} : { body }) }), signal)
  // 即使错误正文可能回显敏感输入，也只取消正文并保留经过校验的头部追踪标识。
  if (!response.ok) {
    discard(response.body)
    throw new PersonalAgentClientError(response.status, response.headers.get('X-Request-Id') ?? '')
  }
  if (response.status !== expectedStatus || response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json' || !response.body) {
    discard(response.body); throw new PersonalAgentClientError(0)
  }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) {
      const { done, value } = await wait(reader.read(), signal)
      if (done) break
      size += value.byteLength; requireValue(size <= limit); chunks.push(value)
    }
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock() }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  signal.throwIfAborted()
  return { value: JSON.parse(source) as unknown, source, headers: response.headers }
}

// 只接受 int64 范围内的原始强 ETag，保留十进制文本以避免 JavaScript 数值舍入。
function strongEtag(value: string): string {
  const match = /^"(0|[1-9][0-9]{0,18})"$/.exec(value)
  requireValue(match && BigInt(match[1]) <= 9223372036854775807n)
  return match[1]
}
// 以原始 JSON 数字文本对照 ETag，并核对设置状态组合；写入继续沿用原始 ETag。
function readSettings(reply: Reply): PersonalSettingsSnapshot {
  const data = object(reply.value, ['enabled', 'revision', 'enablementId', 'modelCallsAvailable', 'unavailableReason'])
  const etag = reply.headers.get('ETag') ?? '', revision = strongEtag(etag)
  // JSON.parse rounds large int64 values. Compare the original numeric token to the opaque ETag,
  // retain that ETag unchanged, and never reconstruct If-Match from the rounded display value.
  // revision 原始数字文本须与强 ETag 一致；显示用 number 即使舍入，也绝不用于重建 If-Match。
  const tokens = [...reply.source.matchAll(/"revision"\s*:\s*(0|[1-9][0-9]*)(?=\s*[,}])/g)]
  requireValue(tokens.length === 1 && tokens[0][1] === revision && data.revision === Number(revision)
    && typeof data.enabled === 'boolean' && typeof data.modelCallsAvailable === 'boolean'
    && (data.enablementId === null || isUuid(data.enablementId))
    && (data.enabled ? isUuid(data.enablementId) : data.enablementId === null)
    && (data.modelCallsAvailable ? data.enabled && data.unavailableReason === null : inList(data.unavailableReason, unavailableReasons)))
  return { value: data as PersonalSettings, etag }
}
// 验证 Project/记录身份、凭据版本、时间、模型与价格绑定，历史记录保留自身撤销状态。
function readEnablement(value: unknown, project: string, expectedId?: string): PersonalEnablement {
  const data = object(value, ['id', 'projectId', 'approvedBy', 'approvedAt', 'expiresAt', 'credentialVersion', 'modelAlias',
    'priceCatalogVersion', 'priceCatalogExpiresAt', 'dataScope', 'revoked', 'revokedAt'])
  requireValue(isUuid(data.id) && (!expectedId || data.id === expectedId) && data.projectId === project && isUuid(data.approvedBy)
    && isUuid(data.credentialVersion) && date(data.approvedAt) && date(data.expiresAt) && date(data.priceCatalogExpiresAt)
    && Date.parse(data.expiresAt) > Date.parse(data.approvedAt) && Date.parse(data.expiresAt) <= Date.parse(data.priceCatalogExpiresAt)
    && data.modelAlias === 'deepseek-flash' && data.priceCatalogVersion === policy && data.dataScope === 'SYNTHETIC_ACCEPTANCE'
    && typeof data.revoked === 'boolean' && (data.revoked ? date(data.revokedAt) : data.revokedAt === null))
  return data as PersonalEnablement
}
// 核对批次身份及所属 Project、两次额度、费用范围、清单摘要与到期时间。
function readBatch(value: unknown, project: string, expectedId?: string): PersonalBatch {
  const data = object(value, ['id', 'projectId', 'enablementId', 'approvedBy', 'approvedAt', 'manifestSha256', 'expiresAt', 'maxRequests', 'maxCostMicrousd', 'revoked'])
  requireValue(isUuid(data.id) && (!expectedId || data.id === expectedId) && data.projectId === project && isUuid(data.enablementId)
    && isUuid(data.approvedBy) && date(data.approvedAt) && date(data.expiresAt) && Date.parse(data.expiresAt) > Date.parse(data.approvedAt)
    && typeof data.manifestSha256 === 'string' && sha.test(data.manifestSha256) && data.maxRequests === 2
    && integer(data.maxCostMicrousd, 632746, 700000) && typeof data.revoked === 'boolean')
  return data as PersonalBatch
}
// 核对当前确认契约的完整字段、1017 精确映射和固定来源；实际核对记录由操作者提供。
function validateRisk(value: PersonalAcknowledgementInput) {
  const data = object(value, ['schemaVersion', 'scope', 'accountRef', 'deploymentRef', 'expiresAt', 'sources', 'unknowns', 'riskAccepted',
    'modelAlias', 'mappingSnapshot', 'allowedResponseModels', 'priceCatalogVersion', 'priceCatalogExpiresAt', 'secretCheckRef',
    'networkCheckRef', 'dataScope', 'revocationConditions', 'credentialVersion'])
  const reference = (item: unknown) => typeof item === 'string' && /^(?!sk-)[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(item)
  const exactList = (items: unknown, allowed: string[]) => Array.isArray(items) && items.length === allowed.length
    && new Set(items).size === items.length && items.every(item => allowed.includes(item))
  requireValue(data.schemaVersion === '0.4.0' && data.scope === 'PERSONAL' && data.riskAccepted === true
    && data.modelAlias === 'deepseek-flash' && data.mappingSnapshot === 'DeepSeek-V4.1-Flash-1017'
    && data.priceCatalogVersion === policy && data.dataScope === 'SYNTHETIC_ACCEPTANCE' && isUuid(data.credentialVersion)
    && [data.accountRef, data.deploymentRef, data.secretCheckRef, data.networkCheckRef].every(reference)
    && date(data.expiresAt) && date(data.priceCatalogExpiresAt) && exactList(data.unknowns, unknownRisks)
    && exactList(data.revocationConditions, revocations) && Array.isArray(data.allowedResponseModels)
    && data.allowedResponseModels.length === 1 && data.allowedResponseModels[0] === 'deepseek-flash'
    && Array.isArray(data.sources) && data.sources.length >= 4 && data.sources.length <= 5)
  const kinds = new Set<string>()
  for (const item of data.sources) {
    const source = object(item, ['kind', 'url', 'version', 'checkedAt'])
    requireValue(typeof source.kind === 'string' && Object.hasOwn(sources, source.kind) && !kinds.has(source.kind)
      && source.url === sources[source.kind] && reference(source.version) && date(source.checkedAt))
    kinds.add(source.kind)
  }
  requireValue(['TERMS', 'PRIVACY', 'CACHE', 'MODEL_PRICE'].every(kind => kinds.has(kind)))
}

// 读取当前设置及原始 ETag；此操作不会开启 Project 或调用模型。
export async function getPersonalSettings(project: string, signal: AbortSignal): Promise<PersonalSettingsSnapshot> {
  const path = `${root(project)}/settings`
  return deadline(signal, async bounded => readSettings(await request(path, bounded)))
}
// 验证设置输入后以原始 If-Match 写入，检查回包与意图一致；版本冲突交由页面人工恢复。
export async function updatePersonalSettings(project: string, value: Enablement['schemas']['SettingsUpdate'], etag: string, signal: AbortSignal): Promise<PersonalSettingsSnapshot> {
  const path = `${root(project)}/settings`
  input(() => {
    strongEtag(etag); const data = object(value, ['enabled'], ['enablementId'])
    requireValue(typeof data.enabled === 'boolean' && (data.enabled ? isUuid(data.enablementId) : data.enablementId === undefined || data.enablementId === null))
  })
  return deadline(signal, async bounded => {
    const read = readSettings(await request(path, bounded, 'PUT', value, 200, 32768, { 'If-Match': etag }))
    requireValue(read.value.enabled === value.enabled && read.value.enablementId === (value.enabled ? value.enablementId : null))
    return read
  })
}
// 按明确 ID 读取并校验同 Project 的风险确认，不自动选择或升级历史确认。
export async function getPersonalEnablement(project: string, enablementId: string, signal: AbortSignal): Promise<PersonalEnablement> {
  const path = `${root(project)}/enablements/${id(enablementId)}`
  return deadline(signal, async bounded => readEnablement((await request(path, bounded)).value, project, enablementId))
}
// 显式保存已校验的风险确认，核对返回凭据版本；此操作不是批次费用批准或模型发送。
export async function acknowledgePersonalRisk(project: string, value: PersonalAcknowledgementInput, signal: AbortSignal): Promise<PersonalEnablement> {
  const path = `${root(project)}/enablements`; input(() => validateRisk(value))
  return deadline(signal, async bounded => {
    const read = readEnablement((await request(path, bounded, 'POST', value, 201)).value, project)
    requireValue(read.credentialVersion === value.credentialVersion && !read.revoked); return read
  })
}
// 显式撤销指定确认，并要求响应已撤销；无法撤回已经发送的数据。
export async function revokePersonalEnablement(project: string, enablementId: string, signal: AbortSignal): Promise<PersonalEnablement> {
  const path = `${root(project)}/enablements/${id(enablementId)}/revoke`
  return deadline(signal, async bounded => {
    const read = readEnablement((await request(path, bounded, 'POST')).value, project, enablementId)
    requireValue(read.revoked); return read
  })
}
// 以两个不重复模板 ID 预览清单，只接收固定版本、数量及 SHA-256 摘要。
export async function previewPersonalBatch(project: string, templateIds: string[], signal: AbortSignal): Promise<PersonalBatchPreview> {
  const path = `${root(project)}/batches/preview`; requireValue(ids(templateIds, 2, 2), 400)
  return deadline(signal, async bounded => {
    const data = object((await request(path, bounded, 'POST', { templateRequestIds: templateIds })).value, ['schemaVersion', 'manifestSha256', 'templateCount'])
    requireValue(data.schemaVersion === '0.1.0' && data.templateCount === 2 && typeof data.manifestSha256 === 'string' && sha.test(data.manifestSha256))
    return data as PersonalBatchPreview
  })
}
// 核对两次明确费用批准与清单绑定后创建批次；成功响应必须对应所提交确认与预算。
export async function approvePersonalBatch(project: string, value: PersonalBatchInput, signal: AbortSignal): Promise<PersonalBatch> {
  const path = `${root(project)}/batches`
  input(() => {
    const data = object(value, ['enablementId', 'syntheticInventoryId', 'templateRequestIds', 'manifestSha256', 'expiresAt', 'maxRequests', 'maxCostMicrousd', 'callsApproved'])
    requireValue(isUuid(data.enablementId) && isUuid(data.syntheticInventoryId) && ids(data.templateRequestIds, 2, 2)
      && typeof data.manifestSha256 === 'string' && sha.test(data.manifestSha256) && date(data.expiresAt)
      && data.maxRequests === 2 && integer(data.maxCostMicrousd, 632746, 700000) && data.callsApproved === true)
  })
  return deadline(signal, async bounded => {
    const read = readBatch((await request(path, bounded, 'POST', value, 201)).value, project)
    requireValue(read.enablementId === value.enablementId && read.manifestSha256 === value.manifestSha256
      && read.maxCostMicrousd === value.maxCostMicrousd && !read.revoked); return read
  })
}
// 按明确批次 ID 读取历史，校验 Project 与记录身份。
export async function getPersonalBatch(project: string, batchId: string, signal: AbortSignal): Promise<PersonalBatch> {
  const path = `${root(project)}/batches/${id(batchId)}`
  return deadline(signal, async bounded => readBatch((await request(path, bounded)).value, project, batchId))
}
// 请求停止指定批次后确认撤销状态；历史费用和已发送请求不会因此回退。
export async function revokePersonalBatch(project: string, batchId: string, signal: AbortSignal): Promise<PersonalBatch> {
  const path = `${root(project)}/batches/${id(batchId)}/revoke`
  return deadline(signal, async bounded => {
    const read = readBatch((await request(path, bounded, 'POST')).value, project, batchId); requireValue(read.revoked); return read
  })
}

// 交叉核对两个模板、固定请求槽位、尝试记录和聚合费用；未知费用继续占用预留，结算不等于结果成功。
function readExecution(value: unknown, project: string, batchId: string): PersonalBatchExecution {
  const data = object(value, ['schemaVersion', 'observedAt', 'batch', 'costPolicyVersion', 'accounting', 'stop', 'templates'])
  const batch = readBatch(data.batch, project, batchId), accounting = object(data.accounting, ['attemptCount', 'reservedMicrousd', 'spentMicrousd'])
  requireValue(data.schemaVersion === '0.1.0' && date(data.observedAt) && data.costPolicyVersion === policy
    && Array.isArray(data.templates) && data.templates.length === 2 && integer(accounting.attemptCount, 0, 2)
    && integer(accounting.reservedMicrousd, 0, batch.maxCostMicrousd) && integer(accounting.spentMicrousd, 0, batch.maxCostMicrousd - accounting.reservedMicrousd))
  const templateIds = new Set<string>(), requestIds = new Set<string>(), attemptIds = new Set<string>()
  let count = 0, reserved = 0, spent = 0
  for (let index = 0; index < 2; index++) {
    const item = object(data.templates[index], ['templateRequestId', 'purpose', 'request', 'attempt'])
    requireValue(isUuid(item.templateRequestId) && !templateIds.has(item.templateRequestId)
      && item.purpose === (index === 0 ? 'FINDING_EXPLANATION' : 'PR_SUMMARY'))
    templateIds.add(item.templateRequestId)
    // 未分配请求与尚无费用尝试是独立事实，不能由空值推导“可重新发送”。
    if (item.request === null) { requireValue(item.attempt === null); continue }
    const r = object(item.request, ['id', 'state', 'failureCode', 'traceId', 'createdAt', 'updatedAt'])
    requireValue(isUuid(r.id) && r.id !== item.templateRequestId && !requestIds.has(r.id) && inList(r.state, requestStates)
      && typeof r.traceId === 'string' && /^[0-9a-f]{32}$/.test(r.traceId) && date(r.createdAt) && date(r.updatedAt)
      && Date.parse(r.updatedAt) >= Date.parse(r.createdAt) && (r.state === 'FAILED' ? inList(r.failureCode, executionFailures) : r.failureCode === null))
    requestIds.add(r.id)
    if (item.attempt === null) { requireValue(r.state !== 'SUCCEEDED'); continue }
    const a = object(item.attempt, ['attemptId', 'utcDay', 'priceCatalogVersion', 'reservedMicrousd', 'createdAt', 'outcome'])
    requireValue(isUuid(a.attemptId) && !attemptIds.has(a.attemptId) && typeof a.utcDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.utcDay)
      && Number.isFinite(Date.parse(a.utcDay)) && a.priceCatalogVersion === policy && a.reservedMicrousd === reservation && date(a.createdAt) && r.state !== 'QUEUED')
    attemptIds.add(a.attemptId); count++
    if (a.outcome === null) { requireValue(r.state !== 'SUCCEEDED'); reserved += reservation; continue }
    const o = object(a.outcome, ['state', 'actualMicrousd', 'usage', 'recordedAt']); requireValue(date(o.recordedAt))
    // 未知费用不视作零或退款，继续计入保守预留，成功态也不能携带未知结算。
    if (o.state === 'UNKNOWN') {
      requireValue(o.actualMicrousd === null && o.usage === null && r.state !== 'SUCCEEDED'); reserved += reservation
    } else {
      requireValue(o.state === 'SETTLED' && integer(o.actualMicrousd, 0, reservation))
      const usage = object(o.usage, ['inputTokens', 'outputTokens', 'cachedInputTokens', 'totalTokens', 'reasoningTokens'])
      requireValue(integer(usage.inputTokens, 0, 1048576) && integer(usage.outputTokens, 0, 1500)
        && integer(usage.cachedInputTokens, 0, usage.inputTokens) && usage.totalTokens === usage.inputTokens + usage.outputTokens && usage.reasoningTokens === 0
        && (r.state !== 'SUCCEEDED' || usage.inputTokens <= 8000))
      spent += o.actualMicrousd
    }
  }
  // 从逐项尝试重算费用并对照汇总，避免回包凭空制造剩余调用或预算。
  requireValue(accounting.attemptCount === count && accounting.reservedMicrousd === reserved && accounting.spentMicrousd === spent)
  if (data.stop !== null) {
    const stop = object(data.stop, ['requestId', 'code', 'stoppedAt'])
    requireValue(typeof stop.requestId === 'string' && requestIds.has(stop.requestId) && inList(stop.code, executionFailures) && date(stop.stoppedAt))
  }
  return data as PersonalBatchExecution
}
// 读取服务器批次执行快照，再交由费用/槽位一致性校验器验证。
export async function getPersonalBatchExecution(project: string, batchId: string, signal: AbortSignal): Promise<PersonalBatchExecution> {
  const path = `${root(project)}/batches/${id(batchId)}/execution`
  return deadline(signal, async bounded => readExecution((await request(path, bounded)).value, project, batchId))
}

// 校验建议的范围、绑定版本、用途、异步状态及结果/失败结构，不能仅信任 TypeScript 静态类型。
function readRequest(value: unknown, project: string, expectedId?: string, liveOnly = false): AgentRequest {
  const data = object(value, ['id', 'projectId', 'requesterId', 'traceId', 'purpose', 'state', 'bindings', 'result', 'failure', 'usage', 'createdAt', 'updatedAt'])
  requireValue(isUuid(data.id) && (!expectedId || data.id === expectedId) && data.projectId === project && isUuid(data.requesterId)
    && typeof data.traceId === 'string' && /^[0-9a-f]{32}$/.test(data.traceId) && inList(data.purpose, ['FINDING_EXPLANATION', 'PR_SUMMARY'])
    && inList(data.state, requestStates) && date(data.createdAt) && date(data.updatedAt) && Date.parse(data.updatedAt) >= Date.parse(data.createdAt))
  const b = object(data.bindings, ['scanJobId', 'reportSha256', 'prHeadRevisionId', 'findingIds', 'documentVersions', 'promptVersion',
    'modelProfileVersion', 'modelProtocolVersion', 'modelId', 'outputSchemaVersion', 'priceCatalogVersion', 'inputDigest'])
  requireValue(isUuid(b.scanJobId) && typeof b.reportSha256 === 'string' && sha.test(b.reportSha256) && ids(b.findingIds, 1, 20)
    && (data.purpose === 'PR_SUMMARY' ? isUuid(b.prHeadRevisionId) : b.prHeadRevisionId === null)
    && Array.isArray(b.documentVersions) && b.documentVersions.length <= 10 && b.outputSchemaVersion === '0.1.0'
    && b.modelProtocolVersion === 'responses-v1-restricted' && typeof b.inputDigest === 'string' && sha.test(b.inputDigest))
  const documents = new Map<string, string>()
  for (const item of b.documentVersions) {
    const d = object(item, ['documentVersionId', 'contentSha256'])
    requireValue(isUuid(d.documentVersionId) && !documents.has(d.documentVersionId) && typeof d.contentSha256 === 'string' && sha.test(d.contentSha256))
    documents.set(d.documentVersionId, d.contentSha256)
  }
  const prefix = data.purpose === 'PR_SUMMARY' ? 'pr-summary' : 'finding-explanation'
  const live = b.modelProfileVersion === 'deepseek-personal-0.2.0' && b.modelId === 'deepseek-flash' && b.priceCatalogVersion === policy && b.promptVersion === `${prefix}-deepseek-0.1.0`
  const synthetic = b.modelProfileVersion === 'disabled-or-test-fake-0.1.0' && b.modelId === 'deterministic-fake-or-disabled'
    && b.priceCatalogVersion === 'synthetic-0.1.0' && b.promptVersion === `${prefix}-0.1.0`
  requireValue(live || (!liveOnly && synthetic))
  if (data.state === 'FAILED') {
    const failure = object(data.failure, ['code', 'message']); requireValue(inList(failure.code, failures) && text(failure.message, 1000) && data.result === null)
  } else requireValue(data.failure === null)
  if (data.state === 'SUCCEEDED') readResult(data.result, project, b, documents)
  else requireValue(data.result === null)
  if (data.usage !== null) {
    const usage = object(data.usage, ['inputTokens', 'outputTokens', 'latencyMs', 'providerLatencyMs', 'estimatedCostMicrousd', 'actualCostMicrousd', 'providerResponseId', 'actualModelId'])
    requireValue(integer(usage.inputTokens, 0, 1048576) && integer(usage.outputTokens, 0, 1500) && integer(usage.latencyMs)
      && (usage.providerLatencyMs === null || integer(usage.providerLatencyMs)) && integer(usage.estimatedCostMicrousd, 0, 350000)
      && (usage.actualCostMicrousd === null || integer(usage.actualCostMicrousd, 0, 350000))
      && (usage.providerResponseId === null || text(usage.providerResponseId, 256)) && (usage.actualModelId === null || text(usage.actualModelId, 128)))
  }
  return data as AgentRequest
}
// 逐项验证建议字段和引用；Evidence 必须匹配扫描/报告，文档必须匹配选定不可变版本摘要。
function readResult(value: unknown, project: string, bindings: JsonObject, documents: Map<string, string>) {
  const result = object(value, ['conclusion', 'ruleBasis', 'claims', 'suggestions', 'citations', 'evidenceCoverage'])
  const textList = (items: unknown) => Array.isArray(items) && items.length <= 100 && items.every(item => text(item, 16000))
  requireValue(text(result.conclusion, 16000) && textList(result.ruleBasis) && textList(result.claims)
    && inList(result.evidenceCoverage, ['NONE', 'PARTIAL', 'COMPLETE']) && Array.isArray(result.suggestions) && result.suggestions.length <= 100
    && Array.isArray(result.citations) && result.citations.length <= 100)
  for (const item of result.suggestions) {
    const s = object(item, ['text', 'kind', 'requiresHumanReview'])
    requireValue(text(s.text, 16000) && inList(s.kind, ['HUMAN_VERIFICATION', 'LOW_RISK_DIRECTION']) && s.requiresHumanReview === true)
  }
  const citations = new Set<string>()
  for (const item of result.citations) {
    const c = object(item, ['citationId', 'source', 'label', 'projectId', 'scanJobId', 'reportSha256', 'evidenceId', 'documentVersionId', 'contentSha256', 'fragmentIndex', 'fragmentSha256'])
    requireValue(text(c.citationId) && !citations.has(c.citationId) && c.projectId === project && text(c.label, 2000))
    citations.add(c.citationId)
    if (c.source === 'SCANNER_EVIDENCE') {
      requireValue(c.scanJobId === bindings.scanJobId && c.reportSha256 === bindings.reportSha256 && isUuid(c.evidenceId)
        && c.documentVersionId === null && c.contentSha256 === null && c.fragmentIndex === null && c.fragmentSha256 === null)
    } else requireValue(c.source === 'PROJECT_DOCUMENT' && typeof c.documentVersionId === 'string' && documents.has(c.documentVersionId)
      && documents.get(c.documentVersionId) === c.contentSha256 && integer(c.fragmentIndex) && typeof c.fragmentSha256 === 'string'
      && sha.test(c.fragmentSha256) && c.scanJobId === null && c.reportSha256 === null && c.evidenceId === null)
  }
}
// 只读取一个明确请求并核对身份，用于恢复 synthetic 模板或既有结果，不触发发送。
export async function getPersonalRequest(project: string, requestId: string, signal: AbortSignal): Promise<AgentRequest> {
  const path = `${root(project)}/requests/${id(requestId)}`
  return deadline(signal, async bounded => readRequest((await request(path, bounded, 'GET', undefined, 200, 131072)).value, project, requestId))
}
// 显式发送指定批次/模板，幂等键由这两个固定 ID 决定；失败、终态或再次调用都不换键。
export async function runPersonalRequest(project: string, batchId: string, templateRequestId: string, signal: AbortSignal): Promise<AgentRequest> {
  const path = `${root(project)}/live-requests`; id(batchId); id(templateRequestId)
  // Stable across remounts and terminal replies. An explicit invocation is never a new retry key.
  // 幂等身份固定在批次与模板，不能通过终态、超时或人工再次点击换键。
  const key = `personal:${batchId}:${templateRequestId}`
  return deadline(signal, async bounded => readRequest((await request(path, bounded, 'POST', { batchId, templateRequestId }, 202, 131072,
    { 'Idempotency-Key': key })).value, project, undefined, true))
}
// 在同一取消/超时边界内有界分页读取成员，未命中返回 null；不调用普通页面的无取消角色助手。
export async function getPersonalRole(project: string, actor: string, signal: AbortSignal): Promise<ProjectMember['role'] | null> {
  root(project); id(actor)
  return deadline(signal, async bounded => {
    const seen = new Set<string>()
    for (let page = 0; page < 100; page++) {
      const reply = await request(`/api/v1/projects/${project}/members?page=${page}&size=100`, bounded)
      const data = object(reply.value, ['items', 'page', 'size', 'total'])
      requireValue(data.page === page && data.size === 100 && integer(data.total) && Array.isArray(data.items) && data.items.length <= 100)
      for (const item of data.items) {
        const member = object(item, ['actorId', 'role', 'createdAt'])
        requireValue(isUuid(member.actorId) && !seen.has(member.actorId) && inList(member.role, ['MAINTAINER', 'VIEWER']) && date(member.createdAt))
        seen.add(member.actorId)
        if (member.actorId === actor) return member.role as ProjectMember['role']
      }
      if ((page + 1) * 100 >= data.total) return null
      requireValue(data.items.length === 100)
    }
    return null // Capped advisory lookup never grants write authority on incomplete membership data.
  })
}

// 凭据客户端安全回归：假认证与 fetch 覆盖固定路由、无存储、元数据白名单、取消和错误脱敏。
import { CredentialClientError, deleteCredential, getCredentialStatus, saveCredential } from './credentials'

const auth = vi.hoisted(() => ({ getUser: vi.fn() }))
vi.mock('../auth/oidc', () => ({ userManager: auth }))
const absent = { configured: false, credentialVersion: null, updatedAt: null }
const saved = { configured: true, credentialVersion: '11111111-1111-4111-8111-111111111111', updatedAt: '2026-10-06T00:00:00Z' }
const synthetic = 'synthetic-test-only-credential'
const signal = () => new AbortController().signal
beforeEach(() => auth.getUser.mockResolvedValue({ expired: false, access_token: 'synthetic-test-token' }))
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

// 验证凭据操作仅访问固定同源 no-store 路由，输入不进入浏览器存储。
it('uses only a fixed same-origin no-store endpoint and never persists input', async () => {
  const local = vi.spyOn(window.localStorage, 'setItem')
  const session = vi.spyOn(window.sessionStorage, 'setItem')
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(saved), { headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchMock)
  expect(await saveCredential(synthetic, signal())).toEqual(saved)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  expect(path).toBe('/api/v1/agent/credentials/deepseek')
  expect(path).not.toContain(synthetic)
  expect(init).toMatchObject({ method: 'PUT', cache: 'no-store', credentials: 'same-origin', redirect: 'error', referrerPolicy: 'no-referrer' })
  expect(JSON.parse(init.body as string)).toEqual({ apiKey: synthetic })
  expect(new Headers(init.headers).get('Authorization')).toBe('Bearer synthetic-test-token')
  expect(local).not.toHaveBeenCalled(); expect(session).not.toHaveBeenCalled()
})

// 验证删除无 Key 正文，状态读取仅返回配置元数据。
it('deletes without a credential body and status reads only metadata', async () => {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(absent), { headers: { 'Content-Type': 'application/json' } })))
  vi.stubGlobal('fetch', fetchMock)
  expect(await deleteCredential(signal())).toEqual(absent)
  expect(fetchMock.mock.calls[0][1].body).toBeUndefined()
  expect(await getCredentialStatus(signal())).toEqual(absent)
  expect(fetchMock.mock.calls.map(call => call[1].method)).toEqual(['DELETE', 'GET'])
})

// 验证不解析不可信错误正文、过滤追踪标识且不自动重试。
it('discards untrusted error text and trace headers and does not retry', async () => {
  const response = new Response(JSON.stringify({ message: synthetic, rejectedValue: synthetic }),
    { status: 503, headers: { 'Content-Type': 'application/json', 'X-Request-Id': synthetic } })
  const parse = vi.spyOn(response, 'json')
  const fetchMock = vi.fn().mockResolvedValue(response); vi.stubGlobal('fetch', fetchMock)
  try { await saveCredential(synthetic, signal()); expect.fail('must reject') }
  catch (failure) {
    expect(failure).toBeInstanceOf(CredentialClientError)
    expect(String(failure)).not.toContain(synthetic)
    expect((failure as CredentialClientError).traceId).toBe('')
  }
  expect(parse).not.toHaveBeenCalled(); expect(fetchMock).toHaveBeenCalledTimes(1)
})

// 逐项拒绝多余字段及不一致元数据，避免把不可信回包当作安全状态。
it.each([
  { ...saved, apiKey: synthetic }, { ...saved, configured: 'true' }, { ...absent, updatedAt: synthetic },
  { ...saved, credentialVersion: synthetic }, { ...saved, updatedAt: synthetic },
])('rejects malformed or credential-bearing success metadata without echo', async value => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })))
  await expect(getCredentialStatus(signal())).rejects.toThrow('操作未确认完成')
})

// 验证响应大小、网络错误脱敏，以及取消/过期会话在发请求前失败。
it('bounds metadata, sanitizes network errors and sends no request after abort or expiry', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('a'.repeat(1025), { headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchMock)
  await expect(getCredentialStatus(signal())).rejects.toThrow('操作未确认完成')
  fetchMock.mockRejectedValue(new Error(synthetic))
  await expect(saveCredential(synthetic, signal())).rejects.toThrow('操作未确认完成')
  fetchMock.mockClear(); const aborted = new AbortController(); aborted.abort()
  await expect(saveCredential(synthetic, aborted.signal)).rejects.toThrow('操作未确认完成')
  auth.getUser.mockResolvedValue({ expired: true })
  await expect(saveCredential(synthetic, signal())).rejects.toThrow('会话已失效')
  expect(fetchMock).not.toHaveBeenCalled()
})

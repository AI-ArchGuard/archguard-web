import { CredentialClientError, deleteCredential, getCredentialStatus, saveCredential } from './credentials'

const auth = vi.hoisted(() => ({ getUser: vi.fn() }))
vi.mock('../auth/oidc', () => ({ userManager: auth }))
const absent = { configured: false, credentialVersion: null, updatedAt: null }
const saved = { configured: true, credentialVersion: '11111111-1111-4111-8111-111111111111', updatedAt: '2026-10-06T00:00:00Z' }
const synthetic = 'synthetic-test-only-credential'
const signal = () => new AbortController().signal
beforeEach(() => auth.getUser.mockResolvedValue({ expired: false, access_token: 'synthetic-test-token' }))
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

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

it('deletes without a credential body and status reads only metadata', async () => {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(absent), { headers: { 'Content-Type': 'application/json' } })))
  vi.stubGlobal('fetch', fetchMock)
  expect(await deleteCredential(signal())).toEqual(absent)
  expect(fetchMock.mock.calls[0][1].body).toBeUndefined()
  expect(await getCredentialStatus(signal())).toEqual(absent)
  expect(fetchMock.mock.calls.map(call => call[1].method)).toEqual(['DELETE', 'GET'])
})

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

it.each([
  { ...saved, apiKey: synthetic }, { ...saved, configured: 'true' }, { ...absent, updatedAt: synthetic },
  { ...saved, credentialVersion: synthetic }, { ...saved, updatedAt: synthetic },
])('rejects malformed or credential-bearing success metadata without echo', async value => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })))
  await expect(getCredentialStatus(signal())).rejects.toThrow('操作未确认完成')
})

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

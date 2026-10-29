// 普通 API 上传回归：检查 FormData 的媒体类型边界由浏览器生成。
import { api } from './client'

vi.mock('../auth/oidc', () => ({ userManager: { getUser: () => Promise.resolve({ expired: false, access_token: 'test-token' }) } }))
afterEach(() => vi.unstubAllGlobals())

// 验证上传 FormData 时不手写 Content-Type，让浏览器补齐 multipart boundary。
it('lets the browser set the multipart boundary for document uploads', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: () => Promise.resolve({ id: 'version-1' }) })
  vi.stubGlobal('fetch', fetchMock)
  const body = new FormData(); body.set('documentKey', 'architecture'); body.set('file', new File(['# Architecture'], 'architecture.md', { type: 'text/markdown' }))
  await api('/api/v1/projects/project-1/documents', { method: 'POST', body })
  const init = fetchMock.mock.calls[0][1] as RequestInit
  expect(init.body).toBe(body)
  expect(new Headers(init.headers).get('Content-Type')).toBeNull()
  expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-token')
})

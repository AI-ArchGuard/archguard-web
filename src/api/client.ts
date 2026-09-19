import { userManager } from '../auth/oidc'
import type { ApiError } from './types'

export class ApiClientError extends Error {
  constructor(public readonly status: number, public readonly error: ApiError) { super(error.message) }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = await userManager.getUser()
  if (!user || user.expired) throw new ApiClientError(401, { code: 'authentication.required', message: '请重新登录。', traceId: '', details: {} })
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${user.access_token}`)
  if (init.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' })
  if (!response.ok) {
    const fallback: ApiError = { code: 'request.failed', message: '请求未完成。', traceId: '', details: {} }
    let body = fallback
    try { body = await response.json() as ApiError } catch { /* keep safe fallback */ }
    throw new ApiClientError(response.status, body)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

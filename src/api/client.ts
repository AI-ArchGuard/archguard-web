// 普通业务 API 客户端：读取当前 OIDC 会话、附加 Bearer 令牌并转换 HTTP 错误；专用敏感接口使用各自客户端。
import { userManager } from '../auth/oidc'
import type { ApiError } from './types'

// 保留普通 HTTP 状态与统一 API 错误 DTO，供业务页面区分权限和可重试失败。
export class ApiClientError extends Error {
  constructor(public readonly status: number, public readonly error: ApiError) { super(error.message) }
}

// 普通业务请求：缺失/过期会话立即拒绝；FormData 保留浏览器边界，204 返回无正文。
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = await userManager.getUser()
  if (!user || user.expired) throw new ApiClientError(401, { code: 'authentication.required', message: '请重新登录。', traceId: '', details: {} })
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${user.access_token}`)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' })
  if (!response.ok) {
    const fallback: ApiError = { code: 'request.failed', message: '请求未完成。', traceId: '', details: {} }
    let body = fallback
    // 普通 API 尝试读取统一错误 DTO；无法解析时保留固定回退。凭据接口另行禁止读取错误正文。
    try { body = await response.json() as ApiError } catch { /* keep safe fallback */ }
    throw new ApiClientError(response.status, body)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

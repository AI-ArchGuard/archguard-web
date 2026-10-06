import { userManager } from '../auth/oidc'
import type { components } from './agent-credentials-schema'

export type CredentialStatus = components['schemas']['CredentialStatus']
type WriteCredential = components['schemas']['WriteCredentialRequest']
const route = '/api/v1/agent/credentials/deepseek'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export class CredentialClientError extends Error {
  public readonly traceId: string
  constructor(public readonly status: number, traceId = '') {
    super(status === 401 ? '会话已失效，请重新登录。' : status === 403 ? '仅部署所有者可管理凭据，或请求来源不受信任。'
      : status === 400 ? 'Key 格式无效，请重新输入；不验证账户有效性。'
      : status === 503 ? '凭据管理已关闭或安全配置不可用，请检查后端配置后手动刷新。'
      : '操作未确认完成，请手动刷新状态；不会自动重试。')
    this.traceId = /^[0-9a-f]{32}$/.test(traceId) ? traceId : ''
  }
}

function metadata(value: unknown): CredentialStatus {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CredentialClientError(0)
  const data = value as Record<string, unknown>
  if (Object.keys(data).sort().join(',') !== 'configured,credentialVersion,updatedAt'
    || typeof data.configured !== 'boolean') throw new CredentialClientError(0)
  if (!data.configured && data.credentialVersion === null && data.updatedAt === null) {
    return { configured: false, credentialVersion: null, updatedAt: null }
  }
  if (data.configured && typeof data.credentialVersion === 'string' && uuid.test(data.credentialVersion)
    && typeof data.updatedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(data.updatedAt)
    && Number.isFinite(Date.parse(data.updatedAt))) {
    return { configured: true, credentialVersion: data.credentialVersion, updatedAt: data.updatedAt }
  }
  throw new CredentialClientError(0)
}

async function request(method: 'GET' | 'PUT' | 'DELETE', signal: AbortSignal, payload?: WriteCredential): Promise<CredentialStatus> {
  try {
    const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(15_000)])
    const user = await userManager.getUser()
    boundedSignal.throwIfAborted()
    if (!user || user.expired) throw new CredentialClientError(401)
    const response = await fetch(route, { method, signal: boundedSignal, credentials: 'same-origin', cache: 'no-store',
      redirect: 'error', referrerPolicy: 'no-referrer',
      headers: { Authorization: `Bearer ${user.access_token}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}) })
    // Never parse or display error bodies: even an upstream error could echo a credential.
    if (!response.ok) {
      await response.body?.cancel()
      throw new CredentialClientError(response.status, response.headers.get('X-Request-Id') ?? '')
    }
    if (response.status !== 200 || response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json' || !response.body) {
      await response.body?.cancel(); throw new CredentialClientError(0)
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []; let size = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 1024) throw new CredentialClientError(0)
        chunks.push(value)
      }
    } finally { try { await reader.cancel() } finally { reader.releaseLock() } }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return metadata(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
  } catch (error) {
    if (error instanceof CredentialClientError) throw error
    throw new CredentialClientError(0)
  }
}

export const getCredentialStatus = (signal: AbortSignal) => request('GET', signal)
export const saveCredential = (apiKey: string, signal: AbortSignal) => request('PUT', signal, { apiKey })
export const deleteCredential = (signal: AbortSignal) => request('DELETE', signal)

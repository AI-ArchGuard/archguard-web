// 合成建议请求 Hook：绑定确切输入、管理幂等提交及串行状态查询；权限失效后清除已展示结果。
import { useEffect, useRef, useState } from 'react'
import { api, ApiClientError } from '../api/client'
import type { AgentRequest, CreateAgentRequest } from '../api/agent'

const sameIds = (left: string[], right: string[]) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
// 核对建议响应的 Project、用途、扫描/报告、PR 修订和所选依据，忽略 ID 数组顺序差异。
function matches(value: AgentRequest, projectId: string, input: CreateAgentRequest) {
  return value.projectId === projectId && value.purpose === input.purpose
    && value.bindings.scanJobId === input.scanJobId && value.bindings.reportSha256 === input.reportSha256
    && value.bindings.prHeadRevisionId === input.prHeadRevisionId
    && sameIds(value.bindings.findingIds, input.findingIds)
    && sameIds(value.bindings.documentVersions.map((item) => item.documentVersionId), input.documentVersionIds)
}

// 管理普通合成建议的创建及读取；忙碌锁防止同一渲染周期重复提交，轮询仍会复核终态权限。
export function useAgentRequest(projectId: string) {
  const [request, setRequest] = useState<AgentRequest>()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const attempt = useRef<{ input: CreateAgentRequest; encoded: string; key: string; terminal: boolean }>(undefined)
  const busy = useRef(false)
  const root = `/api/v1/projects/${projectId}/agent/requests`
  useEffect(() => {
    if (!request || !attempt.current) return
    let active = true
    let polling = false
    const input = attempt.current.input
    const requestId = request.id
    const timer = window.setInterval(() => {
      // 上一个 GET 未结束时跳过本次 tick，慢查询不叠加。
      if (polling) return
      polling = true
      api<AgentRequest>(`${root}/${requestId}`, { signal: AbortSignal.timeout(10000) }).then((value) => {
        if (!active) return
        if (value.id !== requestId || !matches(value, projectId, input)) {
          window.clearInterval(timer); setRequest(undefined); setError('建议结果范围或版本不匹配，已停止展示。'); return
        }
        if (attempt.current) attempt.current.terminal = value.state === 'SUCCEEDED' || value.state === 'FAILED'
        setRequest(value); setError('')
      }).catch((failure: unknown) => {
        if (!active) return
        // 即使先前已展示终态结果，失权/不可访问也立即撤下历史并停止轮询。
        if (failure instanceof ApiClientError && [401, 403, 404].includes(failure.status)) {
          window.clearInterval(timer); setRequest(undefined); setError('Project 权限已失效，建议结果不再可查看。')
        } else { setError('无法更新建议状态，正在等待恢复。') }
      }).finally(() => { polling = false })
    }, request.state === 'QUEUED' || request.state === 'RUNNING' ? 1500 : 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [request?.id, request?.state, projectId, root]) // eslint-disable-line react-hooks/exhaustive-deps

  // 排序输入后比较幂等身份：相同未终态输入复用键；输入变化或已终态时创建新键。
  async function create(input: CreateAgentRequest) {
    if (busy.current) return
    busy.current = true; setSubmitting(true); setError(''); setRequest(undefined)
    const normalized = { ...input, findingIds: [...input.findingIds].sort(), documentVersionIds: [...input.documentVersionIds].sort() }
    const encoded = JSON.stringify(normalized)
    if (!attempt.current || attempt.current.encoded !== encoded || attempt.current.terminal) {
      attempt.current = { input: normalized, encoded, key: crypto.randomUUID(), terminal: false }
    }
    try {
      const created = await api<AgentRequest>(root, { method: 'POST', headers: { 'Idempotency-Key': attempt.current.key }, body: encoded })
      if (!matches(created, projectId, normalized)) { setError('建议结果范围或版本不匹配，已停止展示。'); return }
      attempt.current.terminal = created.state === 'SUCCEEDED' || created.state === 'FAILED'
      setRequest(created)
    } catch (failure) {
      setError(failure instanceof ApiClientError && [401, 403, 404].includes(failure.status)
        ? '无权请求此范围的建议，或资源不存在。' : '建议请求未完成；再次提交相同输入会复用幂等键。')
    } finally { busy.current = false; setSubmitting(false) }
  }
  return { request, error, submitting, create }
}

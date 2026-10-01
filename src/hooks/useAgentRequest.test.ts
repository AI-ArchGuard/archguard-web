import { act, renderHook } from '@testing-library/react'
import { ApiClientError } from '../api/client'
import type { AgentRequest, CreateAgentRequest } from '../api/agent'
import { useAgentRequest } from './useAgentRequest'

const apiMock = vi.hoisted(() => vi.fn())
vi.mock('../api/client', async (load) => ({ ...await load<typeof import('../api/client')>(), api: apiMock }))
const input: CreateAgentRequest = { purpose: 'FINDING_EXPLANATION', scanJobId: 'job-1', reportSha256: 'a'.repeat(64),
  prHeadRevisionId: null, findingIds: ['finding-1'], documentVersionIds: [] }
const queued = { id: 'request-1', projectId: 'project-1', purpose: input.purpose, state: 'QUEUED',
  bindings: { ...input, documentVersions: [] } } as unknown as AgentRequest
beforeEach(() => { apiMock.mockReset(); vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

it('reuses the idempotency key when retrying an interrupted submission with unchanged input', async () => {
  apiMock.mockRejectedValueOnce(new Error('connection interrupted')).mockResolvedValueOnce(queued)
  const { result } = renderHook(() => useAgentRequest('project-1'))
  await act(() => result.current.create(input))
  await act(() => result.current.create(input))
  expect(apiMock.mock.calls[0][1].headers['Idempotency-Key']).toBe(apiMock.mock.calls[1][1].headers['Idempotency-Key'])
  expect(result.current.request?.id).toBe('request-1')
})

it('removes a previously displayed request after Project access is revoked', async () => {
  apiMock.mockResolvedValueOnce(queued).mockRejectedValueOnce(new ApiClientError(404,
    { code: 'project.not_found', message: 'Not found', traceId: 'trace-1', details: {} }))
  const { result } = renderHook(() => useAgentRequest('project-1'))
  await act(() => result.current.create(input))
  await act(() => vi.advanceTimersByTimeAsync(1500))
  expect(result.current.request).toBeUndefined()
  expect(result.current.error).toContain('权限已失效')
})

it('rejects a polled result from a different scan version', async () => {
  apiMock.mockResolvedValueOnce(queued).mockResolvedValueOnce({ ...queued, state: 'SUCCEEDED',
    bindings: { ...queued.bindings, reportSha256: 'b'.repeat(64) } })
  const { result } = renderHook(() => useAgentRequest('project-1'))
  await act(() => result.current.create(input))
  await act(() => vi.advanceTimersByTimeAsync(1500))
  expect(result.current.request).toBeUndefined()
  expect(result.current.error).toContain('版本不匹配')
})

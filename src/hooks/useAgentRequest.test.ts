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

it('does not overlap polls while a previous state read is pending', async () => {
  let resolvePoll!: (value: AgentRequest) => void
  apiMock.mockResolvedValue(queued).mockResolvedValueOnce(queued).mockImplementationOnce(() => new Promise<AgentRequest>((resolve) => { resolvePoll = resolve }))
  const { result } = renderHook(() => useAgentRequest('project-1'))
  await act(() => result.current.create(input))
  await act(() => vi.advanceTimersByTimeAsync(4500))
  expect(apiMock).toHaveBeenCalledTimes(2)
  await act(async () => resolvePoll({ ...queued, state: 'FAILED' }))
  expect(result.current.request?.state).toBe('FAILED')
})

it('blocks duplicate submits and recovers transient polling failures without another POST', async () => {
  let resolveSubmit!: (value: AgentRequest) => void
  apiMock.mockImplementationOnce(() => new Promise<AgentRequest>((resolve) => { resolveSubmit = resolve }))
    .mockRejectedValueOnce(new Error('synthetic network failure'))
    .mockResolvedValueOnce({ ...queued, state: 'FAILED' })
  const { result } = renderHook(() => useAgentRequest('project-1'))
  let pending!: Promise<void>
  act(() => { pending = result.current.create(input); void result.current.create(input) })
  expect(apiMock).toHaveBeenCalledTimes(1)
  await act(async () => { resolveSubmit(queued); await pending })
  await act(() => vi.advanceTimersByTimeAsync(1500))
  expect(result.current.error).toContain('等待恢复')
  await act(() => vi.advanceTimersByTimeAsync(1500))
  expect(result.current.request?.state).toBe('FAILED')
  expect(result.current.error).toBe('')
  expect(apiMock.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(1)
})

it.each([401, 403, 404])('clears a terminal result after authorization fails with %s', async (status) => {
  apiMock.mockResolvedValueOnce({ ...queued, state: 'SUCCEEDED' }).mockRejectedValueOnce(new ApiClientError(status,
    { code: 'project.not_found', message: 'synthetic private provider response', traceId: 'trace-1', details: {} }))
  const { result } = renderHook(() => useAgentRequest('project-1'))
  await act(() => result.current.create(input))
  await act(() => vi.advanceTimersByTimeAsync(30000))
  expect(result.current.request).toBeUndefined()
  expect(result.current.error).toContain('权限已失效')
  expect(result.current.error).not.toContain('private provider response')
})

// 建议展示回归：覆盖等待/失败/成功、引用范围与摘要、类型化失权及旧作用域的迟到读取。
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AgentRequest } from '../api/agent'
import { ApiClientError } from '../api/client'
import { AgentRequestView } from './AgentRequestView'
const apiMock = vi.hoisted(() => vi.fn())
vi.mock('../api/client', async (load) => ({ ...await load<typeof import('../api/client')>(), api: apiMock }))

const base = { id: 'request-1', projectId: 'project-1', traceId: 'trace-1', purpose: 'FINDING_EXPLANATION',
  bindings: { scanJobId: 'job-1', reportSha256: 'a'.repeat(64), prHeadRevisionId: null,
    findingIds: ['finding-1'], documentVersions: [], promptVersion: 'finding-explanation-0.1.0',
    modelProfileVersion: 'fake', modelProtocolVersion: 'responses-v1-restricted', modelId: 'fake',
    outputSchemaVersion: '0.1.0', priceCatalogVersion: 'synthetic', inputDigest: 'b'.repeat(64) },
  usage: null, requesterId: 'actor-1', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' } satisfies Omit<AgentRequest, 'state' | 'failure' | 'result'>

// 在路由上下文中展示给定合成请求，复用各状态场景的渲染入口。
function show(request: AgentRequest) {
  render(<MemoryRouter><AgentRequestView request={request} /></MemoryRouter>)
}

// 验证 QUEUED/RUNNING 只展示等待状态，不冒充成功建议。
it.each([
  ['QUEUED', '解释请求排队中'], ['RUNNING', '正在生成并校验建议'],
])('announces the pending %s state without presenting a successful result', (state, label) => {
  show({ ...base, state, failure: null, result: null } as AgentRequest)
  expect(screen.getByRole('status')).toHaveTextContent(label)
  expect(screen.queryByRole('heading', { name: '已校验的建议' })).not.toBeInTheDocument()
  expect(screen.getByText(/trace-1/)).toBeInTheDocument()
})

// 逐个失败码验证固定说明，供应方原文不展示。
it.each([
  ['MODEL_DISABLED', '模型调用已关闭'], ['MODEL_TIMEOUT', '模型调用超时'],
  ['OUTPUT_INVALID', '模型输出无效'], ['CITATION_INVALID', '引用未通过验证'],
  ['QUOTA_EXHAUSTED', '额度已耗尽'],
  ['MODEL_UNAVAILABLE', '模型当前不可用'], ['AUTHORIZATION_REVOKED', 'Project 授权已失效'],
  ['INTERNAL_ERROR', 'Agent 请求失败'],
])('shows a stable unavailable reason for %s', (code, label) => {
  show({ ...base, state: 'FAILED', failure: { code, message: 'unsafe provider text' }, result: null } as AgentRequest)
  expect(screen.getByRole('alert')).toHaveTextContent(label)
  expect(screen.queryByText('unsafe provider text')).not.toBeInTheDocument()
  expect(screen.getByText(/trace-1/)).toBeInTheDocument()
})

// 验证已校验建议与确定性扫描/门禁结果清楚区分。
it('separates verified advice from deterministic scan results', () => {
  show({ ...base, state: 'SUCCEEDED', failure: null, result: { conclusion: 'Review this dependency.',
    claims: ['The scanner found a dependency.'], ruleBasis: ['Internal dependency rule applies.'],
    suggestions: [{ kind: 'HUMAN_VERIFICATION', text: 'Check the public API.', requiresHumanReview: true }],
    citations: [], evidenceCoverage: 'NONE' } } as AgentRequest)
  expect(screen.getByText('模型建议，不参与门禁或 CI')).toBeInTheDocument()
  expect(screen.getByText('Review this dependency.')).toBeInTheDocument()
  expect(screen.getByText(/Check the public API/)).toBeInTheDocument()
  expect(screen.getByText(/Prompt finding-explanation-0.1.0/)).toBeInTheDocument()
})

// 验证跨 Project 引用不成为可核对 Evidence 链接。
it('does not offer a cross-Project citation as a verified Evidence link', () => {
  show({ ...base, state: 'SUCCEEDED', failure: null, result: { conclusion: 'Review this dependency.',
    claims: [], ruleBasis: [], suggestions: [], evidenceCoverage: 'NONE', citations: [{
      citationId: 'c-1', source: 'SCANNER_EVIDENCE', label: 'Evidence', projectId: 'other-project',
      scanJobId: 'job-1', reportSha256: 'a'.repeat(64), evidenceId: 'evidence-1',
      documentVersionId: null, contentSha256: null, fragmentIndex: null, fragmentSha256: null,
    }] } } as AgentRequest)
  expect(screen.queryByRole('button', { name: /核对 Evidence/ })).not.toBeInTheDocument()
  expect(screen.getByText(/引用尚不可在此页验证/)).toBeInTheDocument()
})

// 验证只展示匹配绑定摘要的不可变文档，正文始终按文本渲染。
it.each([true, false])('resolves only the bound immutable document digest (matching=%s)', async (matching) => {
  apiMock.mockReset().mockResolvedValue({ id: 'version-1', projectId: 'project-1', documentKey: 'architecture',
    versionNumber: 1, contentSha256: matching ? 'c'.repeat(64) : 'd'.repeat(64), content: '<script>untrusted</script>' })
  show({ ...base, state: 'SUCCEEDED', failure: null, bindings: { ...base.bindings,
    documentVersions: [{ documentVersionId: 'version-1', contentSha256: 'c'.repeat(64) }] },
    result: { conclusion: 'Review', claims: [], ruleBasis: [], suggestions: [], evidenceCoverage: 'PARTIAL', citations: [{
      citationId: 'document-citation', source: 'PROJECT_DOCUMENT', projectId: 'project-1', label: 'Architecture',
      documentVersionId: 'version-1', contentSha256: 'c'.repeat(64), fragmentIndex: 0, fragmentSha256: 'e'.repeat(64),
      evidenceId: null, scanJobId: null, reportSha256: null,
    }] } } as AgentRequest)
  fireEvent.click(screen.getByRole('button', { name: /核对文档版本/ }))
  expect(apiMock).toHaveBeenCalledWith('/api/v1/projects/project-1/documents/versions/version-1', { signal: expect.any(AbortSignal) })
  if (matching) expect(await screen.findByText('<script>untrusted</script>')).toBeInTheDocument()
  else { expect(await screen.findByText(/引用无法验证/)).toBeInTheDocument(); expect(screen.queryByText('<script>untrusted</script>')).not.toBeInTheDocument() }
})

// 构造带明确 Project 与来源绑定的合成成功请求，用于测试引用的权限和生命周期。
function citedRequest(source: 'PROJECT_DOCUMENT' | 'SCANNER_EVIDENCE' = 'PROJECT_DOCUMENT', projectId = 'project-1'): AgentRequest {
  return { ...base, projectId, state: 'SUCCEEDED', failure: null,
    bindings: { ...base.bindings, documentVersions: [{ documentVersionId: 'version-1', contentSha256: 'c'.repeat(64) }] },
    result: { conclusion: 'Review', claims: [], ruleBasis: [], suggestions: [], evidenceCoverage: 'PARTIAL', citations: [{
      citationId: 'citation-1', source, projectId, label: 'Architecture',
      documentVersionId: source === 'PROJECT_DOCUMENT' ? 'version-1' : null,
      contentSha256: source === 'PROJECT_DOCUMENT' ? 'c'.repeat(64) : null,
      fragmentIndex: source === 'PROJECT_DOCUMENT' ? 0 : null, fragmentSha256: source === 'PROJECT_DOCUMENT' ? 'e'.repeat(64) : null,
      evidenceId: source === 'SCANNER_EVIDENCE' ? 'evidence-1' : null,
      scanJobId: source === 'SCANNER_EVIDENCE' ? 'job-1' : null,
      reportSha256: source === 'SCANNER_EVIDENCE' ? 'a'.repeat(64) : null,
    }] } }
}
// 构造具有真实客户端错误类型的读取失败，区别于仅包含状态形状或相似文本的普通错误。
function rejectedRead(status: number) {
  return new ApiClientError(status, { code: 'opaque', message: 'unsafe provider text', traceId: '', details: {} })
}

// 验证文档与 Evidence 的 401/403/404 以类型化状态上报。
it.each([401, 403, 404] as const)('forwards typed citation denial %s for document and Evidence reads', async status => {
  for (const source of ['PROJECT_DOCUMENT', 'SCANNER_EVIDENCE'] as const) {
    const denied = vi.fn()
    apiMock.mockReset().mockRejectedValue(rejectedRead(status))
    const view = render(<AgentRequestView request={citedRequest(source)} onDenied={denied} />)
    fireEvent.click(screen.getByRole('button', { name: /核对/ }))
    await waitFor(() => expect(denied).toHaveBeenCalledExactlyOnceWith(status))
    expect(screen.queryByText('unsafe provider text')).not.toBeInTheDocument()
    view.unmount()
  }
})

// 验证普通错误或相似文本不被推断为授权丢失。
it.each([new ApiClientError(500, { code: 'opaque', message: '403 denied', traceId: '', details: {} }),
  new Error('401 denied'), { status: 403 }])('keeps ordinary citation failure local without inferring authorization from text or shape (%s)', async failure => {
  const denied = vi.fn()
  apiMock.mockReset().mockRejectedValue(failure)
  render(<AgentRequestView request={citedRequest()} onDenied={denied} />)
  fireEvent.click(screen.getByRole('button', { name: /核对文档版本/ }))
  expect(await screen.findByText(/引用无法验证/)).toBeInTheDocument()
  expect(denied).not.toHaveBeenCalled()
  expect(screen.getByText('Review')).toBeInTheDocument()
})

// 验证未提供失权回调的既有调用者继续安全展示局部引用失败。
it('keeps old callers without a denial callback compatible', async () => {
  apiMock.mockReset().mockRejectedValue(rejectedRead(403))
  show(citedRequest())
  fireEvent.click(screen.getByRole('button', { name: /核对文档版本/ }))
  expect(await screen.findByText(/引用无法验证/)).toBeInTheDocument()
  expect(screen.getByText('Review')).toBeInTheDocument()
  expect(screen.queryByText('unsafe provider text')).not.toBeInTheDocument()
})

// 验证卸载取消引用读取，迟到成功/失权均不影响页面。
it.each(['success', 'denial'] as const)('aborts and ignores late citation %s after unmount', async outcome => {
  let settle!: (value: unknown) => void, reject!: (reason: unknown) => void
  apiMock.mockReset().mockReturnValue(new Promise((resolve, fail) => { settle = resolve; reject = fail }))
  const denied = vi.fn()
  const view = render(<AgentRequestView request={citedRequest()} onDenied={denied} />)
  fireEvent.click(screen.getByRole('button', { name: /核对文档版本/ }))
  expect(apiMock).toHaveBeenCalledWith('/api/v1/projects/project-1/documents/versions/version-1', { signal: expect.any(AbortSignal) })
  const signal = apiMock.mock.calls[0][1].signal as AbortSignal
  expect(signal.aborted).toBe(false)
  view.unmount()
  expect(signal.aborted).toBe(true)
  await act(async () => {
    if (outcome === 'denial') reject(rejectedRead(403))
    else settle({ id: 'version-1', projectId: 'project-1', contentSha256: 'c'.repeat(64), content: 'late private detail' })
  })
  expect(denied).not.toHaveBeenCalled()
  expect(screen.queryByText('late private detail')).not.toBeInTheDocument()
})

// 验证即使 ID 复用，旧 Project 范围的迟到引用结果仍被忽略。
it.each(['success', 'denial'] as const)('ignores old-scope citation %s even when request and citation IDs are reused', async outcome => {
  let settle!: (value: unknown) => void, reject!: (reason: unknown) => void
  apiMock.mockReset().mockReturnValueOnce(new Promise((resolve, fail) => { settle = resolve; reject = fail }))
  const oldDenied = vi.fn(), currentDenied = vi.fn()
  const view = render(<AgentRequestView request={citedRequest()} onDenied={oldDenied} />)
  fireEvent.click(screen.getByRole('button', { name: /核对文档版本/ }))
  expect(apiMock).toHaveBeenCalledWith('/api/v1/projects/project-1/documents/versions/version-1', { signal: expect.any(AbortSignal) })
  const signal = apiMock.mock.calls[0][1].signal as AbortSignal
  view.rerender(<AgentRequestView request={citedRequest('PROJECT_DOCUMENT', 'project-2')} onDenied={currentDenied} />)
  expect(signal.aborted).toBe(true)
  await act(async () => {
    if (outcome === 'denial') reject(rejectedRead(404))
    else settle({ id: 'version-1', projectId: 'project-1', contentSha256: 'c'.repeat(64), content: 'old scope detail' })
  })
  expect(oldDenied).not.toHaveBeenCalled(); expect(currentDenied).not.toHaveBeenCalled()
  expect(screen.queryByText('old scope detail')).not.toBeInTheDocument()
  expect(screen.queryByText(/引用无法验证/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /核对文档版本/ })).toBeEnabled()
})

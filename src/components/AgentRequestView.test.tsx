import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AgentRequest } from '../api/agent'
import { AgentRequestView } from './AgentRequestView'

const base = { id: 'request-1', projectId: 'project-1', traceId: 'trace-1', purpose: 'FINDING_EXPLANATION',
  bindings: { scanJobId: 'job-1', reportSha256: 'a'.repeat(64), prHeadRevisionId: null,
    findingIds: ['finding-1'], documentVersions: [], promptVersion: 'finding-explanation-0.1.0',
    modelProfileVersion: 'fake', modelProtocolVersion: 'responses-v1-restricted', modelId: 'fake',
    outputSchemaVersion: '0.1.0', priceCatalogVersion: 'synthetic', inputDigest: 'b'.repeat(64) },
  usage: null, requesterId: 'actor-1', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' }

function show(request: AgentRequest) {
  render(<MemoryRouter><AgentRequestView request={request} /></MemoryRouter>)
}

it.each([
  ['MODEL_DISABLED', '模型调用已关闭'], ['MODEL_TIMEOUT', '模型调用超时'],
  ['OUTPUT_INVALID', '模型输出无效'], ['CITATION_INVALID', '引用未通过验证'],
  ['QUOTA_EXHAUSTED', '额度已耗尽'],
])('shows a stable unavailable reason for %s', (code, label) => {
  show({ ...base, state: 'FAILED', failure: { code, message: 'unsafe provider text' }, result: null } as AgentRequest)
  expect(screen.getByRole('alert')).toHaveTextContent(label)
  expect(screen.queryByText('unsafe provider text')).not.toBeInTheDocument()
  expect(screen.getByText(/trace-1/)).toBeInTheDocument()
})

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

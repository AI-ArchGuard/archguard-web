import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PrSummary } from './PrSummary'
import type { GateEvaluation, PullRequest } from '../api/governance'

const state = vi.hoisted(() => ({ role: 'MAINTAINER', api: vi.fn() }))
vi.mock('../api/client', async (load) => ({ ...await load<typeof import('../api/client')>(), api: state.api }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { profile: { sub: 'actor-1' } } }) }))
vi.mock('../hooks/useApi', () => ({ useApi: (_loader: unknown, key: string) => ({ loading: false, reload: vi.fn(),
  data: key.startsWith('role:') ? state.role : key.startsWith('summary-input:') ? {
    job: { id: 'job-1', projectId: 'project-1', repositoryId: 'repository-1', status: 'SUCCEEDED', reportSha256: 'a'.repeat(64) },
    findings: [{ id: 'finding-1', projectId: 'project-1', jobId: 'job-1', ruleId: 'dependency', message: 'Selected violation' }],
  } : { items: [] },
}) }))

const pr = { projectId: 'project-1', repositoryId: 'repository-1', externalId: '7', headSha: 'b'.repeat(40),
  targetBranch: 'main', currentGateEvaluationId: 'gate-1', currentHeadRevisionId: 'revision-1' } as PullRequest
const gate = { id: 'gate-1', projectId: 'project-1', repositoryId: 'repository-1', targetBranch: 'main', candidateJobId: 'job-1' } as GateEvaluation
beforeEach(() => { state.role = 'MAINTAINER'; state.api.mockReset() })

it('requires an explicit Finding selection and submits the verified PR/scan binding only on click', async () => {
  state.api.mockResolvedValue({ id: 'request-1', purpose: 'PR_SUMMARY', projectId: 'project-1', state: 'FAILED',
    failure: { code: 'MODEL_DISABLED' }, traceId: 'trace-1', bindings: { scanJobId: 'job-1', reportSha256: 'a'.repeat(64),
      prHeadRevisionId: 'revision-1', findingIds: ['finding-1'], documentVersions: [], promptVersion: 'pr-summary-0.1.0', modelId: 'fake', outputSchemaVersion: '0.1.0' } })
  render(<PrSummary projectId="project-1" repositoryId="repository-1" pr={pr} gate={gate} />)
  expect(state.api).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: '生成所选 Finding 的 PR 摘要' })).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox', { name: /Selected violation/ }))
  fireEvent.click(screen.getByRole('button', { name: '生成所选 Finding 的 PR 摘要' }))
  await waitFor(() => expect(state.api).toHaveBeenCalledTimes(1))
  expect(JSON.parse(state.api.mock.calls[0][1].body)).toEqual({ purpose: 'PR_SUMMARY', scanJobId: 'job-1',
    reportSha256: 'a'.repeat(64), prHeadRevisionId: 'revision-1', findingIds: ['finding-1'], documentVersionIds: [] })
  expect(await screen.findByRole('alert')).toHaveTextContent('模型调用已关闭')
})

it('does not offer a summary without trusted head history', () => {
  render(<PrSummary projectId="project-1" repositoryId="repository-1" pr={{ ...pr, currentHeadRevisionId: null }} gate={gate} />)
  expect(screen.getByText(/缺少可信的 PR 修订/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /生成所选/ })).not.toBeInTheDocument()
})

it('limits the Web summary entry to Maintainers', () => {
  state.role = 'VIEWER'
  render(<PrSummary projectId="project-1" repositoryId="repository-1" pr={pr} gate={gate} />)
  expect(screen.getByText(/Maintainer/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /生成所选/ })).not.toBeInTheDocument()
})

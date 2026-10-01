import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { FindingExplanation } from './FindingExplanation'

const apiMock = vi.hoisted(() => vi.fn())
vi.mock('../api/client', async (load) => ({ ...await load<typeof import('../api/client')>(), api: apiMock }))
vi.mock('../hooks/useApi', () => ({ useApi: () => ({ data: { items: [] }, loading: false, error: undefined, reload: vi.fn() }) }))

const job = { id: 'job-1', projectId: 'project-1', status: 'SUCCEEDED', reportSha256: 'a'.repeat(64) }
const finding = { id: 'finding-1', projectId: 'project-1', jobId: 'job-1', ruleId: 'dependency' }

it('never calls the model API until the user explicitly requests an explanation', async () => {
  apiMock.mockReset().mockResolvedValue({ id: 'request-1', state: 'FAILED', failure: { code: 'MODEL_DISABLED' },
    purpose: 'FINDING_EXPLANATION', projectId: 'project-1', traceId: 'trace-1', bindings: {
      scanJobId: 'job-1', reportSha256: 'a'.repeat(64), prHeadRevisionId: null, findingIds: ['finding-1'], documentVersions: [], promptVersion: 'finding-explanation-0.1.0',
      modelId: 'fake', outputSchemaVersion: '0.1.0' } })
  render(<MemoryRouter><FindingExplanation projectId="project-1" job={job as never} finding={finding as never} /></MemoryRouter>)
  expect(apiMock).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '解释此 Finding' }))
  await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(1))
  expect(JSON.parse(apiMock.mock.calls[0][1].body)).toMatchObject({ purpose: 'FINDING_EXPLANATION',
    findingIds: ['finding-1'], prHeadRevisionId: null })
  expect(await screen.findByRole('alert')).toHaveTextContent('模型调用已关闭')
})

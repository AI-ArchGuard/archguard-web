import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ApiClientError } from '../api/client'
import { GovernancePage } from './GovernancePage'

const state = vi.hoisted(() => ({ current: true, forbidden: false }))
vi.mock('../hooks/useApi', () => ({
  useApi: (_loader: unknown, key: string) => {
    const common = { loading: false, error: undefined, reload: vi.fn() }
    if (key.startsWith('repo:')) return { ...common, data: { id: 'repository', name: 'Orders' } }
    if (key.startsWith('rule-sets:')) return { ...common, data: [{ id: 'set-1', name: 'Architecture' }] }
    if (key.startsWith('versions:')) return { ...common, data: [{ id: 'version-1', version: 1 }] }
    if (key.startsWith('prs:')) return state.forbidden ? { ...common, error: new ApiClientError(403, { code: 'forbidden', message: 'forbidden', traceId: '', details: {} }) }
      : { ...common, data: { items: [{ externalId: '7', headSha: 'b'.repeat(40), baseSha: 'a'.repeat(40), targetBranch: 'main', currentGateEvaluationId: state.current ? 'gate-1' : null }], hasMore: false } }
    if (key.startsWith('current-gate:')) return { ...common, data: state.current ? gate : undefined }
    if (key.startsWith('baseline:')) return { ...common, data: [{ id: 'baseline-1', version: 1, active: true, commitSha: 'a'.repeat(40), createdAt: '2026-09-26T00:00:00Z' }] }
    if (key.startsWith('exceptions:')) return { ...common, data: [{ id: 'exception-1', scopeType: 'RULE', scopeValue: 'dependency', reason: 'migration', createdBy: 'maintainer', expiresAt: '2026-10-01T00:00:00Z', version: 1, status: 'ACTIVE' }] }
    if (key.startsWith('history:')) return { ...common, data: { items: [gate], hasMore: false } }
    if (key.startsWith('comparison:')) return { ...common, data: { baselineVersionId: 'baseline-1', newCount: 1, existingCount: 1, resolvedCount: 1, findings: [
      { classification: 'NEW', fingerprint: 'new-fingerprint', severity: 'high', ruleId: 'dependency' },
      { classification: 'EXISTING', fingerprint: 'existing-fingerprint', severity: 'medium', ruleId: 'cycle' },
      { classification: 'RESOLVED', fingerprint: 'resolved-fingerprint', severity: 'low', ruleId: 'layer' },
    ] } }
    return { ...common, data: undefined }
  },
}))

const gate = { id: 'gate-1', outcome: 'FAIL', ciExitCode: 2, blockedCount: 1, newCount: 1, existingCount: 1, resolvedCount: 1,
  evaluatedAt: '2026-09-26T00:00:00Z', comparisonId: 'comparison-1' }

function showPage() {
  render(<MemoryRouter initialEntries={['/projects/project-1/repositories/repository-1/governance']}><Routes>
    <Route path="/projects/:projectId/repositories/:repositoryId/governance" element={<GovernancePage />} />
  </Routes></MemoryRouter>)
}

it('shows the current head gate, scoped history, classified findings and exception expiry', () => {
  state.current = true; state.forbidden = false
  showPage()
  fireEvent.change(screen.getByLabelText('规则集'), { target: { value: 'set-1' } })
  fireEvent.change(screen.getByLabelText('不可变规则版本'), { target: { value: 'version-1' } })
  fireEvent.click(screen.getByRole('button', { name: /#7/ }))
  expect(screen.getByText(/CI 退出码 2/)).toBeInTheDocument()
  expect(screen.getByText(/到期/)).toBeInTheDocument()
  const classification = screen.getByRole('heading', { name: 'Finding 分类' }).closest('section')!
  expect(within(classification).getByText('new-fingerprint', { exact: false })).toBeInTheDocument()
  expect(within(classification).getByText('existing-fingerprint', { exact: false })).toBeInTheDocument()
  expect(within(classification).getByText('resolved-fingerprint', { exact: false })).toBeInTheDocument()
  expect(screen.getByLabelText('新增趋势 1')).toBeInTheDocument()
})

it('does not reuse a historical result when the PR head has no current gate', () => {
  state.current = false; state.forbidden = false
  showPage()
  fireEvent.click(screen.getByRole('button', { name: /#7/ }))
  expect(screen.getByText(/旧提交的 PASS 不代表当前状态/)).toBeInTheDocument()
})

it('shows a safe forbidden state for a cross-project PR list', () => {
  state.current = true; state.forbidden = true
  showPage()
  expect(screen.getByText(/无权查看此 Project/)).toBeInTheDocument()
})

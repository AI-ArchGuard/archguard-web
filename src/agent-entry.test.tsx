// Agent 展示回归：关闭时文档/解释/摘要零挂载，扫描与门禁继续可用；精确 true 才恢复入口。
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { App } from './App'
import { ProjectPage } from './pages/ProjectPage'
import { ScanResultPage } from './pages/ScanResultPage'
import { GovernancePage } from './pages/GovernancePage'

const mounts = vi.hoisted(() => ({ document: vi.fn(), explanation: vi.fn(), summary: vi.fn() }))
vi.mock('./auth/AuthContext', () => ({ useAuth: () => ({ user: { profile: { sub: 'synthetic-actor' } }, loading: false, logout: vi.fn() }) }))
vi.mock('./pages/AgentDocumentsPage', () => ({ AgentDocumentsPage: () => { mounts.document(); return <p>synthetic-document-entry</p> } }))
vi.mock('./components/FindingExplanation', () => ({ FindingExplanation: () => { mounts.explanation(); return <p>synthetic-explanation-entry</p> } }))
vi.mock('./components/PrSummary', () => ({ PrSummary: () => { mounts.summary(); return <p>synthetic-summary-entry</p> } }))
vi.mock('./hooks/useApi', () => ({ useApi: (_loader: unknown, key: string) => {
  const common = { loading: false, reload: vi.fn() }
  if (key.startsWith('project:')) return { ...common, data: { key: 'synthetic', name: 'Synthetic project' } }
  if (key.startsWith('job:')) return { ...common, data: { id: 'job-1', status: 'SUCCEEDED', outcome: 'FAIL' } }
  if (key.startsWith('findings:')) return { ...common, data: [{ id: 'finding-1', ruleId: 'dependency', severity: 'high', message: 'Synthetic violation', evidenceIds: [] }] }
  if (key.startsWith('repo:')) return { ...common, data: { name: 'Synthetic repository' } }
  if (key.startsWith('prs:')) return { ...common, data: { items: [{ externalId: '7', headSha: 'b'.repeat(40), targetBranch: 'main', currentGateEvaluationId: 'gate-1' }] } }
  if (key.startsWith('current-gate:')) return { ...common, data: { id: 'gate-1', outcome: 'FAIL', ciExitCode: 2, evaluatedAt: '2026-10-01T00:00:00Z', ruleSetVersionId: 'rules-1' } }
  if (key.startsWith('history:')) return { ...common, data: { items: [] } }
  return { ...common, data: [] }
} }))

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

// 按给定深链接和路由挂载页面，观察展示开关是否阻止业务组件进入生命周期。
function show(page: React.ReactNode, path: string, route: string) {
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={page} /></Routes></MemoryRouter>)
}

// 验证文档深链接在缺失/非法展示开关下关闭。
it.each([undefined, 'false', 'TRUE', '1', 'unexpected'])('fails closed for the document deep link when the flag is %s', (value) => {
  vi.stubEnv('VITE_AGENT_UI_ENABLED', value)
  render(<MemoryRouter initialEntries={['/projects/project-1/agent/documents']}><App /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: 'Agent 入口已关闭' })).toBeInTheDocument()
  expect(mounts.document).not.toHaveBeenCalled()
})

// 验证关闭入口后文档导航隐藏，受控扫描注册仍可用。
it('hides the project document link while leaving scan registration available', () => {
  vi.stubEnv('VITE_AGENT_UI_ENABLED', 'false')
  show(<ProjectPage />, '/projects/project-1', '/projects/:projectId')
  expect(screen.queryByRole('link', { name: '项目文档' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '提交 ScanJob' })).toBeInTheDocument()
})

// 验证 Finding 保持可见但解释 Hook 完全不挂载。
it('does not mount explanation hooks while preserving the deterministic finding', () => {
  vi.stubEnv('VITE_AGENT_UI_ENABLED', 'false')
  show(<ScanResultPage />, '/projects/project-1/scan-jobs/job-1', '/projects/:projectId/scan-jobs/:jobId')
  expect(mounts.explanation).not.toHaveBeenCalled()
  expect(screen.getByText('Synthetic violation')).toBeInTheDocument()
  expect(screen.getByText('FAIL')).toBeInTheDocument()
})

// 验证门禁 FAIL/CI 2 不变且摘要 Hook 不挂载。
it('does not mount summary hooks while preserving FAIL / CI 2', () => {
  vi.stubEnv('VITE_AGENT_UI_ENABLED', 'false')
  show(<GovernancePage />, '/projects/project-1/repositories/repository-1/governance', '/projects/:projectId/repositories/:repositoryId/governance')
  fireEvent.click(screen.getByRole('button', { name: /#7/ }))
  expect(mounts.summary).not.toHaveBeenCalled()
  expect(screen.getByText(/CI 退出码 2/)).toBeInTheDocument()
  expect(screen.getByText('FAIL')).toBeInTheDocument()
})

// 验证精确 true 恢复文档路由。
it('explicit true restores the document route', () => {
  vi.stubEnv('VITE_AGENT_UI_ENABLED', 'true')
  render(<MemoryRouter initialEntries={['/projects/project-1/agent/documents']}><App /></MemoryRouter>)
  expect(screen.getByText('synthetic-document-entry')).toBeInTheDocument()
})

// 验证精确 true 恢复解释组件挂载。
it('explicit true restores explanation mounts', () => {
  vi.stubEnv('VITE_AGENT_UI_ENABLED', 'true')
  show(<ScanResultPage />, '/projects/project-1/scan-jobs/job-1', '/projects/:projectId/scan-jobs/:jobId')
  expect(mounts.explanation).toHaveBeenCalled()
})

// 验证精确 true 恢复 Project 文档导航。
it('explicit true restores the project document link', () => {
  vi.stubEnv('VITE_AGENT_UI_ENABLED', 'true')
  show(<ProjectPage />, '/projects/project-1', '/projects/:projectId')
  expect(screen.getByRole('link', { name: '项目文档' })).toBeInTheDocument()
})

// 验证精确 true 恢复摘要组件挂载。
it('explicit true restores summary mounts', () => {
  vi.stubEnv('VITE_AGENT_UI_ENABLED', 'true')
  show(<GovernancePage />, '/projects/project-1/repositories/repository-1/governance', '/projects/:projectId/repositories/:repositoryId/governance')
  fireEvent.click(screen.getByRole('button', { name: /#7/ }))
  expect(mounts.summary).toHaveBeenCalled()
})

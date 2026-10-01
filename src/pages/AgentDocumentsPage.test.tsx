import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ApiClientError } from '../api/client'
import { AgentDocumentsPage } from './AgentDocumentsPage'

const state = vi.hoisted(() => ({ role: 'VIEWER', denied: false }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { profile: { sub: 'actor-1' } } }) }))
vi.mock('../hooks/useApi', () => ({ useApi: (_loader: unknown, key: string) => {
  const common = { loading: false, error: undefined, reload: vi.fn() }
  if (key.startsWith('role:')) return { ...common, data: state.role }
  if (key.startsWith('documents:')) return state.denied
    ? { ...common, error: new ApiClientError(404, { code: 'not_found', message: 'hidden', traceId: '', details: {} }) }
    : { ...common, data: { items: [{ id: 'doc-1', documentKey: 'architecture', latestVersionNumber: 2 }], total: 1 } }
  return { ...common, data: undefined }
} }))

function show() {
  render(<MemoryRouter initialEntries={['/projects/project-1/agent/documents']}><Routes>
    <Route path="/projects/:projectId/agent/documents" element={<AgentDocumentsPage />} />
  </Routes></MemoryRouter>)
}

it('shows versions but no upload controls to a Viewer', () => {
  state.role = 'VIEWER'; state.denied = false; show()
  expect(screen.getByText('architecture')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '创建不可变版本' })).not.toBeInTheDocument()
})

it('shows explicit upload controls only to a Maintainer', () => {
  state.role = 'MAINTAINER'; state.denied = false; show()
  expect(screen.getByRole('button', { name: '创建不可变版本' })).toBeInTheDocument()
})

it('hides document existence when Project access is revoked', () => {
  state.role = 'VIEWER'; state.denied = true; show()
  expect(screen.getByText('无权查看此 Project，或资源不存在。')).toBeInTheDocument()
  expect(screen.queryByText('architecture')).not.toBeInTheDocument()
})

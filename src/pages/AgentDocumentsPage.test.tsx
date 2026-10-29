// 文档页权限回归：Viewer 可读版本，Maintainer 才有上传入口，失权后隐藏文档存在性。
import { fireEvent, render, screen } from '@testing-library/react'
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

// 以固定 Project 深链接挂载文档页，使路由参数参与权限与资源读取。
function show() {
  render(<MemoryRouter initialEntries={['/projects/project-1/agent/documents']}><Routes>
    <Route path="/projects/:projectId/agent/documents" element={<AgentDocumentsPage />} />
  </Routes></MemoryRouter>)
}

// 验证 Viewer 可见版本却没有上传控件。
it('shows versions but no upload controls to a Viewer', () => {
  state.role = 'VIEWER'; state.denied = false; show()
  expect(screen.getByText('architecture')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '创建不可变版本' })).not.toBeInTheDocument()
})

// 验证只有 Maintainer 获得显式上传控件。
it('shows explicit upload controls only to a Maintainer', () => {
  state.role = 'MAINTAINER'; state.denied = false; show()
  fireEvent.click(screen.getByText('上传新版本', { selector: 'summary' }))
  expect(screen.getByRole('button', { name: '创建不可变版本' })).toBeInTheDocument()
})

// 上传收纳只改变展示，不能卸载表单而丢失文档键或 File 对象。
it('lists documents before the closed upload form and retains the draft file across toggles', () => {
  state.role = 'MAINTAINER'; state.denied = false; show()
  const summary = screen.getByText('上传新版本', { selector: 'summary' })
  const disclosure = summary.closest('details')!
  expect(disclosure).not.toHaveAttribute('open')
  expect(screen.getByText('architecture').compareDocumentPosition(disclosure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.click(summary)
  const key = screen.getByLabelText('文档标识')
  const input = screen.getByLabelText('Markdown 或纯文本') as HTMLInputElement
  const file = new File(['draft'], 'draft.md', { type: 'text/markdown' })
  fireEvent.change(key, { target: { value: 'draft-architecture' } })
  fireEvent.change(input, { target: { files: [file] } })
  fireEvent.click(summary); fireEvent.click(summary)
  expect(screen.getByLabelText('文档标识')).toBe(key)
  expect(key).toHaveValue('draft-architecture')
  expect(screen.getByLabelText('Markdown 或纯文本')).toBe(input)
  expect(input.files?.[0]).toBe(file)
})

// 验证失去 Project 访问权限时连文档存在性也不展示。
it('hides document existence when Project access is revoked', () => {
  state.role = 'VIEWER'; state.denied = true; show()
  expect(screen.getByText('无权查看此 Project，或资源不存在。')).toBeInTheDocument()
  expect(screen.queryByText('architecture')).not.toBeInTheDocument()
})

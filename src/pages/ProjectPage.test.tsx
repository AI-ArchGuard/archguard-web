// 工作台保留仓库/扫描定位及扫描提交，注册表单按需打开且保留草稿。
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProjectPage } from './ProjectPage'

vi.mock('../hooks/useApi', () => ({ useApi: (_loader: unknown, key: string) => ({ loading: false, reload: vi.fn(),
  data: key.startsWith('project:') ? { id: 'project-1', key: 'orders', name: 'Orders', version: 1 }
    : key.startsWith('repositories:') ? [{ id: 'repo-1', key: 'orders', name: 'Orders repository', mountPath: 'samples/orders' }] : [] }) }))

it('shows repository results before a closed registration form and keeps the draft and anchors', () => {
  render(<MemoryRouter initialEntries={['/projects/project-1']}><Routes>
    <Route path="/projects/:projectId" element={<ProjectPage />} />
  </Routes></MemoryRouter>)
  const summary = screen.getByText('注册仓库', { selector: 'summary' })
  const disclosure = summary.closest('details')!
  expect(disclosure).not.toHaveAttribute('open')
  const repository = screen.getByText('Orders repository', { selector: 'strong' })
  expect(repository.compareDocumentPosition(disclosure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(repository.closest('section')).toHaveAttribute('id', 'repositories')
  expect(screen.getByRole('heading', { name: '扫描历史' }).closest('section')).toHaveAttribute('id', 'scans')
  fireEvent.click(summary)
  const mount = screen.getByLabelText('受控挂载相对路径')
  fireEvent.change(mount, { target: { value: 'samples/draft' } })
  fireEvent.click(summary); fireEvent.click(summary)
  expect(screen.getByLabelText('受控挂载相对路径')).toBe(mount)
  expect(mount).toHaveValue('samples/draft')
  expect(screen.getByRole('button', { name: '提交 ScanJob' })).toBeInTheDocument()
})

// 项目列表优先；按需创建保留尚未提交的非敏感输入。
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProjectsPage } from './ProjectsPage'

vi.mock('../hooks/useApi', () => ({ useApi: () => ({ loading: false, reload: vi.fn(),
  data: { items: [{ id: 'project-1', key: 'orders', name: 'Orders', version: 1 }] } }) }))

it('puts accessible projects before a closed create form and preserves its draft', () => {
  render(<MemoryRouter><ProjectsPage /></MemoryRouter>)
  const list = screen.getByRole('heading', { name: '可访问的 Projects' })
  const summary = screen.getByText('新建 Project', { selector: 'summary' })
  const disclosure = summary.closest('details')!
  expect(list.compareDocumentPosition(disclosure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(disclosure).not.toHaveAttribute('open')
  expect(screen.getByRole('link', { name: /Orders/ })).toBeVisible()
  fireEvent.click(summary)
  const name = screen.getByLabelText('名称')
  fireEvent.change(name, { target: { value: 'Draft project' } })
  fireEvent.click(summary); fireEvent.click(summary)
  expect(screen.getByLabelText('名称')).toBe(name)
  expect(name).toHaveValue('Draft project')
})

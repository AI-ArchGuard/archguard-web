// 外壳交互只导航和修改主题，不发模型请求；手机抽屉隔离背景并归还焦点。
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Shell } from './Shell'
import { ThemeProvider } from '../theme/ThemeContext'

const logout = vi.fn()
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ logout, user: { profile: { preferred_username: 'owner' } } }) }))
let mobile = false
beforeEach(() => {
  mobile = false; logout.mockReset(); localStorage.clear()
  vi.stubGlobal('fetch', vi.fn())
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query === '(max-width: 767px)' && mobile,
    addEventListener: vi.fn(), removeEventListener: vi.fn() })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })
function show(path = '/projects/project-1/repositories/repository-1/governance') {
  return render(<MemoryRouter initialEntries={[path]}><ThemeProvider><Shell><main><h1>当前内容</h1><button>内容操作</button></main></Shell></ThemeProvider></MemoryRouter>)
}

it('derives project navigation from the current resource route and retains flag boundaries', () => {
  vi.stubEnv('VITE_AGENT_UI_ENABLED', 'false'); vi.stubEnv('VITE_AGENT_LIVE_UI_ENABLED', 'false'); vi.stubEnv('VITE_CREDENTIAL_UI_ENABLED', 'false')
  show()
  expect(screen.getByRole('navigation', { name: '工作区导航' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '扫描' })).toHaveAttribute('href', '/projects/project-1#scans')
  expect(screen.getByRole('link', { name: '治理' })).toHaveAttribute('href', '/projects/project-1/repositories/repository-1/governance')
  expect(screen.queryByRole('link', { name: '架构文档' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '个人 Agent' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '模型凭据' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '收起侧栏' }))
  expect(screen.getByRole('button', { name: '展开侧栏' })).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(screen.getByRole('button', { name: '深色' }))
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  expect(fetch).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '退出' }))
  expect(logout).toHaveBeenCalledOnce()
})

it('exposes enabled existing destinations and project selection without inventing a project', () => {
  vi.stubEnv('VITE_AGENT_UI_ENABLED', 'true'); vi.stubEnv('VITE_AGENT_LIVE_UI_ENABLED', 'true'); vi.stubEnv('VITE_CREDENTIAL_UI_ENABLED', 'true')
  show('/projects/project-1')
  expect(screen.getByRole('link', { name: '架构文档' })).toHaveAttribute('href', '/projects/project-1/agent/documents')
  expect(screen.getByRole('link', { name: '个人 Agent' })).toHaveAttribute('href', '/projects/project-1/agent/personal')
  expect(screen.getByRole('link', { name: '治理' })).toHaveAttribute('href', '/projects/project-1#repositories')
  expect(screen.getByRole('link', { name: '模型凭据' })).toHaveAttribute('href', '/settings/model-credentials')
  expect(screen.getByRole('link', { name: '切换项目' })).toHaveAttribute('href', '/projects')
})

it('shows a single workspace destination until a Project is selected', () => {
  show('/projects')
  expect(screen.getByRole('link', { name: '工作台' })).toHaveAttribute('aria-current', 'page')
  expect(screen.queryByRole('link', { name: '扫描' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '治理' })).not.toBeInTheDocument()
  expect(screen.getAllByRole('link', { current: 'page' })).toHaveLength(1)
})

it('isolates closed mobile navigation, traps focus while open, and restores it on Escape and navigation', () => {
  mobile = true; show()
  const sidebar = document.querySelector('.workbench-sidebar')!
  const background = document.querySelector('.workbench-main')!
  const menu = screen.getByRole('button', { name: '打开导航' })
  expect(sidebar).toHaveAttribute('inert')
  fireEvent.click(menu)
  expect(sidebar).not.toHaveAttribute('inert')
  expect(background).toHaveAttribute('inert')
  expect(sidebar.contains(document.activeElement)).toBe(true)
  const exit = screen.getByRole('button', { name: '退出' })
  exit.focus(); fireEvent.keyDown(exit, { key: 'Tab' })
  expect(sidebar.contains(document.activeElement)).toBe(true)
  expect(document.activeElement).not.toBe(exit)
  fireEvent.keyDown(sidebar, { key: 'Escape' })
  expect(sidebar).toHaveAttribute('inert')
  expect(background).not.toHaveAttribute('inert')
  expect(menu).toHaveFocus()
  fireEvent.click(menu); fireEvent.click(screen.getByRole('link', { name: '扫描' }))
  expect(sidebar).toHaveAttribute('inert')
  expect(menu).toHaveFocus()
  expect(fetch).not.toHaveBeenCalled()
})

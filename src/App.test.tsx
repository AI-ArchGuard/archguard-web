// 应用路由冒烟测试：以未登录会话验证 OIDC 入口渲染，不依赖真实身份服务。
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { App } from './App'
import { AuthProvider } from './auth/AuthContext'

// 验证未登录路由展示 OIDC 登录入口。
it('renders the OIDC login entry', async () => {
  render(<MemoryRouter initialEntries={['/login']}><AuthProvider><App /></AuthProvider></MemoryRouter>)
  expect(await screen.findByRole('heading', { name: '让架构规则成为可追溯的事实' })).toBeInTheDocument()
})

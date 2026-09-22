import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { App } from './App'
import { AuthProvider } from './auth/AuthContext'

it('renders the OIDC login entry', async () => {
  render(<MemoryRouter initialEntries={['/login']}><AuthProvider><App /></AuthProvider></MemoryRouter>)
  expect(await screen.findByRole('heading', { name: '让架构规则成为可追溯的事实' })).toBeInTheDocument()
})

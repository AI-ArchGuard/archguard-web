import { fireEvent, render, screen } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'

const state = vi.hoisted(() => ({ signout: vi.fn() }))
vi.mock('./oidc', () => ({ userManager: {
  getUser: () => Promise.resolve({ expired: false, profile: { sub: 'owner' } }),
  signinRedirect: vi.fn(), signoutRedirect: state.signout,
  events: { addUserLoaded: vi.fn(), addUserUnloaded: vi.fn(), removeUserLoaded: vi.fn(), removeUserUnloaded: vi.fn() },
} }))

function SessionView() {
  const { user, logout } = useAuth()
  return user ? <><input aria-label="test secret field" type="password" /><button onClick={() => void logout()}>退出测试</button></> : <p>会话页面已移除</p>
}

it('unmounts authenticated pages immediately, without waiting for OIDC redirect', async () => {
  state.signout.mockImplementation(() => new Promise(() => undefined))
  render(<AuthProvider><SessionView /></AuthProvider>)
  await screen.findByLabelText('test secret field')
  fireEvent.click(screen.getByRole('button', { name: '退出测试' }))
  expect(screen.queryByLabelText('test secret field')).not.toBeInTheDocument()
  expect(screen.getByText('会话页面已移除')).toBeInTheDocument()
  expect(state.signout).toHaveBeenCalledTimes(1)
})

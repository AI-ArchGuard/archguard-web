import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { App } from './App'
import { credentialEntryEnabled } from './credentialEntry'

vi.mock('./auth/AuthContext', () => ({ useAuth: () => ({ loading: false, user: { profile: { sub: 'owner' } }, logout: vi.fn() }) }))
afterEach(() => vi.unstubAllEnvs())

it.each(['false', '', 'TRUE', 'yes'])('fails closed and does not mount the credential page (%s)', value => {
  vi.stubEnv('VITE_CREDENTIAL_UI_ENABLED', value)
  expect(credentialEntryEnabled()).toBe(false)
  render(<MemoryRouter initialEntries={['/settings/model-credentials']}><App /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: '凭据入口已关闭' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '模型凭据' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('新的 DeepSeek API Key')).not.toBeInTheDocument()
})

it('requires exact true, independently of the Agent presentation flag', () => {
  vi.stubEnv('VITE_CREDENTIAL_UI_ENABLED', 'true'); vi.stubEnv('VITE_AGENT_UI_ENABLED', 'false')
  expect(credentialEntryEnabled()).toBe(true)
})

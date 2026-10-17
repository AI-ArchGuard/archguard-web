import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { App } from './App'

const spies = vi.hoisted(() => ({ api: vi.fn(), credential: vi.fn() }))
vi.mock('./auth/AuthContext', () => ({ useAuth: () => ({ loading: false, user: { profile: { sub: 'owner' } }, logout: vi.fn() }) }))
vi.mock('./api/credentials', async importOriginal => {
  const actual = await importOriginal<typeof import('./api/credentials')>()
  return { ...actual, getCredentialStatus: spies.credential }
})
vi.mock('./api/personalAgent', async importOriginal => {
  const actual = await importOriginal<typeof import('./api/personalAgent')>()
  return Object.fromEntries(Object.entries(actual).map(([name, value]) =>
    [name, /^(get|update|acknowledge|revoke|preview|approve|run)Personal/.test(name) ? spies.api : value]))
})

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllEnvs())

it.each([
  [undefined, undefined], ['true', 'false'], ['false', 'true'], ['true', 'TRUE'], ['TRUE', 'true'],
])('closed personal deep link does not mount reads, writes or credential controls (%s / %s)', (agent, live) => {
  vi.stubEnv('VITE_AGENT_UI_ENABLED', agent)
  vi.stubEnv('VITE_AGENT_LIVE_UI_ENABLED', live)
  render(<MemoryRouter initialEntries={['/projects/11111111-1111-4111-8111-111111111111/agent/personal']}><App /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: '真实 Agent 入口已关闭' })).toBeInTheDocument()
  expect(spies.api).not.toHaveBeenCalled()
  expect(spies.credential).not.toHaveBeenCalled()
  expect(screen.queryByLabelText('新的 DeepSeek API Key')).not.toBeInTheDocument()
})

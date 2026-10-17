import { personalAgentEntryEnabled } from './personalAgentEntry'

afterEach(() => vi.unstubAllEnvs())

it.each([undefined, '', 'false', 'TRUE', '1', 'yes'])('fails closed for a missing or malformed live flag (%s)', value => {
  vi.stubEnv('VITE_AGENT_UI_ENABLED', 'true')
  vi.stubEnv('VITE_AGENT_LIVE_UI_ENABLED', value)
  expect(personalAgentEntryEnabled()).toBe(false)
})

it.each([undefined, '', 'false', 'TRUE'])('also requires the original Agent presentation flag (%s)', value => {
  vi.stubEnv('VITE_AGENT_UI_ENABLED', value)
  vi.stubEnv('VITE_AGENT_LIVE_UI_ENABLED', 'true')
  expect(personalAgentEntryEnabled()).toBe(false)
})

it('allows presentation only when both independent flags are exactly true', () => {
  vi.stubEnv('VITE_AGENT_UI_ENABLED', 'true')
  vi.stubEnv('VITE_AGENT_LIVE_UI_ENABLED', 'true')
  expect(personalAgentEntryEnabled()).toBe(true)
})

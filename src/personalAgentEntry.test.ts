// 个人入口开关真值测试：只有两个构建标志都精确为 true 才允许展示。
import { personalAgentEntryEnabled } from './personalAgentEntry'

afterEach(() => vi.unstubAllEnvs())

// 验证缺失或非精确 true 的独立 live 开关默认关闭。
it.each([undefined, '', 'false', 'TRUE', '1', 'yes'])('fails closed for a missing or malformed live flag (%s)', value => {
  vi.stubEnv('VITE_AGENT_UI_ENABLED', 'true')
  vi.stubEnv('VITE_AGENT_LIVE_UI_ENABLED', value)
  expect(personalAgentEntryEnabled()).toBe(false)
})

// 验证原 Agent 展示开关也必须同时开启。
it.each([undefined, '', 'false', 'TRUE'])('also requires the original Agent presentation flag (%s)', value => {
  vi.stubEnv('VITE_AGENT_UI_ENABLED', value)
  vi.stubEnv('VITE_AGENT_LIVE_UI_ENABLED', 'true')
  expect(personalAgentEntryEnabled()).toBe(false)
})

// 验证两个开关精确为 true 时才开放展示入口。
it('allows presentation only when both independent flags are exactly true', () => {
  vi.stubEnv('VITE_AGENT_UI_ENABLED', 'true')
  vi.stubEnv('VITE_AGENT_LIVE_UI_ENABLED', 'true')
  expect(personalAgentEntryEnabled()).toBe(true)
})

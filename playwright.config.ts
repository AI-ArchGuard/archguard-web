// 浏览器合成回归配置：独立启动本机 Web 并显式开启测试入口；本机使用 Edge，失败时保留追踪。
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure',
    channel: process.env.CI ? undefined : 'msedge' },
  // Synthetic feature tests explicitly opt in; normal builds remain default-off.
  // 合成测试显式开启展示开关；这组测试环境值不改变正常构建的默认关闭策略。
  webServer: { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: false,
    env: { VITE_AGENT_UI_ENABLED: 'true', VITE_CREDENTIAL_UI_ENABLED: 'true', VITE_AGENT_LIVE_UI_ENABLED: 'true' } },
})

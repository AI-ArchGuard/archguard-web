import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure',
    channel: process.env.CI ? undefined : 'msedge' },
  // Synthetic feature tests explicitly opt in; normal builds remain default-off.
  webServer: { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: false,
    env: { VITE_AGENT_UI_ENABLED: 'true', VITE_CREDENTIAL_UI_ENABLED: 'true' } },
})

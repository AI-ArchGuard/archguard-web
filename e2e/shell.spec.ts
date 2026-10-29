// 浏览器启动冒烟：验证本机 Web 可加载 ArchGuard 页面。
import { expect, test } from '@playwright/test'

// 验证真实浏览器中的应用外壳可加载。
test('shows the ArchGuard shell', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: '让架构规则成为可追溯的事实' })).toBeVisible()
})

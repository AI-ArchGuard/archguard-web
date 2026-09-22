import { expect, test } from '@playwright/test'

test('shows the ArchGuard shell', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: '让架构规则成为可追溯的事实' })).toBeVisible()
})

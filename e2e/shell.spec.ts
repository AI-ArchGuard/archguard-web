import { expect, test } from '@playwright/test'

test('shows the ArchGuard shell', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/')
  await expect(page.getByRole('heading', { name: 'ArchGuard' })).toBeVisible()
})

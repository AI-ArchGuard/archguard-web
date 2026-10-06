import { expect, test } from '@playwright/test'

const synthetic = 'synthetic-test-only-credential'
const absent = { configured: false, credentialVersion: null, updatedAt: null }
const saved = { configured: true, credentialVersion: '11111111-1111-4111-8111-111111111111', updatedAt: '2026-10-06T00:00:00Z' }

test('adds, replaces and explicitly deletes without browser persistence or model requests', async ({ page }) => {
  let configured = false, writes = 0, deletes = 0, modelRequests = 0
  await page.addInitScript(() => sessionStorage.setItem('oidc.user:/auth/realms/archguard:archguard-web', JSON.stringify({
    access_token: 'synthetic-test-token', token_type: 'Bearer', profile: { sub: 'owner' }, expires_at: Math.floor(Date.now() / 1000) + 3600,
  })))
  await page.route(/\/api\/v1\//, async route => {
    const path = new URL(route.request().url()).pathname
    if (path.includes('/agent/requests')) modelRequests++
    if (path === '/api/v1/agent/credentials/deepseek') {
      const method = route.request().method()
      if (method === 'PUT') {
        expect(route.request().postDataJSON()).toEqual({ apiKey: synthetic })
        expect(route.request().headers().origin).toBe('http://127.0.0.1:5173')
        configured = true; writes++
      }
      if (method === 'DELETE') { expect(route.request().postData()).toBeNull(); configured = false; deletes++ }
      await route.fulfill({ status: 200, headers: { 'Cache-Control': 'no-store' }, json: configured ? saved : absent }); return
    }
    await route.fulfill({ status: 200, json: { items: [] } })
  })
  await page.goto('/settings/model-credentials')
  await expect(page.getByText('未配置', { exact: true })).toBeVisible()
  const input = page.getByLabel('新的 DeepSeek API Key')
  await expect(input).toHaveAttribute('type', 'password')
  await input.fill(synthetic); await page.getByRole('button', { name: '加密保存 Key' }).click()
  await expect(page.getByText('已配置（有效性未验证）')).toBeVisible(); await expect(input).toHaveValue('')
  await input.fill(synthetic); await page.getByRole('button', { name: '加密保存并替换' }).click()
  await expect(input).toHaveValue('')
  await expect(page.getByText('已加密保存；未验证 Key 有效性，也未开启模型调用。')).toBeVisible()
  expect(writes).toBe(2)
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain(synthetic)
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: '删除本地 Key' }).click()
  await expect(page.getByText('未配置', { exact: true })).toBeVisible()
  await expect(page.getByText(/如需撤销，请到 DeepSeek 控制台操作/)).toBeVisible()
  expect(deletes).toBe(1); expect(modelRequests).toBe(0)
  await input.fill(synthetic); await page.getByRole('link', { name: 'AG ArchGuard' }).click()
  await page.getByRole('link', { name: '模型凭据' }).click(); await expect(input).toHaveValue('')
})

test('does not display untrusted errors or retry a failed write', async ({ page }) => {
  let writes = 0
  await page.addInitScript(() => sessionStorage.setItem('oidc.user:/auth/realms/archguard:archguard-web', JSON.stringify({
    access_token: 'synthetic-test-token', token_type: 'Bearer', profile: { sub: 'owner' }, expires_at: Math.floor(Date.now() / 1000) + 3600,
  })))
  await page.route('**/api/v1/agent/credentials/deepseek', async route => {
    if (route.request().method() === 'PUT') {
      writes++; await route.fulfill({ status: 503, json: { message: synthetic, rejectedValue: synthetic } }); return
    }
    await route.fulfill({ status: 200, json: absent })
  })
  await page.goto('/settings/model-credentials')
  await page.getByLabel('新的 DeepSeek API Key').fill(synthetic)
  await page.getByRole('button', { name: '加密保存 Key' }).click()
  await expect(page.getByRole('alert')).toContainText('凭据管理已关闭或安全配置不可用')
  await expect(page.getByText(synthetic, { exact: false })).toHaveCount(0)
  await expect(page.getByLabel('新的 DeepSeek API Key')).toHaveCount(0)
  await page.getByRole('button', { name: '手动刷新状态' }).click()
  await expect(page.getByLabel('新的 DeepSeek API Key')).toHaveValue('')
  expect(writes).toBe(1)
})

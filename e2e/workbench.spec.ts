// 工作台浏览器回归只使用本地合成响应：主题和导航不得触发业务写入或模型调用。
import { expect, test, type Page } from '@playwright/test'

async function enterWorkspace(page: Page) {
  const writes: string[] = []
  await page.addInitScript(() => sessionStorage.setItem('oidc.user:/auth/realms/archguard:archguard-web', JSON.stringify({
    access_token: 'synthetic-workbench-token', token_type: 'Bearer',
    profile: { sub: 'synthetic-owner', preferred_username: 'agent-owner' }, expires_at: Math.floor(Date.now() / 1000) + 3600,
  })))
  await page.route(/\/api\/v1\//, async route => {
    if (route.request().method() !== 'GET') writes.push(new URL(route.request().url()).pathname)
    const path = new URL(route.request().url()).pathname
    if (path === '/api/v1/projects') await route.fulfill({ json: { items: [{
      id: 'synthetic-project', key: 'architecture-platform-with-a-long-project-identifier', name: '架构治理 · 合成项目', version: 1,
    }] } })
    else if (path === '/api/v1/projects/synthetic-project') await route.fulfill({ json: {
      id: 'synthetic-project', key: 'synthetic-project', name: '架构治理 · 合成项目', version: 1,
    } })
    else if (path.endsWith('/repositories')) await route.fulfill({ json: Array.from({ length: 12 }, (_, index) => ({
      id: `synthetic-repository-${index}`, name: `合成仓库 ${index + 1}`, mountPath: `samples/repository-${index}`,
    })) })
    else if (path.endsWith('/scan-jobs')) await route.fulfill({ json: [{
      id: 'synthetic-scan', status: 'SUCCEEDED', outcome: 'PASS', createdAt: '2026-10-01T00:00:00Z',
    }] })
    else await route.fulfill({ status: 404, json: { code: 'not_found', message: 'Synthetic fixture only', details: {} } })
  })
  await page.goto('/projects')
  await expect(page.getByRole('link', { name: /架构治理 · 合成项目/ })).toBeVisible()
  return writes
}

test('switches monochrome themes, follows the system and restores the explicit preference without writes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  const writes = await enterWorkspace(page)
  await expect(page.getByRole('navigation', { name: '工作区导航' })).toBeVisible()
  await page.getByRole('button', { name: '深色', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  // 检查真正绘制的背景和文字，而非仅检查主题属性；正文保持可读的黑白反差。
  const dark = await page.locator('body').evaluate(element => {
    const css = getComputedStyle(element)
    return { background: css.backgroundColor, color: css.color }
  })
  const channels = (value: string) => value.match(/\d+/g)!.slice(0, 3).map(Number)
  const background = channels(dark.background), foreground = channels(dark.color)
  expect(background[0]).toBe(background[1]); expect(background[1]).toBe(background[2])
  expect(background[0]).toBeLessThan(40); expect(foreground[0]).toBeGreaterThan(200)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: '浅色', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: '跟随系统', exact: true }).click()
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.evaluate(() => localStorage.getItem('archguard.theme'))).toBe('system')
  expect(writes).toEqual([])
})

test('keeps the sidebar controls reachable in a short desktop window', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 360 })
  const writes = await enterWorkspace(page)
  const theme = page.getByRole('button', { name: '深色', exact: true })
  await theme.scrollIntoViewIfNeeded()
  await expect(theme).toBeInViewport()
  await theme.click()
  const logout = page.getByRole('button', { name: '退出', exact: true })
  await logout.scrollIntoViewIfNeeded()
  await expect(logout).toBeInViewport()
  expect(writes).toEqual([])
})

test('moves scan navigation to the loaded section, including a direct fragment link', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 })
  const writes = await enterWorkspace(page)
  await page.getByRole('link', { name: /架构治理 · 合成项目/ }).click()
  await expect(page.getByRole('heading', { name: 'Repositories', exact: true })).toBeVisible()
  await page.getByRole('link', { name: '扫描', exact: true }).click()
  await expect(page).toHaveURL(/#scans$/)
  const scanHeading = page.getByRole('heading', { name: '扫描历史', exact: true })
  await expect(scanHeading).toBeInViewport()
  // 同一锚点的再次显式导航也要定位，不依赖 hash 字符串发生变化。
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(scanHeading).not.toBeInViewport()
  await page.getByRole('link', { name: '扫描', exact: true }).click()
  await expect(scanHeading).toBeInViewport()
  await page.goto('/projects/synthetic-project#scans')
  await expect(scanHeading).toBeInViewport()
  expect(writes).toEqual([])
})

test('keeps the 320px workspace usable and isolates mobile navigation until explicitly opened', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  const writes = await enterWorkspace(page)
  const sidebar = page.locator('.workbench-sidebar'), content = page.locator('.workbench-main')
  const menu = page.getByRole('button', { name: '打开导航' })
  await expect(sidebar).toHaveAttribute('inert', '')
  await expect(menu).toBeVisible()
  const sizes = await page.evaluate(() => ({ width: window.innerWidth, content: document.documentElement.scrollWidth }))
  expect(sizes.width).toBe(320); expect(sizes.content).toBeLessThanOrEqual(320)
  await menu.click()
  await expect(content).toHaveAttribute('inert', '')
  await expect(page.getByRole('navigation', { name: '工作区导航' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sidebar).toHaveAttribute('inert', '')
  await expect(content).not.toHaveAttribute('inert')
  await expect(menu).toBeFocused()
  await menu.click()
  await page.getByRole('button', { name: '深色', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  // 新建内容按需展开；折叠不丢失未提交的普通表单输入。
  await page.getByText('新建 Project', { exact: true }).click()
  await page.getByLabel('标识', { exact: true }).fill('draft-project')
  await page.getByText('新建 Project', { exact: true }).click()
  await page.getByText('新建 Project', { exact: true }).click()
  await expect(page.getByLabel('标识', { exact: true })).toHaveValue('draft-project')
  await page.screenshot({ path: '.superpowers/sdd/2026-10-29-monochrome-workbench/artifacts/mobile-320.png', fullPage: true })
  expect(writes).toEqual([])
})

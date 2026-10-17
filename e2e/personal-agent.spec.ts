import { expect, test, type Page } from '@playwright/test'
import type { AgentRequest } from '../src/api/agent'
import type { PersonalBatchExecution, PersonalPurpose } from '../src/api/personalAgent'

// Entirely synthetic HTTP fixtures. No supplier, runtime Secret or real acceptance is used here.
const ids = {
  project: '10000000-0000-4000-8000-000000000001', owner: '20000000-0000-4000-8000-000000000001',
  approval: '30000000-0000-4000-8000-000000000001', credential: '40000000-0000-4000-8000-000000000001',
  batch: '50000000-0000-4000-8000-000000000001', explanation: '60000000-0000-4000-8000-000000000001',
  summary: '60000000-0000-4000-8000-000000000002', first: '70000000-0000-4000-8000-000000000001',
  second: '70000000-0000-4000-8000-000000000002', scan: '80000000-0000-4000-8000-000000000001',
  finding: '80000000-0000-4000-8000-000000000002', evidence: '80000000-0000-4000-8000-000000000003',
  revision: '80000000-0000-4000-8000-000000000004', document: '90000000-0000-4000-8000-000000000001',
}
const price = 'deepseek-flash-context-peak-usd-2026-10-15'
const purposes: PersonalPurpose[] = ['FINDING_EXPLANATION', 'PR_SUMMARY']
const report = 'a'.repeat(64), documentSha = 'b'.repeat(64)
const documentContent = 'Synthetic uploaded architecture guidance; documents are data, not instructions.'
type Mode = 'success' | 'failed' | 'unknown' | 'unknown-success'

async function syntheticEnvironment(page: Page, mode: Mode = 'success') {
  const now = new Date().toISOString(), expires = new Date(Date.now() + 6 * 3600_000).toISOString()
  const state = { posts: [] as { body: unknown; key: string }[], otherWrites: [] as string[], vendorRequests: 0, denied: false,
    citationDeniedStatus: 0 as 0 | 401 | 403 | 404 }
  const records = new Map<PersonalPurpose, AgentRequest>()
  const batch = { id: ids.batch, projectId: ids.project, enablementId: ids.approval, approvedBy: ids.owner,
    approvedAt: now, expiresAt: expires, manifestSha256: 'd'.repeat(64), maxRequests: 2 as const, maxCostMicrousd: 700000, revoked: false }

  function template(purpose: PersonalPurpose): AgentRequest {
    const explanation = purpose === 'FINDING_EXPLANATION'
    return { id: explanation ? ids.explanation : ids.summary, projectId: ids.project, requesterId: ids.owner,
      traceId: 'e'.repeat(32), purpose, state: 'FAILED', createdAt: now, updatedAt: now,
      bindings: { scanJobId: ids.scan, reportSha256: report, prHeadRevisionId: explanation ? null : ids.revision,
        findingIds: [ids.finding], documentVersions: [{ documentVersionId: ids.document, contentSha256: documentSha }],
        promptVersion: explanation ? 'finding-explanation-0.1.0' : 'pr-summary-0.1.0',
        modelProfileVersion: 'disabled-or-test-fake-0.1.0', modelProtocolVersion: 'responses-v1-restricted',
        modelId: 'deterministic-fake-or-disabled', outputSchemaVersion: '0.1.0', priceCatalogVersion: 'synthetic-0.1.0', inputDigest: 'f'.repeat(64) },
      result: null, failure: { code: 'MODEL_DISABLED', message: 'Synthetic immutable template only' }, usage: null }
  }
  function live(purpose: PersonalPurpose): AgentRequest {
    const source = template(purpose), explanation = purpose === 'FINDING_EXPLANATION', success = mode === 'success' || mode === 'unknown-success'
    return { ...source, id: explanation ? ids.first : ids.second, traceId: explanation ? '1'.repeat(32) : '2'.repeat(32),
      state: success ? 'SUCCEEDED' : 'FAILED',
      bindings: { ...source.bindings, promptVersion: explanation ? 'finding-explanation-deepseek-0.1.0' : 'pr-summary-deepseek-0.1.0',
        modelProfileVersion: 'deepseek-personal-0.2.0', modelId: 'deepseek-flash', priceCatalogVersion: price },
      failure: success ? null : { code: mode === 'unknown' ? 'MODEL_TIMEOUT' : 'CITATION_INVALID', message: 'synthetic-private-provider-body' },
      result: success ? { conclusion: explanation ? '合成解释建议（假 HTTP）' : '合成摘要建议（假 HTTP）',
        ruleBasis: ['Synthetic dependency rule'], claims: ['Only the explicitly selected synthetic Finding is covered.'],
        suggestions: [{ kind: 'HUMAN_VERIFICATION', text: 'Review the selected dependency manually.', requiresHumanReview: true }],
        evidenceCoverage: 'COMPLETE', citations: [
          { citationId: 'e-1', source: 'SCANNER_EVIDENCE', label: 'Synthetic selected evidence', projectId: ids.project,
            scanJobId: ids.scan, reportSha256: report, evidenceId: ids.evidence, documentVersionId: null,
            contentSha256: null, fragmentIndex: null, fragmentSha256: null },
          { citationId: 'd-1', source: 'PROJECT_DOCUMENT', label: 'Synthetic architecture version', projectId: ids.project,
            scanJobId: null, reportSha256: null, evidenceId: null, documentVersionId: ids.document,
            contentSha256: documentSha, fragmentIndex: 0, fragmentSha256: 'c'.repeat(64) },
        ] } : null,
      usage: { inputTokens: 1000, outputTokens: 100, latencyMs: 200, providerLatencyMs: 100,
        estimatedCostMicrousd: 316373, actualCostMicrousd: mode === 'unknown' ? null : 273,
        providerResponseId: mode === 'unknown' ? null : `resp_synthetic_${explanation ? '1' : '2'}`, actualModelId: mode === 'unknown' ? null : 'deepseek-flash' } }
  }
  function execution(): PersonalBatchExecution {
    const unknown = mode === 'unknown' && records.size > 0
    const first = records.get('FINDING_EXPLANATION')
    return { schemaVersion: '0.1.0', observedAt: now, batch, costPolicyVersion: price,
      accounting: { attemptCount: records.size, reservedMicrousd: unknown ? 316373 : 0, spentMicrousd: unknown ? 0 : records.size * 273 },
      stop: first?.state === 'FAILED' ? { requestId: first.id, code: mode === 'unknown' ? 'MODEL_TIMEOUT' : 'CITATION_INVALID', stoppedAt: now } : null,
      templates: purposes.map((purpose, index) => {
        const value = records.get(purpose)
        return { templateRequestId: index === 0 ? ids.explanation : ids.summary, purpose,
          request: value ? { id: value.id, state: value.state, failureCode: value.failure?.code ?? null, traceId: value.traceId, createdAt: now, updatedAt: now } : null,
          attempt: value ? { attemptId: index === 0 ? ids.explanation : ids.summary, utcDay: now.slice(0, 10),
            priceCatalogVersion: price, reservedMicrousd: 316373, createdAt: now,
            outcome: { state: unknown ? 'UNKNOWN' : 'SETTLED', actualMicrousd: unknown ? null : 273,
              usage: unknown ? null : { inputTokens: 1000, outputTokens: 100, cachedInputTokens: 500, totalTokens: 1100, reasoningTokens: 0 }, recordedAt: now } } : null }
      }) }
  }
  await page.addInitScript(owner => sessionStorage.setItem('oidc.user:/auth/realms/archguard:archguard-web', JSON.stringify({
    access_token: 'synthetic-browser-test-token', token_type: 'Bearer', profile: { sub: owner },
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  })), ids.owner)
  await page.route('https://api.deepseek.com/**', async route => { state.vendorRequests++; await route.abort() })
  await page.route(/\/api\/v1\//, async route => {
    const path = new URL(route.request().url()).pathname, method = route.request().method()
    const root = `/api/v1/projects/${ids.project}`
    if (state.denied) { await route.fulfill({ status: 403, json: { message: 'synthetic-private-provider-body' } }); return }
    if (path === `${root}/documents/versions/${ids.document}` && method === 'GET' && state.citationDeniedStatus) {
      await route.fulfill({ status: state.citationDeniedStatus, json: { message: 'synthetic-private-provider-body' } }); return
    }
    if (path === `${root}/agent/live-requests` && method === 'POST') {
      const body = route.request().postDataJSON()
      state.posts.push({ body, key: route.request().headers()['idempotency-key'] })
      expect(Object.keys(body).sort()).toEqual(['batchId', 'templateRequestId'])
      expect(body.batchId).toBe(ids.batch)
      const purpose = body.templateRequestId === ids.explanation ? 'FINDING_EXPLANATION' : 'PR_SUMMARY'
      expect(body.templateRequestId).toBe(purpose === 'FINDING_EXPLANATION' ? ids.explanation : ids.summary)
      expect(records.has(purpose)).toBe(false)
      if (purpose === 'PR_SUMMARY') expect(records.get('FINDING_EXPLANATION')?.state).toBe('SUCCEEDED')
      const value = live(purpose); records.set(purpose, value)
      if (mode === 'unknown' || mode === 'unknown-success') { await route.abort('failed'); return }
      await route.fulfill({ status: 202, headers: { 'Cache-Control': 'no-store' }, json: { ...value, state: 'QUEUED', result: null, failure: null, usage: null } }); return
    }
    if (method !== 'GET') {
      state.otherWrites.push(path)
      await route.fulfill({ status: 400, json: { message: 'Unexpected synthetic write' } }); return
    }
    let data: unknown
    const headers: Record<string, string> = { 'Cache-Control': 'no-store' }
    if (path === '/api/v1/agent/credentials/deepseek') data = { configured: true, credentialVersion: ids.credential, updatedAt: now }
    else if (path === `${root}/members`) data = { items: [{ actorId: ids.owner, role: 'MAINTAINER', createdAt: now }], page: 0, size: 100, total: 1 }
    else if (path === `${root}/agent/settings`) {
      data = { enabled: true, revision: 3, enablementId: ids.approval, modelCallsAvailable: true, unavailableReason: null }; headers.ETag = '"3"'
    } else if (path === `${root}/agent/enablements/${ids.approval}`) data = { id: ids.approval, projectId: ids.project,
      approvedBy: ids.owner, approvedAt: now, expiresAt: expires, credentialVersion: ids.credential, modelAlias: 'deepseek-flash',
      priceCatalogVersion: price, priceCatalogExpiresAt: expires, dataScope: 'SYNTHETIC_ACCEPTANCE', revoked: false, revokedAt: null }
    else if (path === `${root}/agent/batches/${ids.batch}`) data = batch
    else if (path === `${root}/agent/batches/${ids.batch}/execution`) data = execution()
    else if (path === `${root}/agent/requests/${ids.explanation}`) data = template('FINDING_EXPLANATION')
    else if (path === `${root}/agent/requests/${ids.summary}`) data = template('PR_SUMMARY')
    else if (path === `${root}/agent/requests/${ids.first}`) data = records.get('FINDING_EXPLANATION')
    else if (path === `${root}/agent/requests/${ids.second}`) data = records.get('PR_SUMMARY')
    else if (path === `${root}/documents/versions/${ids.document}`) data = { id: ids.document, documentId: ids.approval, projectId: ids.project,
      documentKey: 'synthetic-architecture', versionNumber: 1, content: documentContent, contentSha256: documentSha,
      mediaType: 'text/plain', byteSize: documentContent.length, fragmentCount: 1, createdBy: ids.owner, createdAt: now }
    else if (path === `${root}/scan-jobs/${ids.scan}/evidences/${ids.evidence}`) data = { id: ids.evidence, projectId: ids.project,
      jobId: ids.scan, kind: 'DEPENDENCY', summary: 'Synthetic authorized evidence', location: { path: 'synthetic/Example.java', startLine: 1 } }
    else { await route.fulfill({ status: 404, json: { code: 'not_found', message: 'Synthetic resource unavailable' } }); return }
    await route.fulfill({ status: 200, headers, json: data })
  })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === 'http://127.0.0.1:5173') {
      await route.fallback()
      return
    }
    state.vendorRequests++
    await route.abort()
  })
  return state
}

async function openBatch(page: Page) {
  await page.goto(`/projects/${ids.project}/agent/personal`)
  await page.getByLabel('已有批次 ID', { exact: true }).fill(ids.batch)
  await page.getByRole('button', { name: '读取已有批次', exact: true }).click()
}
const explanation = (page: Page) => page.getByRole('button', { name: /调用 DeepSeek 官方 API.*合成解释/ })
const summary = (page: Page) => page.getByRole('button', { name: /调用 DeepSeek 官方 API.*合成摘要/ })

test('explicit serial explanation and summary restore exact history without browser or synthetic-endpoint egress', async ({ page }) => {
  const state = await syntheticEnvironment(page)
  await openBatch(page)
  await expect(explanation(page)).toBeEnabled(); await expect(summary(page)).toBeDisabled()
  expect(state.posts).toHaveLength(0)
  await explanation(page).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click() })
  await expect(page.getByText('合成解释建议（假 HTTP）', { exact: true })).toBeVisible()
  expect(state.posts).toHaveLength(1)
  await page.getByRole('button', { name: /核对文档版本/ }).click()
  await expect(page.getByText(documentContent, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /核对 Evidence/ }).click()
  await expect(page.getByText(/Synthetic authorized evidence/)).toBeVisible()
  await expect(summary(page)).toBeEnabled(); await summary(page).click()
  await expect(page.getByText('合成摘要建议（假 HTTP）', { exact: true })).toBeVisible()
  expect(state.posts).toHaveLength(2)
  expect(state.posts.map(item => item.key)).toEqual([`personal:${ids.batch}:${ids.explanation}`, `personal:${ids.batch}:${ids.summary}`])
  expect(state.otherWrites).toHaveLength(0); expect(state.vendorRequests).toBe(0)
  await openBatch(page)
  await expect(page.getByText('合成解释建议（假 HTTP）', { exact: true })).toBeVisible()
  await expect(page.getByText('合成摘要建议（假 HTTP）', { exact: true })).toBeVisible()
  await expect(explanation(page)).toBeDisabled(); await expect(summary(page)).toBeDisabled()
  expect(state.posts).toHaveLength(2)
  expect(state.otherWrites).toHaveLength(0); expect(state.vendorRequests).toBe(0)
})

test('browser fixture blocks all external provider and unrelated origins before requests can escape', async ({ page }) => {
  let safetyNetEscapes = 0
  await page.context().route('**/*', async route => {
    const origin = new URL(route.request().url()).origin
    if (origin === 'http://127.0.0.1:5173') { await route.continue(); return }
    safetyNetEscapes++
    await route.abort()
  })

  const state = await syntheticEnvironment(page)
  await page.goto(`/projects/${ids.project}/agent/personal`)
  await page.evaluate(async urls => {
    await Promise.all(urls.map(url => fetch(url, {
      method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer',
    }).catch(() => undefined)))
  }, [
    'https://api.deepseek.com/synthetic-egress-probe',
    'https://api-docs.deepseek.com/',
    'https://cdn.deepseek.com/',
    'https://external-egress.invalid/',
  ])

  expect(state.vendorRequests).toBe(4)
  expect(state.otherWrites).toHaveLength(0)
  expect(safetyNetEscapes).toBe(0)
})

test('failed validation shows no raw output and never enables the summary or replacement', async ({ page }) => {
  const state = await syntheticEnvironment(page, 'failed')
  await openBatch(page); await expect(explanation(page)).toBeEnabled(); await explanation(page).click()
  await expect(page.getByText(/引用未通过验证/)).toBeVisible()
  await expect(summary(page)).toBeDisabled(); await expect(explanation(page)).toBeDisabled()
  await expect(page.getByText('synthetic-private-provider-body', { exact: false })).toHaveCount(0)
  await openBatch(page)
  await expect(page.getByText(/引用未通过验证/)).toBeVisible()
  await expect(page.getByText(/批次尝试 1；保留费用 USD 0\.000000；\s*已结算费用 USD 0\.000273/)).toBeVisible()
  await expect(page.getByRole('button', { name: '手动恢复批次与现有结果', exact: true })).toBeEnabled()
  await expect(explanation(page)).toBeDisabled(); await expect(summary(page)).toBeDisabled()
  expect(state.posts).toHaveLength(1); expect(state.otherWrites).toHaveLength(0); expect(state.vendorRequests).toBe(0)
})

test('a lost submit response permits read-only recovery and revoked access clears restored advice', async ({ page }) => {
  const state = await syntheticEnvironment(page, 'unknown')
  await openBatch(page); await expect(explanation(page)).toBeEnabled(); await explanation(page).click()
  await expect(page.getByText(/提交结果尚未确认/)).toBeVisible()
  await expect(explanation(page)).toBeDisabled(); await expect(summary(page)).toBeDisabled()
  await openBatch(page)
  await expect(page.getByText(/模型调用超时/)).toBeVisible()
  await expect(page.getByText(/批次尝试 1；保留费用 USD 0\.316373；\s*已结算费用 USD 0\.000000/)).toBeVisible()
  await expect(page.getByRole('button', { name: '手动恢复批次与现有结果', exact: true })).toBeEnabled()
  await expect(explanation(page)).toBeDisabled(); await expect(summary(page)).toBeDisabled()
  expect(state.posts).toHaveLength(1)
  state.denied = true
  await page.getByRole('button', { name: '手动恢复批次与现有结果', exact: true }).click()
  await expect(page.getByText(/权限已失效|无权访问此 Project/)).toBeVisible()
  await expect(page.getByRole('button', { name: '关闭 Project 模型入口', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '读取已有批次', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('启用确认 ID', { exact: true })).toHaveCount(0)
  await expect(page.getByText('synthetic-private-provider-body', { exact: false })).toHaveCount(0)
  expect(state.posts).toHaveLength(1); expect(state.otherWrites).toHaveLength(0); expect(state.vendorRequests).toBe(0)
})

for (const status of [401, 403, 404] as const) {
  test(`citation denial ${status} clears all restored personal metadata after an unknown successful submit`, async ({ page }) => {
    const state = await syntheticEnvironment(page, 'unknown-success')
    await openBatch(page); await expect(explanation(page)).toBeEnabled(); await explanation(page).click()
    await expect(page.getByText(/提交结果尚未确认/)).toBeVisible()
    expect(state.posts).toHaveLength(1)
    await openBatch(page)
    await expect(page.getByText('合成解释建议（假 HTTP）', { exact: true })).toBeVisible()
    await expect(page.getByText(/批次尝试 1；保留费用 USD 0\.000000；\s*已结算费用 USD 0\.000273/)).toBeVisible()
    await expect(page.getByRole('button', { name: '手动恢复批次与现有结果', exact: true })).toBeEnabled()
    await expect(explanation(page)).toBeDisabled(); await expect(summary(page)).toBeDisabled()
    await expect(page.getByText(`凭据版本 ${ids.credential}`, { exact: true })).toBeVisible()
    await expect(page.getByText(`风险确认 ${ids.approval}`, { exact: true })).toBeVisible()
    await expect(page.getByText(`当前批次 ${ids.batch}`, { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '关闭 Project 模型入口', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: /核对 Evidence/ }).click()
    await expect(page.getByText(/Synthetic authorized evidence/)).toBeVisible()
    state.citationDeniedStatus = status
    await page.getByRole('button', { name: /核对文档版本/ }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Project 权限已失效，历史结果已清除' })).toBeVisible()
    await expect(page.getByText('合成解释建议（假 HTTP）', { exact: true })).toHaveCount(0)
    await expect(page.getByText(/Synthetic authorized evidence/)).toHaveCount(0)
    await expect(page.getByText(documentContent, { exact: true })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Agent 建议状态' })).toHaveCount(0)
    await expect(page.getByText(/凭据版本|风险确认 [0-9a-f]|当前批次|Project 模型入口：|批次尝试/)).toHaveCount(0)
    await expect(page.getByRole('link', { name: '管理已加密的 API Key', exact: true })).toHaveCount(0)
    await expect(page.getByLabel('启用确认 ID', { exact: true })).toHaveCount(0)
    await expect(page.getByLabel('已有批次 ID', { exact: true })).toHaveCount(0)
    for (const name of ['关闭 Project 模型入口', '撤销此风险确认', '撤销此批次（不退款或补发）',
      '读取已有批次', '批准这两次合成批次（尚不发送）', '手动恢复批次与现有结果']) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
    }
    await expect(explanation(page)).toHaveCount(0); await expect(summary(page)).toHaveCount(0)
    await expect(page.getByText('synthetic-private-provider-body', { exact: false })).toHaveCount(0)
    expect(state.posts).toHaveLength(1)
    expect(state.otherWrites).toHaveLength(0); expect(state.vendorRequests).toBe(0)
  })
}

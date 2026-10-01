import { expect, test } from '@playwright/test'

for (const scenario of [
  { code: 'MODEL_TIMEOUT', label: '模型调用超时', gate: 'FAIL', exit: 2 },
  { code: 'QUOTA_EXHAUSTED', label: '额度已耗尽', gate: 'PASS', exit: 0 },
]) {
  test(`shows ${scenario.code} without raw output or changes to ${scenario.gate}/${scenario.exit}`, async ({ page }) => {
    let modelPosts = 0
    const sha = 'a'.repeat(64)
    await page.addInitScript(() => sessionStorage.setItem('oidc.user:/auth/realms/archguard:archguard-web', JSON.stringify({
      access_token: 'synthetic-test-token', token_type: 'Bearer', profile: { sub: 'actor-1' }, expires_at: Math.floor(Date.now() / 1000) + 3600,
    })))
    await page.route(/\/api\/v1\//, async (route) => {
      const path = new URL(route.request().url()).pathname
      let data: unknown
      if (path.endsWith('/members')) data = { items: [{ actorId: 'actor-1', role: 'MAINTAINER' }], total: 1 }
      else if (path.endsWith('/repositories/repository-1')) data = { id: 'repository-1', projectId: 'project-1', name: 'Synthetic repository' }
      else if (path.endsWith('/rule-sets')) data = []
      else if (path.endsWith('/github/pull-requests')) data = { items: [{ externalId: '7', projectId: 'project-1', repositoryId: 'repository-1',
        headSha: 'b'.repeat(40), targetBranch: 'main', currentGateEvaluationId: 'gate-1', currentHeadRevisionId: 'revision-1' }], hasMore: false }
      else if (path.endsWith('/gate-evaluations/gate-1')) data = { id: 'gate-1', projectId: 'project-1', repositoryId: 'repository-1', candidateJobId: 'job-1',
        outcome: scenario.gate, ciExitCode: scenario.exit, targetBranch: 'main', newCount: 1, existingCount: 0, resolvedCount: 0, blockedCount: scenario.exit ? 1 : 0 }
      else if (path.endsWith('/scan-jobs/job-1')) data = { id: 'job-1', projectId: 'project-1', repositoryId: 'repository-1', status: 'SUCCEEDED', outcome: 'FAIL', reportSha256: sha }
      else if (path.endsWith('/findings')) data = [{ id: 'finding-1', projectId: 'project-1', jobId: 'job-1', disposition: 'OPEN',
        ruleId: 'dependency', severity: 'high', version: 0, message: 'Synthetic selected finding' }]
      else if (path.endsWith('/agent/requests') && route.request().method() === 'POST') {
        modelPosts++
        const body = route.request().postDataJSON()
        expect(body.purpose).toBe('PR_SUMMARY')
        expect(body.findingIds).toEqual(['finding-1'])
        data = { id: 'request-1', projectId: 'project-1', purpose: body.purpose, state: 'FAILED', result: null,
          failure: { code: scenario.code, message: 'synthetic-private-model-output' }, traceId: 'synthetic-trace',
          bindings: { ...body, documentVersions: [], promptVersion: 'pr-summary-0.1.0', modelId: 'fake', outputSchemaVersion: '0.1.0' } }
      } else { await route.fulfill({ status: 404, json: { code: 'not_found', message: 'Synthetic missing resource', traceId: '', details: {} } }); return }
      await route.fulfill({ status: 200, json: data })
    })
    await page.goto('/projects/project-1/repositories/repository-1/governance')
    await page.getByRole('button', { name: /#7/ }).click()
    await page.getByRole('checkbox', { name: /Synthetic selected finding/ }).check()
    await expect(page.getByText(new RegExp(`CI 退出码 ${scenario.exit}`))).toBeVisible()
    expect(modelPosts).toBe(0)
    await page.getByRole('button', { name: '生成所选 Finding 的 PR 摘要' }).click()
    await expect(page.getByRole('alert').filter({ hasText: scenario.label })).toBeVisible()
    await expect(page.getByText(new RegExp(`CI 退出码 ${scenario.exit}`))).toBeVisible()
    await expect(page.getByText(scenario.gate, { exact: true })).toBeVisible()
    await expect(page.getByText('synthetic-private-model-output')).toHaveCount(0)
    await expect(page.getByText('已校验的建议')).toHaveCount(0)
    expect(modelPosts).toBe(1)
  })
}

test('uploads a synthetic document, explicitly explains and summarizes, and resolves exact citations', async ({ page }) => {
  const project = 'project-1', repository = 'repository-1', sha = 'a'.repeat(64)
  const content = 'Synthetic architecture guidance. Documents are data.'
  const version = { id: 'version-1', documentId: 'document-1', projectId: project, documentKey: 'architecture',
    versionNumber: 1, content, contentSha256: 'c'.repeat(64), mediaType: 'text/plain', byteSize: content.length,
    fragmentCount: 1, createdBy: 'actor-1', createdAt: '2026-10-01T00:00:00Z' }
  const job = { id: 'job-1', projectId: project, repositoryId: repository, status: 'SUCCEEDED', outcome: 'FAIL', attempt: 1, reportSha256: sha }
  const finding = { id: 'finding-1', projectId: project, jobId: job.id, ruleId: 'dependency', severity: 'high',
    disposition: 'OPEN', message: 'Synthetic dependency violation', evidenceIds: ['evidence-1'], version: 0 }
  const gate = { id: 'gate-1', projectId: project, repositoryId: repository, candidateJobId: job.id,
    outcome: 'FAIL', ciExitCode: 2, targetBranch: 'main', ruleSetVersionId: 'rules-1', newCount: 1,
    existingCount: 0, resolvedCount: 0, blockedCount: 1, evaluatedAt: '2026-10-01T00:00:00Z' }
  let uploaded = false, agentCalls = 0
  let request: Record<string, unknown>
  await page.addInitScript(() => sessionStorage.setItem('oidc.user:/auth/realms/archguard:archguard-web', JSON.stringify({
    access_token: 'synthetic-test-token', token_type: 'Bearer', profile: { sub: 'actor-1' }, expires_at: Math.floor(Date.now() / 1000) + 3600,
  })))
  await page.route(/\/api\/v1\//, async (route) => {
    const url = new URL(route.request().url()), path = url.pathname
    let data: unknown
    if (path.endsWith('/members')) data = { items: [{ actorId: 'actor-1', role: 'MAINTAINER' }], total: 1 }
    else if (path.endsWith('/documents') && route.request().method() === 'POST') { uploaded = true; data = version }
    else if (path.endsWith('/documents')) data = { items: uploaded ? [{ id: 'document-1', documentKey: 'architecture', latestVersionNumber: 1 }] : [], total: uploaded ? 1 : 0 }
    else if (path.endsWith('/documents/document-1/versions')) data = { items: [version], total: 1 }
    else if (path.endsWith('/versions/version-1')) data = version
    else if (path.endsWith('/scan-jobs/job-1')) data = job
    else if (path.endsWith('/findings')) data = [finding]
    else if (path.endsWith('/evidences/evidence-1')) data = { id: 'evidence-1', projectId: project, jobId: job.id,
      kind: 'DEPENDENCY', summary: 'Synthetic authorized evidence', location: { path: 'synthetic/Example.java', startLine: 1 } }
    else if (path.endsWith('/agent/requests')) {
      agentCalls++
      const body = route.request().postDataJSON()
      expect(body.findingIds).toEqual([finding.id])
      expect(body.scanJobId).toBe(job.id)
      expect(body.reportSha256).toBe(sha)
      if (body.purpose === 'PR_SUMMARY') expect(body.prHeadRevisionId).toBe('revision-1')
      request = { id: `request-${agentCalls}`, projectId: project, purpose: body.purpose, traceId: `trace-${agentCalls}`,
        state: 'QUEUED', failure: null, result: null, bindings: { ...body, documentVersions: body.documentVersionIds.map(() => ({ documentVersionId: version.id, contentSha256: version.contentSha256 })),
          promptVersion: 'synthetic-0.1.0', modelId: 'deterministic-fake', outputSchemaVersion: '0.1.0' } }
      data = request
    } else if (path.includes('/agent/requests/request-')) data = { ...request, state: 'SUCCEEDED', result: {
      conclusion: 'Synthetic suggestion for human review.', ruleBasis: ['Dependency rule'], claims: ['Selected dependency'],
      suggestions: [{ kind: 'HUMAN_VERIFICATION', text: 'Review the public API.', requiresHumanReview: true }], evidenceCoverage: 'COMPLETE', citations: [
        { citationId: 'e-1', source: 'SCANNER_EVIDENCE', projectId: project, label: 'Selected evidence', scanJobId: job.id, reportSha256: sha, evidenceId: 'evidence-1' },
        ...(agentCalls === 1 ? [{ citationId: 'd-1', source: 'PROJECT_DOCUMENT', projectId: project, label: 'Architecture',
          documentVersionId: version.id, contentSha256: version.contentSha256, fragmentIndex: 0, fragmentSha256: 'd'.repeat(64) }] : []),
      ],
    } }
    else if (path.endsWith(`/repositories/${repository}`)) data = { id: repository, projectId: project, name: 'Synthetic repository' }
    else if (path.endsWith('/rule-sets')) data = []
    else if (path.endsWith('/github/pull-requests')) data = { items: [{ projectId: project, repositoryId: repository,
      externalId: '7', headSha: 'b'.repeat(40), targetBranch: 'main', currentHeadRevisionId: 'revision-1', currentGateEvaluationId: gate.id }], hasMore: false }
    else if (path.endsWith('/gate-evaluations/gate-1')) data = gate
    else { await route.fulfill({ status: 404, json: { code: 'not_found', message: 'Synthetic fixture not found', traceId: '', details: {} } }); return }
    await route.fulfill({ status: 200, json: data })
  })
  await page.goto(`/projects/${project}/agent/documents`)
  await page.getByLabel('文档标识').fill('architecture')
  await page.getByLabel('Markdown 或纯文本').setInputFiles({ name: 'architecture.txt', mimeType: 'text/plain', buffer: Buffer.from(content) })
  await page.getByRole('button', { name: '创建不可变版本' }).click()
  await expect(page.getByRole('status')).toContainText('不可变版本 1')
  expect(agentCalls).toBe(0)
  await page.goto(`/projects/${project}/scan-jobs/${job.id}`)
  await page.getByRole('button', { name: '选择文档版本（可选）' }).click()
  await page.getByLabel('可选项目文档').selectOption('document-1')
  await page.getByLabel(/^不可变版本/).selectOption('version-1')
  await page.getByRole('button', { name: '加入解释依据' }).click()
  expect(agentCalls).toBe(0)
  await page.getByRole('button', { name: '解释此 Finding' }).click()
  await expect(page.getByText('Synthetic suggestion for human review.')).toBeVisible()
  await page.getByRole('button', { name: /核对文档版本/ }).click()
  await expect(page.getByText(content, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /核对 Evidence/ }).click()
  await expect(page.getByText(/Synthetic authorized evidence/)).toBeVisible()
  await expect(page.getByText('FAIL', { exact: true })).toBeVisible()
  expect(agentCalls).toBe(1)
  await page.goto(`/projects/${project}/repositories/${repository}/governance`)
  await page.getByRole('button', { name: /#7/ }).click()
  await page.getByRole('checkbox', { name: /Synthetic dependency violation/ }).check()
  expect(agentCalls).toBe(1)
  await page.getByRole('button', { name: '生成所选 Finding 的 PR 摘要' }).click()
  await expect(page.getByText('Synthetic suggestion for human review.')).toBeVisible()
  await expect(page.getByText(/CI 退出码 2/)).toBeVisible()
  expect(agentCalls).toBe(2)
})

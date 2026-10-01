import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, ApiClientError } from '../api/client'
import type { BaselineVersion, Comparison, GateEvaluation, GatePage, PolicyException, PrRevisionDelta, PullRequestPage } from '../api/governance'
import type { Repository, RuleSet, RuleSetVersion } from '../api/types'
import { Empty, Failure, Loading } from '../components/States'
import { useApi } from '../hooks/useApi'
import { PrSummary } from '../components/PrSummary'
import { agentEntryEnabled } from '../agentEntry'

const timestamp = (value: string) => new Date(value).toLocaleString()
const shortSha = (value: string) => value.slice(0, 12)

function QueryState({ loading, error, retry, empty, children }: { loading: boolean; error?: Error; retry: () => void; empty: boolean; children?: React.ReactNode }) {
  if (loading) return <Loading />
  if (error instanceof ApiClientError && (error.status === 403 || error.status === 404)) return <div className="state error">无权查看此 Project，或资源不存在。</div>
  if (error) return <Failure error={error} retry={retry} />
  if (empty) return <Empty>当前范围暂无记录。</Empty>
  return <>{children}</>
}

export function GovernancePage() {
  const { projectId = '', repositoryId = '' } = useParams()
  const root = `/api/v1/projects/${projectId}/repositories/${repositoryId}`
  const repository = useApi(() => api<Repository>(root), `repo:${root}`)
  const ruleSets = useApi(() => api<RuleSet[]>(`${root}/rule-sets`), `rule-sets:${root}`)
  const [ruleSetId, setRuleSetId] = useState('')
  const versions = useApi(() => ruleSetId ? api<RuleSetVersion[]>(`${root}/rule-sets/${ruleSetId}/versions`) : Promise.resolve([]), `versions:${root}:${ruleSetId}`)
  const [ruleSetVersionId, setRuleSetVersionId] = useState('')
  const [branchInput, setBranchInput] = useState('main')
  const [branch, setBranch] = useState('main')
  const [prPage, setPrPage] = useState(0)
  const [selectedPrId, setSelectedPrId] = useState('')
  const [gatePage, setGatePage] = useState(0)
  const [selectedGateId, setSelectedGateId] = useState('')
  const prs = useApi(() => api<PullRequestPage>(`${root}/github/pull-requests?page=${prPage}&size=10`), `prs:${root}:${prPage}`)
  const selectedPr = prs.data?.items.find((pr) => pr.externalId === selectedPrId)
  const currentGate = useApi(() => selectedPr?.currentGateEvaluationId
    ? api<GateEvaluation>(`${root}/gate-evaluations/${selectedPr.currentGateEvaluationId}`) : Promise.resolve(undefined),
  `current-gate:${root}:${selectedPr?.currentGateEvaluationId ?? ''}`)
  const scope = new URLSearchParams({ targetBranch: branch, ruleSetVersionId })
  const scoped = ruleSetVersionId.length > 0
  const revisionDelta = useApi(() => scoped && selectedPr?.targetBranch === branch
    ? api<PrRevisionDelta>(`${root}/github/pull-requests/${selectedPr.externalId}/revision-delta?${new URLSearchParams({ ruleSetVersionId })}`)
    : Promise.resolve(undefined), `revision-delta:${root}:${selectedPr?.externalId ?? ''}:${selectedPr?.headSha ?? ''}:${branch}:${ruleSetVersionId}`)
  const baseline = useApi(() => scoped ? api<BaselineVersion[]>(`${root}/baselines?${scope}`) : Promise.resolve([]), `baseline:${root}:${scope}`)
  const exceptions = useApi(() => scoped ? api<PolicyException[]>(`${root}/policy-exceptions?${scope}`) : Promise.resolve([]), `exceptions:${root}:${scope}`)
  const gateQuery = new URLSearchParams({ targetBranch: branch, ruleSetVersionId, page: String(gatePage), size: '10' })
  if (selectedPrId) gateQuery.set('pullRequestId', selectedPrId)
  const history = useApi(() => scoped ? api<GatePage>(`${root}/gate-evaluations?${gateQuery}`) : Promise.resolve(undefined),
    `history:${root}:${gateQuery}`)
  const selectedGate = history.data?.items.find((gate) => gate.id === selectedGateId) ?? currentGate.data
  const comparison = useApi(() => selectedGate?.comparisonId
    ? api<Comparison>(`${root}/comparisons/${selectedGate.comparisonId}`) : Promise.resolve(undefined),
  `comparison:${root}:${selectedGate?.comparisonId ?? ''}`)
  const maxNew = Math.max(1, ...(history.data?.items.map((gate) => gate.newCount) ?? []))

  if (repository.loading) return <main><Loading /></main>
  if (repository.error) return <main><QueryState loading={false} error={repository.error} retry={repository.reload} empty={false} /></main>
  return <main className="governance-page">
    <div className="page-head"><div><p className="eyebrow">持续治理 · {repository.data?.name}</p><h1>PR 与质量门禁</h1></div><Link to={`/projects/${projectId}`}>返回 Project</Link></div>
    <p className="muted">按目标分支和不可变规则版本查看基线、分类与趋势。仅当前 PR head 关联的门禁结果代表当前提交。</p>
    <section className="panel governance-filter"><h2>查看范围</h2><div className="filter-grid">
      <label>规则集<select value={ruleSetId} onChange={(event) => { setRuleSetId(event.target.value); setRuleSetVersionId(''); setSelectedGateId('') }}><option value="">请选择规则集</option>{ruleSets.data?.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}</select></label>
      <label>不可变规则版本<select value={ruleSetVersionId} onChange={(event) => { setRuleSetVersionId(event.target.value); setGatePage(0); setSelectedGateId('') }} disabled={!ruleSetId || versions.loading}><option value="">请选择版本</option>{versions.data?.map((version) => <option key={version.id} value={version.id}>v{version.version} · {version.id.slice(0, 8)}</option>)}</select></label>
      <label>目标分支<input value={branchInput} onChange={(event) => setBranchInput(event.target.value)} /></label>
      <button disabled={!branchInput.trim()} onClick={() => { setBranch(branchInput.trim()); setGatePage(0); setSelectedGateId('') }}>应用分支</button>
    </div>{ruleSets.loading || versions.loading ? <Loading /> : ruleSets.error ? <Failure error={ruleSets.error} retry={ruleSets.reload} /> : versions.error ? <Failure error={versions.error} retry={versions.reload} /> : null}
      <small>当前范围：{branch} · {ruleSetVersionId || '待选择规则版本'}</small></section>
    <div className="split"><section><h2>GitHub PR</h2><QueryState loading={prs.loading} error={prs.error} retry={prs.reload} empty={!prs.data?.items.length}>
      <div className="list">{prs.data?.items.map((pr) => <button className={`row selectable ${selectedPrId === pr.externalId ? 'selected' : ''}`} key={pr.externalId} onClick={() => { setSelectedPrId(pr.externalId); setGatePage(0); setSelectedGateId('') }}><span><strong>#{pr.externalId}</strong><small className="mono"> {shortSha(pr.headSha)} → {pr.targetBranch}</small></span><span className={`badge ${pr.currentGateEvaluationId ? 'succeeded' : ''}`}>{pr.currentGateEvaluationId ? '已有当前门禁' : '待评估'}</span></button>)}</div>
      <div className="pager"><button className="quiet" disabled={prPage === 0} onClick={() => { setPrPage(prPage - 1); setSelectedPrId('') }}>上一页</button><span>第 {prPage + 1} 页</span><button className="quiet" disabled={!prs.data?.hasMore} onClick={() => { setPrPage(prPage + 1); setSelectedPrId('') }}>下一页</button></div>
    </QueryState></section>
      <section><h2>当前提交</h2>{!selectedPr ? <Empty>选择一个 PR 查看当前 head 与门禁。</Empty> : <div className="panel"><p className="mono">PR #{selectedPr.externalId} · {shortSha(selectedPr.headSha)}</p>
        {selectedPr.currentGateEvaluationId ? <QueryState loading={currentGate.loading} error={currentGate.error} retry={currentGate.reload} empty={!currentGate.data}>
          {currentGate.data && <><strong className={`badge gate-${currentGate.data.outcome.toLowerCase()}`}>{currentGate.data.outcome}</strong><p>CI 退出码 {currentGate.data.ciExitCode} · 阻断 {currentGate.data.blockedCount} · {timestamp(currentGate.data.evaluatedAt)}</p><p>相对基线：新增 {currentGate.data.newCount} · 存量 {currentGate.data.existingCount} · 已解决 {currentGate.data.resolvedCount}</p><small>目标分支 {currentGate.data.targetBranch} · 规则版本 <span className="mono">{currentGate.data.ruleSetVersionId}</span></small>{scoped && (currentGate.data.targetBranch !== branch || currentGate.data.ruleSetVersionId !== ruleSetVersionId) && <p className="state">当前门禁属于另一查看范围；下方历史仍按所选范围查询。</p>}</>}
        </QueryState> : <Empty>当前 head 尚无门禁结果；旧提交的 PASS 不代表当前状态。</Empty>}</div>}</section></div>
    {agentEntryEnabled() && selectedPr && !currentGate.loading && !currentGate.error && <PrSummary
      key={`${projectId}:${repositoryId}:${selectedPr.externalId}:${selectedPr.headSha}:${selectedPr.currentHeadRevisionId}:${selectedPr.currentGateEvaluationId}`}
      projectId={projectId} repositoryId={repositoryId} pr={selectedPr} gate={currentGate.data} />}
    <section><h2>PR 修订差异</h2><p className="muted">相对上一 PR 修订；仅用于解释 PR 内变化，不参与基线门禁和 CI 退出码。</p>
      {!scoped ? <Empty>先选择规则版本。</Empty> : !selectedPr ? <Empty>选择一个 PR 查看修订变化。</Empty> : selectedPr.targetBranch !== branch ? <Empty>所选 PR 的目标分支与查看范围不同。</Empty>
        : <QueryState loading={revisionDelta.loading} error={revisionDelta.error} retry={revisionDelta.reload} empty={!revisionDelta.data}>
          {revisionDelta.data?.availability === 'AVAILABLE' ? <div className="panel"><p className="mono">{shortSha(revisionDelta.data.previousHeadSha!)} → {shortSha(revisionDelta.data.currentHeadSha)}</p>
            <p>相对上一 PR 修订：新增 {revisionDelta.data.newCount} · 存量 {revisionDelta.data.existingCount} · 已解决 {revisionDelta.data.resolvedCount}</p>
            <div className="list">{revisionDelta.data.findings.map((finding) => <article className="finding" key={`${finding.classification}:${finding.fingerprint}`}><header><span className={`severity ${finding.severity.toLowerCase()}`}>{finding.severity}</span><strong>{finding.ruleId}</strong><span className="badge">{finding.classification}</span></header><small className="mono">逻辑指纹 {finding.fingerprint}</small></article>)}</div>
          </div> : <Empty>{revisionDelta.data?.availability === 'NO_PREVIOUS_REVISION' ? '尚无前一个已验证的不同 PR 修订。'
            : revisionDelta.data?.availability === 'CURRENT_REPORT_MISSING' ? '当前修订尚无完成的报告和比较。'
              : revisionDelta.data?.availability === 'PREVIOUS_REPORT_MISSING' ? '上一修订尚无完成的报告和比较。'
                : '两个修订的规则或指纹版本不兼容。'}</Empty>}
        </QueryState>}
    </section>
    <div className="split"><section><h2>不可变基线</h2>{!scoped ? <Empty>先选择规则版本。</Empty> : <QueryState loading={baseline.loading} error={baseline.error} retry={baseline.reload} empty={!baseline.data?.length}>
      <div className="list">{baseline.data?.map((item) => <div className="row" key={item.id}><div><strong>版本 {item.version} {item.active && <span className="badge succeeded">当前</span>}</strong><small className="mono">{shortSha(item.commitSha)} · {item.id}</small></div><small>{timestamp(item.createdAt)}</small></div>)}</div>
    </QueryState>}</section><section><h2>跨扫描例外</h2>{!scoped ? <Empty>先选择规则版本。</Empty> : <QueryState loading={exceptions.loading} error={exceptions.error} retry={exceptions.reload} empty={!exceptions.data?.length}>
      <div className="list">{exceptions.data?.map((item) => <article className="panel" key={item.id}><header className="exception-head"><strong>{item.scopeType}: {item.scopeValue}</strong><span className={`badge exception-${item.status.toLowerCase()}`}>{item.status}</span></header><p>{item.reason}</p><small>创建者 {item.createdBy} · 到期 {timestamp(item.expiresAt)} · 版本 {item.version}</small></article>)}</div>
    </QueryState>}</section></div>
    <section><h2>门禁历史与趋势</h2>{!scoped ? <Empty>先选择规则版本。</Empty> : <QueryState loading={history.loading} error={history.error} retry={history.reload} empty={!history.data?.items.length}>
      <p className="muted">{selectedPrId ? `PR #${selectedPrId}` : '全部 PR 与分支扫描'} · {branch} · 同一 RuleSetVersion；条形表示新增 Finding 数量。</p>
      <div className="list">{history.data?.items.map((gate) => <button className={`row selectable ${selectedGateId === gate.id ? 'selected' : ''}`} key={gate.id} onClick={() => setSelectedGateId(gate.id)}><span className={`badge gate-${gate.outcome.toLowerCase()}`}>{gate.outcome}</span><span>{timestamp(gate.evaluatedAt)}</span><span>新增 {gate.newCount} · 存量 {gate.existingCount} · 已解决 {gate.resolvedCount}</span><progress aria-label={`新增趋势 ${gate.newCount}`} value={gate.newCount} max={maxNew} /></button>)}</div>
      <div className="pager"><button className="quiet" disabled={gatePage === 0} onClick={() => { setGatePage(gatePage - 1); setSelectedGateId('') }}>上一页</button><span>第 {gatePage + 1} 页</span><button className="quiet" disabled={!history.data?.hasMore} onClick={() => { setGatePage(gatePage + 1); setSelectedGateId('') }}>下一页</button></div>
    </QueryState>}</section>
    <section><h2>Finding 分类（相对基线）</h2>{!selectedGate ? <Empty>选择一条门禁历史或有当前结果的 PR。</Empty> : !selectedGate.comparisonId ? <Empty>该门禁没有可展示的比较结果。</Empty> : <QueryState loading={comparison.loading} error={comparison.error} retry={comparison.reload} empty={!comparison.data?.findings.length}>
      <div className="summary"><div><small>新增</small><strong>{comparison.data?.newCount}</strong></div><div><small>存量</small><strong>{comparison.data?.existingCount}</strong></div><div><small>已解决</small><strong>{comparison.data?.resolvedCount}</strong></div><div><small>基线版本</small><strong className="mono">{comparison.data?.baselineVersionId.slice(0, 8)}</strong></div></div>
      {(['NEW', 'EXISTING', 'RESOLVED'] as const).map((kind) => <div key={kind}><h3>{kind}</h3>{comparison.data?.findings.filter((finding) => finding.classification === kind).map((finding) => <article className="finding" key={`${kind}:${finding.fingerprint}`}><header><span className={`severity ${finding.severity.toLowerCase()}`}>{finding.severity}</span><strong>{finding.ruleId}</strong><span className="badge">{kind}</span></header><small className="mono">逻辑指纹 {finding.fingerprint}</small></article>) ?? null}{!comparison.data?.findings.some((finding) => finding.classification === kind) && <Empty>此分类没有 Finding。</Empty>}</div>)}
    </QueryState>}</section>
  </main>
}

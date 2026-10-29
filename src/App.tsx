// 客户端路由与会话边界：公开登录/回调页，已登录页面使用公共外壳；各展示开关只决定是否挂载入口。
import { Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from './auth/AuthContext'
import { userManager } from './auth/oidc'
import { Shell } from './components/Shell'
import { ProjectsPage } from './pages/ProjectsPage'
import { ProjectPage } from './pages/ProjectPage'
import { RuleSetsPage } from './pages/RuleSetsPage'
import { ScanResultPage } from './pages/ScanResultPage'
import { GovernancePage } from './pages/GovernancePage'
import { AgentDocumentsPage } from './pages/AgentDocumentsPage'
import { agentEntryEnabled } from './agentEntry'
import { credentialEntryEnabled } from './credentialEntry'
import { CredentialSettingsPage } from './pages/CredentialSettingsPage'
import { personalAgentEntryEnabled } from './personalAgentEntry'
import { PersonalAgentPage } from './pages/PersonalAgentPage'
import { ThemeProvider } from './theme/ThemeContext'

// 登录入口；已有会话直接进入 Project 列表，未登录时由用户发起 OIDC 跳转。
function LoginPage() {
  const { login, user } = useAuth()
  if (user) return <Navigate to="/projects" replace />
  return <main className="login"><p className="eyebrow">Architecture governance</p><h1>让架构规则成为可追溯的事实</h1>
    <p>登录后注册受控目录、版本化规则、运行扫描并处置发现。</p><button onClick={() => void login()}>使用本地身份服务登录</button></main>
}

// 完成 OIDC 回调并替换浏览记录；失败仅跳转固定错误标记，不展示协议错误原文。
function CallbackPage() {
  const navigate = useNavigate()
  useEffect(() => { userManager.signinRedirectCallback().then(() => navigate('/projects', { replace: true }))
    .catch(() => navigate('/login?error=callback', { replace: true })) }, [navigate])
  return <main><p>正在完成登录…</p></main>
}

// 会话读取完成前显示等待；无用户时转到登录，有用户时挂载公共外壳。
function Protected() {
  const { user, loading } = useAuth()
  if (loading) return <main><p>正在加载会话…</p></main>
  if (!user) return <Navigate to="/login" replace />
  return <Shell><Outlet /></Shell>
}

// 声明业务路由，并在渲染元素前检查构建展示开关，关闭时不挂载相应业务组件。
export function App() {
  return <ThemeProvider><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/auth/callback" element={<CallbackPage />} />
    <Route element={<Protected />}>
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/settings/model-credentials" element={credentialEntryEnabled() ? <CredentialSettingsPage />
        : <main><h1>凭据入口已关闭</h1><p>扫描与门禁继续可用；此开关不启用模型调用。</p></main>} />
      <Route path="/projects/:projectId" element={<ProjectPage />} />
      <Route path="/projects/:projectId/agent/personal" element={personalAgentEntryEnabled() ? <PersonalAgentPage />
        : <main><h1>真实 Agent 入口已关闭</h1><p>扫描与门禁继续可用；页面开关不授权模型调用或费用。</p></main>} />
      <Route path="/projects/:projectId/repositories/:repositoryId/rules" element={<RuleSetsPage />} />
      <Route path="/projects/:projectId/repositories/:repositoryId/governance" element={<GovernancePage />} />
      <Route path="/projects/:projectId/scan-jobs/:jobId" element={<ScanResultPage />} />
      <Route path="/projects/:projectId/agent/documents" element={agentEntryEnabled() ? <AgentDocumentsPage />
        : <main><h1>Agent 入口已关闭</h1><p>扫描与质量门禁继续可用；此开关不授权模型调用。</p></main>} />
    </Route>
    <Route path="*" element={<Navigate to="/projects" replace />} />
  </Routes></ThemeProvider>
}

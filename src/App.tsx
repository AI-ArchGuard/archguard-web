import { Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from './auth/AuthContext'
import { userManager } from './auth/oidc'
import { Shell } from './components/Shell'
import { ProjectsPage } from './pages/ProjectsPage'
import { ProjectPage } from './pages/ProjectPage'
import { RuleSetsPage } from './pages/RuleSetsPage'
import { ScanResultPage } from './pages/ScanResultPage'

function LoginPage() {
  const { login, user } = useAuth()
  if (user) return <Navigate to="/projects" replace />
  return <main className="login"><p className="eyebrow">Architecture governance</p><h1>让架构规则成为可追溯的事实</h1>
    <p>登录后注册受控目录、版本化规则、运行扫描并处置发现。</p><button onClick={() => void login()}>使用本地身份服务登录</button></main>
}

function CallbackPage() {
  const navigate = useNavigate()
  useEffect(() => { userManager.signinRedirectCallback().then(() => navigate('/projects', { replace: true }))
    .catch(() => navigate('/login?error=callback', { replace: true })) }, [navigate])
  return <main><p>正在完成登录…</p></main>
}

function Protected() {
  const { user, loading } = useAuth()
  if (loading) return <main><p>正在加载会话…</p></main>
  if (!user) return <Navigate to="/login" replace />
  return <Shell><Outlet /></Shell>
}

export function App() {
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/auth/callback" element={<CallbackPage />} />
    <Route element={<Protected />}>
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/projects/:projectId" element={<ProjectPage />} />
      <Route path="/projects/:projectId/repositories/:repositoryId/rules" element={<RuleSetsPage />} />
      <Route path="/projects/:projectId/scan-jobs/:jobId" element={<ScanResultPage />} />
    </Route>
    <Route path="*" element={<Navigate to="/projects" replace />} />
  </Routes>
}

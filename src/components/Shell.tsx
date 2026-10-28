// 已登录页面外壳：展示当前身份、Project 导航和按展示开关出现的凭据入口，退出交给会话层。
import type { PropsWithChildren } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { credentialEntryEnabled } from '../credentialEntry'

// 组合身份栏与业务子页；导航隐藏只减少入口，不能代替后端授权。
export function Shell({ children }: PropsWithChildren) {
  const { logout, user } = useAuth()
  return <><header className="topbar"><Link className="brand" to="/projects"><span>AG</span> ArchGuard</Link>
    <div className="identity"><span>{user?.profile.preferred_username ?? user?.profile.sub}</span>
      {credentialEntryEnabled() && <Link className="quiet" to="/settings/model-credentials">模型凭据</Link>}
      <button className="quiet" onClick={() => void logout()}>退出</button></div></header>{children}</>
}

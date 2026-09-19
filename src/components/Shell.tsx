import type { PropsWithChildren } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function Shell({ children }: PropsWithChildren) {
  const { logout, user } = useAuth()
  return <><header className="topbar"><Link className="brand" to="/projects"><span>AG</span> ArchGuard</Link>
    <div className="identity"><span>{user?.profile.preferred_username ?? user?.profile.sub}</span>
      <button className="quiet" onClick={() => void logout()}>退出</button></div></header>{children}</>
}

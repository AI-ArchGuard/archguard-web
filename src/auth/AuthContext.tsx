// 会话适配层：将 OIDC 用户事件转换为 React 状态；退出时先清空本地用户，随后跳转身份服务。
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import type { User } from 'oidc-client-ts'
import { userManager } from './oidc'

// 共享会话接口：用户、首次加载状态和登录/退出动作由认证适配层提供。
interface AuthState {
  user: User | null
  loading: boolean
  login: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

// 从本地会话恢复用户并订阅 OIDC 事件；卸载后忽略首次读取的迟到结果并移除监听。
export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    userManager.getUser().then((value) => { if (active) { setUser(value && !value.expired ? value : null); setLoading(false) } })
      .catch(() => { if (active) setLoading(false) })
    const loaded = (value: User) => setUser(value)
    const unloaded = () => setUser(null)
    userManager.events.addUserLoaded(loaded); userManager.events.addUserUnloaded(unloaded)
    return () => { active = false; userManager.events.removeUserLoaded(loaded); userManager.events.removeUserUnloaded(unloaded) }
  }, [])
  // 退出先清空 React 用户，使敏感页面立即卸载；身份服务重定向完成与否不延长页面可见性。
  const value = useMemo<AuthState>(() => ({ user, loading,
    login: () => userManager.signinRedirect(), logout: () => { setUser(null); return userManager.signoutRedirect() } }), [user, loading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// 读取页面共享会话；必须处于 AuthProvider 内，缺少上下文时明确抛错。
// The provider and its hook intentionally share one small module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider is required')
  return value
}

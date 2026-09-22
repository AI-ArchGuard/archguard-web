import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import type { User } from 'oidc-client-ts'
import { userManager } from './oidc'

interface AuthState {
  user: User | null
  loading: boolean
  login: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

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
  const value = useMemo<AuthState>(() => ({ user, loading,
    login: () => userManager.signinRedirect(), logout: () => userManager.signoutRedirect() }), [user, loading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// The provider and its hook intentionally share one small module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider is required')
  return value
}

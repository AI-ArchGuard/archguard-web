// 主题是独立展示偏好；只访问专用存储键，不参与身份、凭据或模型请求。
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'
interface ThemeState {
  preference: ThemePreference
  resolved: 'light' | 'dark'
  setPreference: (preference: ThemePreference) => void
}
const ThemeContext = createContext<ThemeState | null>(null)
const themeKey = 'archguard.theme'
const systemQuery = '(prefers-color-scheme: dark)'

// 浏览器拒绝存储时仍跟随系统；未知值不会变成业务事实或其他存储内容。
function readPreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(themeKey)
    if (value === 'light' || value === 'dark' || value === 'system') return value
  } catch { /* 隐私模式/存储拒绝不阻止页面使用。 */ }
  return 'system'
}
function systemIsDark() {
  return typeof window.matchMedia === 'function' && window.matchMedia(systemQuery).matches
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [preference, updatePreference] = useState<ThemePreference>(readPreference)
  const [systemDark, setSystemDark] = useState(systemIsDark)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(systemQuery)
    const change = () => setSystemDark(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  const resolved = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference
  useEffect(() => { document.documentElement.dataset.theme = resolved }, [resolved])
  const value = useMemo<ThemeState>(() => ({ preference, resolved, setPreference: value => {
    updatePreference(value)
    try { window.localStorage.setItem(themeKey, value) } catch { /* 本次选择仍在内存生效。 */ }
  } }), [preference, resolved])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// 与提供者共置，避免主题控制依赖业务上下文。
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('ThemeProvider is required')
  return value
}

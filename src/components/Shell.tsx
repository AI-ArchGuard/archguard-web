// 已登录页面外壳：展示当前身份、Project 导航和按展示开关出现的凭据入口，退出交给会话层。
import { useEffect, useRef, useState, type KeyboardEvent, type PropsWithChildren } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { credentialEntryEnabled } from '../credentialEntry'
import { agentEntryEnabled } from '../agentEntry'
import { personalAgentEntryEnabled } from '../personalAgentEntry'
import { useTheme } from '../theme/ThemeContext'

const mobileQuery = '(max-width: 767px)'
const focusable = 'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex="0"]'

// 组合身份栏与业务子页；导航隐藏只减少入口，不能代替后端授权。
export function Shell({ children }: PropsWithChildren) {
  const { logout, user } = useAuth()
  const { preference, setPreference } = useTheme()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobile, setMobile] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia(mobileQuery).matches)
  const [mobileOpen, setMobileOpen] = useState(false)
  const sidebar = useRef<HTMLElement>(null)
  const menu = useRef<HTMLButtonElement>(null)
  const desktopToggle = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  // 导航只从当前已存在的资源 URL 取上下文；不额外请求项目，也不伪造名称。
  const projectId = location.pathname.match(/^\/projects\/([^/]+)/)?.[1]
  const repositoryId = location.pathname.match(/\/repositories\/([^/]+)/)?.[1]
  const projectPath = projectId ? `/projects/${projectId}` : '/projects'
  const destinations = [
    { label: '工作台', to: projectPath },
    ...(projectId ? [
      { label: '扫描', to: `${projectPath}#scans` },
      { label: '治理', to: repositoryId ? `${projectPath}/repositories/${repositoryId}/governance` : `${projectPath}#repositories` },
    ] : []),
    ...(projectId && agentEntryEnabled() ? [{ label: '架构文档', to: `${projectPath}/agent/documents` }] : []),
    ...(projectId && personalAgentEntryEnabled() ? [{ label: '个人 Agent', to: `${projectPath}/agent/personal` }] : []),
  ]
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(mobileQuery)
    const change = () => { setMobile(media.matches); setMobileOpen(false) }
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  // 抽屉开启后焦点进入导航；关闭后背景解除 inert，再归还触发按钮。
  useEffect(() => {
    if (mobile && mobileOpen) sidebar.current?.querySelector<HTMLElement>(focusable)?.focus()
    else if (wasOpen.current) (mobile ? menu : desktopToggle).current?.focus()
    wasOpen.current = mobile && mobileOpen
  }, [mobile, mobileOpen])
  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (!mobile || !mobileOpen) return
    if (event.key === 'Escape') { event.preventDefault(); setMobileOpen(false); return }
    if (event.key !== 'Tab') return
    const controls = sidebar.current?.querySelectorAll<HTMLElement>(focusable)
    if (!controls?.length) return
    const first = controls[0], last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
  const closeNavigation = () => setMobileOpen(false)
  return <div className={`workbench-layout${collapsed ? ' is-collapsed' : ''}${mobileOpen ? ' is-mobile-open' : ''}`}>
    <aside id="workbench-sidebar" className="workbench-sidebar" ref={sidebar} inert={mobile && !mobileOpen}
      aria-label="工作区侧栏" onKeyDown={keyboard}>
      <div className="sidebar-brand"><Link className="brand" to="/projects" aria-label="ArchGuard" onClick={closeNavigation}><span>AG</span><span className="sidebar-label">ArchGuard</span></Link>
        <button ref={desktopToggle} className="sidebar-toggle quiet" aria-label={mobile ? '关闭导航' : collapsed ? '展开侧栏' : '收起侧栏'}
          aria-expanded={mobile ? mobileOpen : !collapsed} aria-controls="workbench-sidebar"
          onClick={() => mobile ? closeNavigation() : setCollapsed(value => !value)}>{mobile ? '×' : collapsed ? '›' : '‹'}</button></div>
      <div className="project-switcher"><span className="sidebar-label">{projectId ? '当前项目' : '尚未选择项目'}</span>
        {projectId && <small className="sidebar-label" title={projectId}>{projectId}</small>}
        <Link to="/projects" aria-label="切换项目" onClick={closeNavigation}><span aria-hidden="true">⇄</span><span className="sidebar-label">切换项目</span></Link></div>
      <nav className="sidebar-nav" aria-label="工作区导航">{destinations.map(({ label, to }) =>
        <Link className="sidebar-link" key={label} to={to} title={label} aria-label={label} onClick={closeNavigation}
          aria-current={`${location.pathname}${location.hash}` === to ? 'page' : undefined}>
          <span className="sidebar-icon" aria-hidden="true">{label.slice(0, 1)}</span><span className="sidebar-label">{label}</span></Link>)}</nav>
      <footer className="sidebar-footer">
        {projectId && <Link className="sidebar-link" to={`${projectPath}#repositories`} aria-label="项目设置" title="项目设置" onClick={closeNavigation}><span aria-hidden="true">⚙</span><span className="sidebar-label">项目设置</span></Link>}
        {credentialEntryEnabled() && <Link className="sidebar-link" to="/settings/model-credentials" aria-label="模型凭据" title="模型凭据" onClick={closeNavigation}><span aria-hidden="true">◇</span><span className="sidebar-label">模型凭据</span></Link>}
        <div className="theme-picker" role="group" aria-label="主题">{([
          ['system', '跟随系统'], ['light', '浅色'], ['dark', '深色'],
        ] as const).map(([value, label]) => <button className="quiet" key={value} aria-label={label} title={label}
          aria-pressed={preference === value} onClick={() => setPreference(value)}>{label}</button>)}</div>
        <div className="sidebar-account"><span className="sidebar-label">{user?.profile.preferred_username ?? user?.profile.sub}</span>
          <button className="quiet" onClick={() => void logout()}>退出</button></div>
      </footer>
    </aside>
    {mobile && mobileOpen && <div className="sidebar-backdrop" aria-hidden="true" onClick={closeNavigation} />}
    <div className="workbench-main" inert={mobile && mobileOpen}>
      <header className="workbench-topbar"><button className="mobile-nav-button quiet" ref={menu} aria-label="打开导航"
        aria-controls="workbench-sidebar" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}>☰</button>
        <span>{location.pathname === '/settings/model-credentials' ? '模型凭据' : destinations.find(({ to }) => to === `${location.pathname}${location.hash}`)?.label ?? '工作区'}</span>
      </header>{children}
    </div>
  </div>
}

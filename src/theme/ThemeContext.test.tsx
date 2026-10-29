// 主题只保存非敏感偏好；系统变化与浏览器存储拒绝都不影响页面使用。
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ThemeProvider, useTheme } from './ThemeContext'

function Controls() {
  const { preference, resolved, setPreference } = useTheme()
  return <><output>{preference}:{resolved}</output>{(['system', 'light', 'dark'] as const).map(value =>
    <button key={value} onClick={() => setPreference(value)}>{value}</button>)}</>
}

let systemDark = false
let changed: (() => void) | undefined
beforeEach(() => {
  localStorage.clear(); systemDark = false; changed = undefined
  vi.stubGlobal('matchMedia', vi.fn(() => ({ get matches() { return systemDark },
    addEventListener: (_: string, callback: () => void) => { changed = callback }, removeEventListener: vi.fn() })))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); delete document.documentElement.dataset.theme })

it('follows system changes until an explicit choice, saves only the theme preference', () => {
  const write = vi.spyOn(Storage.prototype, 'setItem')
  render(<ThemeProvider><Controls /></ThemeProvider>)
  expect(screen.getByText('system:light')).toBeInTheDocument()
  act(() => { systemDark = true; changed?.() })
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  fireEvent.click(screen.getByRole('button', { name: 'light' }))
  act(() => { systemDark = false; changed?.(); systemDark = true; changed?.() })
  expect(screen.getByText('light:light')).toBeInTheDocument()
  expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  expect(write.mock.calls.every(([key, value]) => key === 'archguard.theme' && ['light', 'dark', 'system'].includes(value))).toBe(true)
  expect(localStorage.getItem('archguard.theme')).toBe('light')
  fireEvent.click(screen.getByRole('button', { name: 'system' }))
  expect(screen.getByText('system:dark')).toBeInTheDocument()
})

it('restores a valid saved choice and ignores invalid stored values', () => {
  localStorage.setItem('archguard.theme', 'dark')
  const view = render(<ThemeProvider><Controls /></ThemeProvider>)
  expect(screen.getByText('dark:dark')).toBeInTheDocument()
  view.unmount(); localStorage.setItem('archguard.theme', 'invalid')
  render(<ThemeProvider><Controls /></ThemeProvider>)
  expect(screen.getByText('system:light')).toBeInTheDocument()
})

it('keeps theme controls working when storage access is denied', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('denied') })
  render(<ThemeProvider><Controls /></ThemeProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'dark' }))
  expect(screen.getByText('dark:dark')).toBeInTheDocument()
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
})

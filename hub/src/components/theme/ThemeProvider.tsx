'use client'

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'
const KEY = 'slipsurge:appearance:v1'
const listeners = new Set<() => void>()
let current: Theme | null = null
function reviewTheme(): Theme | null {
  if (process.env.NEXT_PUBLIC_DESIGN_REVIEW !== '1' || typeof window === 'undefined') return null
  const value=new URLSearchParams(window.location.search).get('reviewTheme') ?? window.frameElement?.getAttribute('data-review-theme')
  return value==='light'||value==='dark'?value:null
}
const read = (): Theme => {
  if (current) return current
  const isolated=reviewTheme()
  if (isolated) return (current=isolated)
  try { current = localStorage.getItem(KEY) === 'light' ? 'light' : 'dark' } catch { current = 'dark' }
  return current
}
function apply(theme: Theme) {
  const html = document.documentElement
  html.dataset.theme = theme
  html.classList.toggle('dark', theme === 'dark')
  html.classList.toggle('light', theme === 'light')
  html.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0c1118' : '#edf0f4')
}
function setTheme(theme: Theme) {
  current = theme
  if (!reviewTheme()) try { localStorage.setItem(KEY, theme) } catch {}
  apply(theme)
  listeners.forEach(notify => notify())
  window.dispatchEvent(new CustomEvent('slipsurge:themechange', { detail: theme }))
}
function subscribe(notify: () => void) {
  listeners.add(notify)
  const sync = (event: StorageEvent) => {
    if (event.key !== KEY || reviewTheme()) return
    current = event.newValue === 'light' ? 'light' : 'dark'
    apply(current)
    listeners.forEach(listener => listener())
  }
  window.addEventListener('storage', sync)
  return () => { listeners.delete(notify); window.removeEventListener('storage', sync) }
}
const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void }>({ theme: 'dark', setTheme })
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore<Theme>(subscribe, read, () => 'dark')
  useEffect(()=>{apply(read());document.documentElement.dataset.appearanceReady='true'},[theme])
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}
export const useTheme = () => useContext(ThemeContext)

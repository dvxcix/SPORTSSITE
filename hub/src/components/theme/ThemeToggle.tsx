'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from './ThemeProvider'

export function ThemeToggle({ full = false, menu = false }: { full?: boolean; menu?: boolean }) {
  const { theme, setTheme } = useTheme()
  return <div className={`ss-theme-switch${full ? ' is-full' : ''}`} role="group" aria-label="Colour theme">
    <button type="button" role={menu ? 'menuitemradio' : undefined} aria-label="Use light theme" aria-pressed={menu ? undefined : theme === 'light'} aria-checked={menu ? theme === 'light' : undefined} onClick={() => setTheme('light')}><Sun size={15} aria-hidden="true" /><span>Light</span></button>
    <button type="button" role={menu ? 'menuitemradio' : undefined} aria-label="Use dark theme" aria-pressed={menu ? undefined : theme === 'dark'} aria-checked={menu ? theme === 'dark' : undefined} onClick={() => setTheme('dark')}><Moon size={15} aria-hidden="true" /><span>Dark</span></button>
  </div>
}

'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from './ThemeProvider'

export function ThemeToggle({ full = false }: { full?: boolean }) {
  const { theme, setTheme } = useTheme()
  return <div className={`ss-theme-switch${full ? ' is-full' : ''}`} role="group" aria-label="Colour theme">
    <button type="button" aria-label="Use light theme" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}><Sun size={15} aria-hidden="true" /><span>Light</span></button>
    <button type="button" aria-label="Use dark theme" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}><Moon size={15} aria-hidden="true" /><span>Dark</span></button>
  </div>
}

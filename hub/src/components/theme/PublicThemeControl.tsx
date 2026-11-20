'use client'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from './ThemeToggle'
export function PublicThemeControl() {
  const path = usePathname()
  if (!(path === '/' || path.startsWith('/auth/') || path.startsWith('/preview/') || path === '/onboarding')) return null
  return <div className="ss-public-theme"><ThemeToggle /></div>
}

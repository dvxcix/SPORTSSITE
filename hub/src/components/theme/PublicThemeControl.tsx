'use client'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from './ThemeToggle'
export function PublicThemeControl() {
  const path = usePathname()
  // Landing and research previews place the control in their own header flow.
  if (!(path.startsWith('/auth/') || path === '/onboarding')) return null
  return <div className="ss-public-theme"><ThemeToggle /></div>
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Activity, TrendingUp, MessageCircle, Bell } from 'lucide-react'

const tabs = [
  { href: '/feed',          icon: Home,          label: 'Home' },
  { href: '/sports',        icon: Activity,      label: 'Scores' },
  { href: '/picks',         icon: TrendingUp,    label: 'Picks' },
  { href: '/messages',      icon: MessageCircle, label: 'DMs' },
  { href: '/notifications', icon: Bell,          label: 'Alerts' },
]

export function MobileNav() {
  const path = usePathname()

  function active(href: string) {
    if (href === '/feed') return path === '/feed' || path === '/'
    return path === href || path.startsWith(href + '/')
  }

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'var(--surface)',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      paddingBottom: 'env(safe-area-inset-bottom)',
      zIndex: 40,
    }} className="lg:hidden">
      {tabs.map(tab => {
        const Icon = tab.icon
        const isActive = active(tab.href)
        return (
          <Link key={tab.href} href={tab.href} style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            paddingTop: 10, paddingBottom: 10, gap: 3,
            color: isActive ? 'var(--accent)' : 'var(--text-3)',
            textDecoration: 'none', transition: 'color 130ms',
            fontSize: 9, fontWeight: 700, letterSpacing: '0.03em',
          }}>
            <div style={{
              width: 36, height: 28, borderRadius: 99,
              background: isActive ? 'var(--accent-dim)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 130ms',
            }}>
              <Icon size={17} />
            </div>
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}

import Link from 'next/link'
import { Bell, CreditCard, LayoutDashboard, LockKeyhole, Shield, Sparkles, UserRound, UserX } from 'lucide-react'

const items = [
  { href: '/settings', label: 'Overview', icon: LayoutDashboard },
  { href: '/settings/profile', label: 'Profile', icon: UserRound },
  { href: '/settings/account', label: 'Account', icon: Shield },
  { href: '/settings/notifications', label: 'Notifications', icon: Bell },
  { href: '/settings/privacy', label: 'Privacy', icon: LockKeyhole },
  { href: '/settings/blocked', label: 'Blocked', icon: UserX },
  { href: '/settings/membership', label: 'Membership', icon: CreditCard },
  { href: '/creators/studio', label: 'Creator Studio', icon: Sparkles },
]

export function SettingsShell({ active, eyebrow = 'MEMBER CONTROL CENTER', title, description, children }: {
  active: string; eyebrow?: string; title: string; description: string; children: React.ReactNode
}) {
  return <main className="ss-settings-shell">
    <header className="ss-settings-hero"><div className="ss-settings-hero-glow" /><div className="relative"><p className="ss-settings-eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div></header>
    <div className="ss-settings-layout">
      <nav className="ss-settings-nav" aria-label="Settings sections">
        {items.map(item => { const Icon = item.icon; const current = active === item.href; return <Link key={item.href} href={item.href} aria-current={current ? 'page' : undefined} className={current ? 'is-active' : ''}><Icon size={17} /><span>{item.label}</span></Link> })}
      </nav>
      <section className="ss-settings-content">{children}</section>
    </div>
  </main>
}

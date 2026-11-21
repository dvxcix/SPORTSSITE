import Link from 'next/link'
import { SettingsSectionSelect } from './SettingsSectionSelect'
import { ResearchSavedActions } from '@/components/research/ResearchSavedActions'
import { AtSign, Bell, Compass, CreditCard, KeyRound, LayoutDashboard, LockKeyhole, Shield, SlidersHorizontal, Sparkles, UserRound, UserX } from 'lucide-react'

const items = [
  { href: '/settings', label: 'Overview', icon: LayoutDashboard },
  { href: '/settings/profile', label: 'Profile', icon: UserRound },
  { href: '/settings/research', label: 'Your workspace', icon: SlidersHorizontal },
  { href: '/settings/interests', label: 'Interests', icon: Compass },
  { href: '/settings/connections', label: 'Connected accounts', icon: AtSign },
  { href: '/settings/account', label: 'Account', icon: Shield },
  { href: '/settings/security', label: 'Security', icon: KeyRound },
  { href: '/settings/notifications', label: 'Notifications', icon: Bell },
  { href: '/settings/privacy', label: 'Privacy', icon: LockKeyhole },
  { href: '/settings/blocked', label: 'Muted & blocked', icon: UserX },
  { href: '/settings/membership', label: 'Membership', icon: CreditCard },
  { href: '/creators/studio', label: 'Creator Studio', icon: Sparkles },
]

export function SettingsShell({ active, eyebrow, title, description, children }: {
  active: string; eyebrow?: string; title: string; description: string; children: React.ReactNode
}) {
  return <div className="ss-settings-shell">
    <header className="ss-settings-hero"><div>{eyebrow && <p className="ss-settings-eyebrow">{eyebrow}</p>}<h1 id="settings-page-title">{title}</h1><p>{description}</p></div><ResearchSavedActions /></header>
    <SettingsSectionSelect active={active} items={items.map(({ href, label }) => ({ href, label }))}/>
    <div className="ss-settings-layout">
      <nav className="ss-settings-nav" aria-label="Settings sections">
        {items.map(item => { const Icon = item.icon; const current = active === item.href; return <Link key={item.href} href={item.href} aria-current={current ? 'page' : undefined} className={current ? 'is-active' : ''}><Icon size={17} /><span>{item.label}</span></Link> })}
      </nav>
      <section className="ss-settings-content" aria-labelledby="settings-page-title">{children}</section>
    </div>
  </div>
}

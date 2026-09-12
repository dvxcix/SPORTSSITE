import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { User, Bell, Shield, CreditCard, Eye, ChevronRight, Zap, HelpCircle, KeyRound, MessageCircleQuestion, UserX } from 'lucide-react'
import { DesktopSettingsPanel } from '@/components/desktop/DesktopSettingsPanel'
import { SettingsShell } from '@/components/settings/SettingsShell'
import styles from './SettingsOverview.module.css'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/settings')

  const sections = [
    {
      title: 'Account',
      items: [
        { href: '/settings/profile', icon: User, label: 'Edit Profile', desc: 'Name, bio, avatar, banner' },
        // Email, password, and account deletion all live on this one page —
        // there's no separate /settings/security or /settings/delete route.
        { href: '/settings/account', icon: Shield, label: 'Account Settings', desc: 'Email, password, delete account' },
        { href: '/settings/security', icon: KeyRound, label: 'Security', desc: 'Two-factor authentication and sessions' },
      ]
    },
    {
      title: 'Preferences',
      items: [
        { href: '/settings/notifications', icon: Bell, label: 'Notifications', desc: 'Push, email, in-app alerts' },
        { href: '/settings/privacy', icon: Eye, label: 'Privacy', desc: 'Who can see your posts and profile' },
        { href: '/settings/blocked', icon: UserX, label: 'Blocked Users', desc: 'Manage who you\'ve blocked' },
      ]
    },
    {
      title: 'Creator',
      items: [
        { href: '/creators/apply', icon: Zap, label: 'Become a Creator', desc: 'Apply for creator status & start earning' },
      ]
    },
    {
      title: 'Billing',
      items: [
        { href: '/settings/membership', icon: CreditCard, label: 'Membership', desc: 'Current tier, renewal, and billing' },
      ]
    },
    {
      title: 'Help',
      items: [
        { href: '/faq', icon: MessageCircleQuestion, label: 'FAQ', desc: 'Common questions' },
        { href: '/support', icon: HelpCircle, label: 'Support', desc: 'Contact us for help' },
      ]
    },
  ]

  return <SettingsShell active="/settings" title="Make SlipSurge yours" description="Your identity, membership, alerts, privacy, and account controls in one place.">
      <DesktopSettingsPanel />
      <div className={styles.grid}>
        {sections.map(section => (
          <section key={section.title} className={styles.section} aria-labelledby={`settings-${section.title.toLowerCase()}-heading`}>
            <header className={styles.sectionHead}><h2 id={`settings-${section.title.toLowerCase()}-heading`}>{section.title}</h2><span aria-hidden="true" /></header>
            <div className={styles.items}>
              {section.items.map((item) => {
                const Icon = item.icon
                return (
                  <Link key={item.href} href={item.href}
                    className={styles.item}>
                    <span className={styles.icon}><Icon size={17} /></span>
                    <span className={styles.copy}><strong>{item.label}</strong><small>{item.desc}</small></span>
                    <ChevronRight size={15} className={styles.arrow} aria-hidden="true" />
                  </Link>
                )
              })}
            </div>
          </section>
        ))}
      </div>
  </SettingsShell>
}

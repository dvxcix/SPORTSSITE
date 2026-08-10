import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { User, Bell, Shield, CreditCard, Eye, ChevronRight, Zap, HelpCircle, KeyRound, MessageCircleQuestion, UserX } from 'lucide-react'
import { DesktopSettingsPanel } from '@/components/desktop/DesktopSettingsPanel'
import { SettingsShell } from '@/components/settings/SettingsShell'

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
      <div className="grid gap-5 lg:grid-cols-2">
        {sections.map(section => (
          <section key={section.title} className="ss-settings-card !p-2">
            <h2 className="px-3 pb-2 pt-3 text-[10px] font-black text-lime-300 uppercase tracking-[.18em]">{section.title}</h2>
            <div className="divide-y divide-white/[.06]">
              {section.items.map((item) => {
                const Icon = item.icon
                return (
                  <Link key={item.href} href={item.href}
                    className="flex items-center gap-4 rounded-xl px-3 py-3.5 hover:bg-white/[.045] transition-colors group">
                    <div className="p-2.5 rounded-xl border border-white/[.07] bg-black/30 group-hover:border-lime-400/25 transition-colors">
                      <Icon size={16} className="text-lime-300" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm text-white">{item.label}</p>
                      <p className="text-xs text-zinc-500">{item.desc}</p>
                    </div>
                    <ChevronRight size={16} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                  </Link>
                )
              })}
            </div>
          </section>
        ))}
      </div>
  </SettingsShell>
}

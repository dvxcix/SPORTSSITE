import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { User, Bell, Shield, CreditCard, Eye, ChevronRight, Zap, HelpCircle, MessageCircleQuestion } from 'lucide-react'

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
      ]
    },
    {
      title: 'Preferences',
      items: [
        { href: '/settings/notifications', icon: Bell, label: 'Notifications', desc: 'Push, email, in-app alerts' },
        { href: '/settings/privacy', icon: Eye, label: 'Privacy', desc: 'Who can see your posts and profile' },
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

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-black text-white mb-6">Settings</h1>

      <div className="space-y-6">
        {sections.map(section => (
          <div key={section.title}>
            <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">{section.title}</h2>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-800">
              {section.items.map((item: any) => {
                const Icon = item.icon
                return (
                  <Link key={item.href} href={item.href}
                    className="flex items-center gap-4 px-4 py-3.5 hover:bg-zinc-800 transition-colors group">
                    <div className={`p-2 rounded-lg ${item.danger ? 'bg-red-500/10' : 'bg-zinc-800 group-hover:bg-zinc-700'} transition-colors`}>
                      <Icon size={16} className={item.danger ? 'text-red-400' : 'text-zinc-400'} />
                    </div>
                    <div className="flex-1">
                      <p className={`font-medium text-sm ${item.danger ? 'text-red-400' : 'text-white'}`}>{item.label}</p>
                      <p className="text-xs text-zinc-500">{item.desc}</p>
                    </div>
                    <ChevronRight size={16} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

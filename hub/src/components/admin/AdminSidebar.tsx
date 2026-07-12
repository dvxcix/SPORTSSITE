'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, FileText, MessageSquare, Flag,
  Settings, CreditCard, Megaphone, Star, Calendar,
  ShoppingBag, Briefcase, BookOpen, Zap, Radio,
  Bell, Shield, ChevronDown, ChevronRight, Upload, Smile
} from 'lucide-react'
import { useState } from 'react'

const nav = [
  { href: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
  {
    label: 'Users', icon: Users, children: [
      { href: '/admin/users', label: 'All Users' },
      { href: '/admin/users/banned', label: 'Banned' },
      { href: '/admin/users/verify', label: 'Verification Requests' },
      { href: '/admin/users/online', label: 'Online Users' },
    ]
  },
  {
    label: 'Content', icon: FileText, children: [
      { href: '/admin/content/posts', label: 'Posts' },
      { href: '/admin/content/stories', label: 'Stories' },
      { href: '/admin/content/blogs', label: 'Blogs' },
      { href: '/admin/content/reports', label: 'Reports' },
    ]
  },
  { href: '/admin/groups', icon: MessageSquare, label: 'Groups' },
  { href: '/admin/pages', icon: Star, label: 'Pages' },
  { href: '/admin/events', icon: Calendar, label: 'Events' },
  { href: '/admin/marketplace', icon: ShoppingBag, label: 'Marketplace' },
  { href: '/admin/jobs', icon: Briefcase, label: 'Jobs' },
  { href: '/admin/forum', icon: BookOpen, label: 'Forum' },
  { href: '/admin/creators', icon: Zap, label: 'Creator Applications' },
  { href: '/admin/monetization', icon: CreditCard, label: 'Monetization' },
  { href: '/admin/pikkit-import', icon: Upload, label: 'Pikkit Picks Import' },
  { href: '/admin/fanduel-import', icon: Upload, label: 'FanDuel Gap Markets' },
  { href: '/admin/mgm-import', icon: Upload, label: 'BetMGM HR Odds' },
  { href: '/admin/ads', icon: Megaphone, label: 'Ads' },
  { href: '/admin/live', icon: Radio, label: 'Live Streaming' },
  { href: '/admin/notifications', icon: Bell, label: 'Notifications' },
  { href: '/admin/reports', icon: Flag, label: 'Reports' },
  { href: '/admin/emojis', icon: Smile, label: 'Custom Emojis' },
  {
    label: 'Settings', icon: Settings, children: [
      { href: '/admin/settings/general', label: 'General' },
      { href: '/admin/settings/features', label: 'Features' },
      { href: '/admin/settings/email', label: 'Email Templates' },
      { href: '/admin/settings/social-login', label: 'Social Login' },
      { href: '/admin/settings/payments', label: 'Payment Gateways' },
      { href: '/admin/settings/ai', label: 'AI Settings' },
      { href: '/admin/settings/custom-code', label: 'Custom CSS/JS' },
    ]
  },
]

export function AdminSidebar() {
  const path = usePathname()
  const [open, setOpen] = useState<string[]>([])

  function toggle(label: string) {
    setOpen(o => o.includes(label) ? o.filter(l => l !== label) : [...o, label])
  }

  function active(href: string) {
    return path === href || (href !== '/admin' && path.startsWith(href))
  }

  return (
    <aside className="w-56 shrink-0 h-screen sticky top-0 border-r border-zinc-800 bg-zinc-900 flex flex-col">
      <div className="px-4 py-5 border-b border-zinc-800">
        <Link href="/admin" className="flex items-center gap-2">
          <Shield size={18} className="text-green-400" />
          <div>
            <p className="text-sm font-black text-white">Admin Panel</p>
            <p className="text-[10px] text-zinc-500">SlipSurge Control</p>
          </div>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {nav.map(item => {
          if ('children' in item && item.children) {
            const isOpen = open.includes(item.label)
            const Icon = item.icon
            return (
              <div key={item.label}>
                <button onClick={() => toggle(item.label)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all text-xs font-medium">
                  <Icon size={15} />
                  <span className="flex-1 text-left">{item.label}</span>
                  {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
                {isOpen && (
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l border-zinc-800 pl-2">
                    {item.children.map(child => (
                      <Link key={child.href} href={child.href}
                        className={`block px-2 py-1.5 rounded-lg text-xs transition-all ${active(child.href) ? 'text-white bg-zinc-800' : 'text-zinc-500 hover:text-white hover:bg-zinc-800/60'}`}>
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          }
          const Icon = item.icon!
          return (
            <Link key={item.href} href={item.href!}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${active(item.href!) ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'}`}>
              <Icon size={15} />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="px-4 py-3 border-t border-zinc-800">
        <Link href="/" className="text-xs text-zinc-500 hover:text-white transition-colors">← Back to SlipSurge</Link>
      </div>
    </aside>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity, AlertTriangle, AtSign, Award, Bell, BookOpen, Bot, BrainCircuit, Briefcase,
  Calendar, ChevronDown, ChevronRight, CreditCard, Dna, FileText, Flag,
  LayoutDashboard, Megaphone, MessageSquare, Palette, Radio, Settings,
  Shield, ShoppingBag, Smile, Sparkles, Upload, Users, X, Zap,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

type NavChild = { href: string; label: string }
type NavItem = { href?: string; icon: LucideIcon; label: string; children?: NavChild[] }

const NAV: NavItem[] = [
  { href: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
  { label: 'Users', icon: Users, children: [
    { href: '/admin/users', label: 'All users' }, { href: '/admin/users/banned', label: 'Banned' },
    { href: '/admin/users/verify', label: 'Verification requests' }, { href: '/admin/users/online', label: 'Online users' },
  ] },
  { label: 'Content', icon: FileText, children: [
    { href: '/admin/content/posts', label: 'Posts' }, { href: '/admin/content/stories', label: 'Stories' },
    { href: '/admin/content/blogs', label: 'Blogs' }, { href: '/admin/content/reports', label: 'Reports' },
  ] },
  { href: '/admin/groups', icon: MessageSquare, label: 'Groups' },
  { href: '/admin/pages', icon: Sparkles, label: 'Pages' },
  { href: '/admin/events', icon: Calendar, label: 'Events' },
  { href: '/admin/marketplace', icon: ShoppingBag, label: 'Marketplace' },
  { href: '/admin/jobs', icon: Briefcase, label: 'Jobs' },
  { href: '/admin/forum', icon: BookOpen, label: 'Forum' },
  { href: '/admin/creators', icon: Zap, label: 'Creator applications' },
  { href: '/admin/monetization', icon: CreditCard, label: 'Monetization' },
  { href: '/admin/pikkit-import', icon: Upload, label: 'Pikkit import' },
  { href: '/admin/market-dna', icon: Dna, label: 'Market DNA' },
  { href: '/admin/hr-intelligence', icon: BrainCircuit, label: 'HR game intelligence' },
  { href: '/admin/fanduel-import', icon: Upload, label: 'FanDuel markets' },
  { href: '/admin/mgm-import', icon: Upload, label: 'BetMGM odds' },
  { href: '/admin/ads', icon: Megaphone, label: 'Ads' },
  { href: '/admin/live', icon: Radio, label: 'Live streaming' },
  { href: '/admin/notifications', icon: Bell, label: 'Notifications' },
  { href: '/admin/pipeline-health', icon: Activity, label: 'Pipeline health' },
  { href: '/admin/reports', icon: Flag, label: 'Reports' },
  { href: '/admin/emojis', icon: Smile, label: 'Custom emojis' },
  { href: '/admin/badges', icon: Award, label: 'Badges' },
  { href: '/admin/social-platforms', icon: AtSign, label: 'Connected accounts' },
  { href: '/admin/site-banner', icon: AlertTriangle, label: 'Site banner' },
  { href: '/admin/discord', icon: Bot, label: 'Discord bot' },
  { href: '/admin/changelog', icon: Sparkles, label: 'Changelog' },
  { href: '/admin/design-system', icon: Palette, label: 'Design system' },
  { label: 'Settings', icon: Settings, children: [
    { href: '/admin/settings/general', label: 'General' }, { href: '/admin/settings/features', label: 'Features' },
    { href: '/admin/settings/email', label: 'Email templates' }, { href: '/admin/settings/social-login', label: 'Social login' },
    { href: '/admin/settings/payments', label: 'Payment gateways' }, { href: '/admin/settings/ai', label: 'AI settings' },
    { href: '/admin/settings/custom-code', label: 'Custom CSS and JS' },
  ] },
]

function isActive(path: string, href: string) {
  return path === href || (href !== '/admin' && path.startsWith(`${href}/`))
}

export function AdminSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const path = usePathname()
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string[]>(() => NAV.filter(item => item.children?.some(child => isActive(path, child.href))).map(item => item.label))
  const normalizedQuery = query.trim().toLowerCase()
  const visibleNav = useMemo(() => {
    if (!normalizedQuery) return NAV
    return NAV.flatMap(item => {
      if (item.label.toLowerCase().includes(normalizedQuery)) return [item]
      const children = item.children?.filter(child => child.label.toLowerCase().includes(normalizedQuery))
      return children?.length ? [{ ...item, children }] : []
    })
  }, [normalizedQuery])

  function toggle(label: string) {
    setExpanded(current => current.includes(label) ? current.filter(value => value !== label) : [...current, label])
  }

  return (
    <>
      <button aria-label="Close admin navigation" onClick={onClose} className={cn('fixed inset-0 z-[calc(var(--layer-popover)-1)] bg-black/65 backdrop-blur-sm transition-opacity lg:hidden', open ? 'opacity-100' : 'pointer-events-none opacity-0')} />
      <aside className={cn('fixed inset-y-0 left-0 z-[var(--layer-popover)] flex w-[272px] flex-col border-r border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_96%,transparent)] shadow-[var(--shadow-overlay)] backdrop-blur-xl transition-transform duration-[var(--duration-normal)] lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 lg:shadow-none', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex h-16 items-center gap-3 border-b border-[var(--border)] px-4">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-lime-400/25 bg-[var(--accent-dim)] text-[var(--accent)] shadow-[0_0_24px_var(--accent-glow)]"><Shield size={18} /></span>
          <div className="min-w-0 flex-1"><p className="text-sm font-black text-[var(--text-1)]">SlipSurge Control</p><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-3)]">Administration</p></div>
          <button aria-label="Close navigation" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)] lg:hidden"><X size={17} /></button>
        </div>

        <div className="px-3 pb-2 pt-3">
          <label className="relative block">
            <span className="sr-only">Filter admin navigation</span>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a tool" className="ss-input h-9 pl-3 text-xs" />
          </label>
        </div>

        <nav aria-label="Admin navigation" className="flex-1 overflow-y-auto px-3 pb-4">
          <div className="space-y-1">
            {visibleNav.map(item => {
              const Icon = item.icon
              if (item.children) {
                const activeChild = item.children.some(child => isActive(path, child.href))
                const isOpen = normalizedQuery.length > 0 || expanded.includes(item.label)
                return (
                  <div key={item.label}>
                    <button aria-expanded={isOpen} onClick={() => toggle(item.label)} className={cn('flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-xs font-bold transition-colors', activeChild ? 'bg-[var(--accent-dim)] text-[var(--accent)]' : 'text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]')}>
                      <Icon size={16} aria-hidden="true" /><span className="flex-1 text-left">{item.label}</span>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    {isOpen ? <div className="ml-5 mt-1 space-y-1 border-l border-[var(--border-2)] pl-3">{item.children.map(child => (
                      <Link key={child.href} href={child.href} onClick={onClose} aria-current={isActive(path, child.href) ? 'page' : undefined} className={cn('block rounded-lg px-3 py-2 text-xs font-semibold transition-colors', isActive(path, child.href) ? 'bg-[var(--surface-3)] text-[var(--text-1)]' : 'text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]')}>{child.label}</Link>
                    ))}</div> : null}
                  </div>
                )
              }
              return <Link key={item.href} href={item.href!} onClick={onClose} aria-current={isActive(path, item.href!) ? 'page' : undefined} className={cn('flex min-h-10 items-center gap-3 rounded-lg px-3 text-xs font-bold transition-colors', isActive(path, item.href!) ? 'bg-[var(--accent)] text-[var(--accent-fg)] shadow-[0_0_18px_var(--accent-glow)]' : 'text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]')}><Icon size={16} aria-hidden="true" /><span>{item.label}</span></Link>
            })}
            {visibleNav.length === 0 ? <p className="px-3 py-8 text-center text-xs text-[var(--text-3)]">No admin tools found.</p> : null}
          </div>
        </nav>

        <div className="border-t border-[var(--border)] p-3">
          <Link href="/" className="flex min-h-10 items-center justify-center rounded-lg border border-[var(--border-2)] bg-[var(--surface-2)] px-3 text-xs font-bold text-[var(--text-2)] transition-colors hover:border-[var(--border-3)] hover:text-[var(--text-1)]">Return to SlipSurge</Link>
        </div>
      </aside>
    </>
  )
}

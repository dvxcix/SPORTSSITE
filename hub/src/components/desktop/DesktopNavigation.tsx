'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import {
  Activity, Bell, Bookmark, CloudSun, Coins, Compass, Crown, Flame,
  FlaskConical, Home, Link2, MessageCircle, MessagesSquare, Search,
  Settings2, Table2, TrendingUp, Users, Zap, ChartSpline, ChevronLeft,
  ChevronRight, type LucideIcon,
} from 'lucide-react'
import { useSidebarCollapsed } from '@/lib/useSidebarCollapsed'

type NavItem = { href: string; label: string; icon: LucideIcon; badge?: string }

const rail: NavItem[] = [
  { href: '/feed', label: 'Home', icon: Home },
  { href: '/dugout', label: 'Research', icon: FlaskConical },
  { href: '/channels', label: 'Surge Live', icon: MessagesSquare, badge: 'LIVE' },
  { href: '/picks', label: 'Picks', icon: TrendingUp },
]

const intelligence: NavItem[] = [
  { href: '/sports', label: 'Live Scores', icon: Activity, badge: 'LIVE' },
  { href: '/dugout', label: 'The Dugout', icon: FlaskConical },
  { href: '/batter-cost', label: 'Batter Cost', icon: Coins },
  { href: '/odds-terminal', label: 'Odds Terminal', icon: ChartSpline, badge: 'ULT' },
  { href: '/slate-breakdown', label: 'Slate Breakdown', icon: Table2 },
  { href: '/pitcher-report', label: 'Pitcher Report', icon: Compass },
  { href: '/weather-lab', label: 'Weather Lab', icon: CloudSun },
  { href: '/synergy', label: 'Synergy', icon: Link2 },
  { href: '/daily-recap', label: 'Daily Recap', icon: Flame },
]

const community: NavItem[] = [
  { href: '/feed', label: 'Community Feed', icon: Home },
  { href: '/channels', label: 'Live Channels', icon: Zap, badge: 'DESKTOP' },
  { href: '/messages', label: 'Direct Messages', icon: MessageCircle },
  { href: '/groups', label: 'Groups', icon: Users },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/bookmarks', label: 'Saved', icon: Bookmark },
]

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function DesktopNavigation() {
  const pathname = usePathname()
  const { profile } = useAuth()
  const { collapsed, toggle } = useSidebarCollapsed()
  const channelsWorkspace = pathname.startsWith('/channels')
  const contextCollapsed = collapsed && !channelsWorkspace
  const currentSection = pathname.startsWith('/messages') || pathname.startsWith('/groups') || pathname.startsWith('/notifications')
    ? 'Community'
    : 'Intelligence'
  const items = currentSection === 'Community' ? community : intelligence
  const displayName = profile?.display_name || profile?.username || 'SlipSurge member'
  const initials = displayName.slice(0, 2).toUpperCase()

  return (
    <aside className="ss-desktop-navigation" data-channel-workspace={channelsWorkspace} data-collapsed={contextCollapsed}>
      <div className="ss-desktop-app-rail">
        <Link className="ss-desktop-rail-logo" href="/feed" aria-label="SlipSurge home">
          <img src="/logo.png" alt="" />
        </Link>
        <nav aria-label="Desktop workspaces">
          {rail.map(item => {
            const Icon = item.icon
            const active = isActive(pathname, item.href)
            return (
              <Link key={item.href} href={item.href} data-active={active} title={item.label} aria-label={item.label}>
                <Icon size={19} />
                {item.badge && <i>{item.badge === 'LIVE' ? '' : item.badge}</i>}
              </Link>
            )
          })}
        </nav>
        <div className="ss-desktop-rail-bottom">
          <Link href="/search" title="Search" aria-label="Search"><Search size={18} /></Link>
          <Link href="/notifications" title="Notifications" aria-label="Notifications"><Bell size={18} /></Link>
          <Link href="/settings" title="Settings" aria-label="Settings"><Settings2 size={18} /></Link>
        </div>
      </div>

      {!channelsWorkspace && (
        <div className="ss-desktop-context-nav">
          <header>
            <div><span>SLIPSURGE DESKTOP</span><strong>{currentSection}</strong></div>
            <Link href="/pricing" title="Upgrade"><Crown size={15} /></Link>
          </header>
          <button className="ss-desktop-context-toggle" type="button" onClick={toggle} aria-label={contextCollapsed ? 'Expand navigation' : 'Collapse navigation'} title={contextCollapsed ? 'Expand navigation' : 'Collapse navigation'}>
            {contextCollapsed ? <ChevronRight size={14} /> : <><ChevronLeft size={14} /><span>Collapse</span></>}
          </button>
          <div className="ss-desktop-context-label">WORKSPACE</div>
          <nav aria-label={`${currentSection} navigation`}>
            {items.map(item => {
              const Icon = item.icon
              const active = isActive(pathname, item.href)
              return (
                <Link key={item.href} href={item.href} data-active={active}>
                  <Icon size={15} />
                  <span>{item.label}</span>
                  {item.badge && <em>{item.badge}</em>}
                </Link>
              )
            })}
          </nav>
          <div className="ss-desktop-account-card">
            <Link href={profile?.username ? `/profile/${profile.username}` : '/settings'} className="ss-desktop-avatar">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : <span>{initials}</span>}
            </Link>
            <div><strong>{displayName}</strong><span>{profile?.tier || 'free'} workspace</span></div>
            <Link href="/settings" aria-label="Account settings"><Settings2 size={14} /></Link>
          </div>
        </div>
      )}
    </aside>
  )
}

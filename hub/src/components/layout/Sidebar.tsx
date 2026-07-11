'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, TrendingUp, MessageCircle, Users, Search, Compass,
  Bookmark, MessageSquare, Calendar, BookOpen, ShoppingBag, Zap,
  LayoutGrid, Bell, Star, Trophy, Activity, FlaskConical, Sparkles, CloudSun, Crosshair
} from 'lucide-react'

// MLB league logo, hotlinked from ESPN's CDN — same pattern the rest of the
// app already uses for team logos (mlbstatic.com) rather than self-hosting.
const MLB_LOGO_URL = 'https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png'

const nav = [
  { href: '/feed',        icon: Home,          label: 'Feed' },
  { href: '/explore',     icon: Compass,       label: 'Explore' },
  { href: '/search',      icon: Search,        label: 'Search' },
  { href: '/picks',       icon: TrendingUp,    label: 'Picks' },
  { href: '/pro',         icon: Sparkles,      label: 'Go Pro' },
  { href: '/messages',    icon: MessageCircle, label: 'Messages' },
  { href: '/notifications',icon: Bell,         label: 'Notifications' },
  null, // divider
  // A labeled section (logo header, no per-item red "MLB" badge needed
  // anymore) so these read as a distinct tool group, not just more generic
  // pages mixed in with Groups/Explore/etc.
  { section: 'MLB', logo: MLB_LOGO_URL },
  { href: '/sports',      icon: Activity,      label: 'Live Scores', badge: 'LIVE' },
  { href: '/dugout',      icon: FlaskConical,  label: 'The Dugout' },
  { href: '/weather-lab', icon: CloudSun,      label: 'Weather Lab' },
  { href: '/pitcher-report', icon: Crosshair,  label: 'Pitcher Report' },
  null,
  { href: '/groups',      icon: Users,         label: 'Groups' },
  { href: '/pages',       icon: LayoutGrid,    label: 'Pages' },
  { href: '/events',      icon: Calendar,      label: 'Events' },
  { href: '/blog',        icon: BookOpen,      label: 'Blog' },
  { href: '/forum',       icon: MessageSquare, label: 'Forum' },
  { href: '/marketplace', icon: ShoppingBag,   label: 'Marketplace' },
  { href: '/channels',    icon: Zap,           label: 'Channels' },
  null,
  { href: '/leaderboard', icon: Trophy,        label: 'Leaderboard' },
  { href: '/creators',    icon: Star,          label: 'Creators' },
  { href: '/bookmarks',   icon: Bookmark,      label: 'Bookmarks' },
]

export function Sidebar() {
  const path = usePathname()

  function active(href: string) {
    if (href === '/feed') return path === '/feed'
    return path === href || path.startsWith(href + '/')
  }

  return (
    <aside style={{
      width: 'var(--sidebar-w)',
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      height: '100vh',
      position: 'sticky',
      top: 0,
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      zIndex: 30,
    }}>
      {/* Logo */}
      <Link href="/feed" style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '20px 16px 18px',
        borderBottom: '1px solid var(--border)',
        textDecoration: 'none',
      }}>
        <img src="/logo.png" alt="SlipSurge" style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
            Slip<span style={{ color: 'var(--accent)' }}>Surge</span>
          </div>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', marginTop: -1 }}>
            SPORTS · PICKS · SOCIAL
          </div>
        </div>
      </Link>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {nav.map((item, i) => {
          if (item === null) {
            return <div key={`div-${i}`} style={{ height: 1, background: 'var(--border)', margin: '6px 8px' }} />
          }
          if ('section' in item) {
            return (
              <div key={`section-${item.section}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 10px 4px' }}>
                <img src={item.logo} alt={item.section} style={{ width: 14, height: 14, objectFit: 'contain', flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em' }}>{item.section}</span>
              </div>
            )
          }
          const Icon = item.icon
          const isActive = active(item.href)
          return (
            <Link key={item.href} href={item.href} className="nav-item" data-active={isActive} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 8,
              fontSize: 13, fontWeight: isActive ? 700 : 500,
              color: isActive ? 'var(--accent)' : 'var(--text-2)',
              background: isActive ? 'var(--accent-dim)' : 'transparent',
              transition: 'all 130ms',
              textDecoration: 'none',
              userSelect: 'none',
            }}
            onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; } }}
            onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; } }}>
              <Icon size={16} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7 }} />
              <span style={{ flex: 1, lineHeight: 1.2 }}>{item.label}</span>
              {item.badge && (
                <span style={{
                  fontSize: 9, fontWeight: 900, letterSpacing: '0.04em',
                  background: 'var(--red)', color: '#fff',
                  padding: '2px 5px', borderRadius: 99,
                }}>
                  {item.badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom: Settings */}
      <div style={{ padding: '8px', borderTop: '1px solid var(--border)' }}>
        <Link href="/settings" style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 10px', borderRadius: 8,
          fontSize: 12, fontWeight: 500, color: 'var(--text-3)',
          textDecoration: 'none', transition: 'all 130ms',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}>
          <span>⚙</span>
          <span>Settings & Help</span>
        </Link>
      </div>
    </aside>
  )
}

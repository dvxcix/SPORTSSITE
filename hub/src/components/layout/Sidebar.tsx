'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Home, TrendingUp, MessageCircle, Users, Search, Compass,
  Bookmark, MessageSquare, Calendar, BookOpen, ShoppingBag, Zap,
  LayoutGrid, Bell, Star, Trophy, Activity, FlaskConical, Sparkles, CloudSun, Crosshair, Table2, Coins, X,
  type LucideIcon,
} from 'lucide-react'
import { fetchFeatureFlagsClient } from '@/lib/featureFlags'

// MLB league logo, hotlinked from ESPN's CDN — same pattern the rest of the
// app already uses for team logos (mlbstatic.com) rather than self-hosting.
const MLB_LOGO_URL = 'https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png'

type NavLink = {
  href: string; icon: LucideIcon; label: string
  flagKey?: string; badge?: string; badgeColor?: string; movingBorder?: boolean
}
type NavItem = NavLink | { section: string; logo: string } | null

const nav: NavItem[] = [
  { href: '/feed',        icon: Home,          label: 'Feed' },
  { href: '/explore',     icon: Compass,       label: 'Explore' },
  { href: '/search',      icon: Search,        label: 'Search' },
  { href: '/picks',       icon: TrendingUp,    label: 'Picks' },
  { href: '/pro',         icon: Sparkles,      label: 'Go Pro', flagKey: 'feature_pro_plan' },
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
  { href: '/slate-breakdown', icon: Table2,    label: 'Slate Breakdown' },
  { href: '/batter-cost', icon: Coins,         label: 'Batter Cost', movingBorder: true },
  null,
  { href: '/groups',      icon: Users,         label: 'Groups' },
  { href: '/pages',       icon: LayoutGrid,    label: 'Pages', flagKey: 'feature_pages' },
  { href: '/events',      icon: Calendar,      label: 'Events', flagKey: 'feature_events' },
  { href: '/blog',        icon: BookOpen,      label: 'Blog', flagKey: 'feature_blog' },
  { href: '/forum',       icon: MessageSquare, label: 'Forum', flagKey: 'feature_forum' },
  { href: '/marketplace', icon: ShoppingBag,   label: 'Marketplace', flagKey: 'feature_marketplace' },
  { href: '/channels',    icon: Zap,           label: 'Channels' },
  null,
  { href: '/leaderboard', icon: Trophy,        label: 'Leaderboard' },
  { href: '/creators',    icon: Star,          label: 'Creators' },
  { href: '/bookmarks',   icon: Bookmark,      label: 'Bookmarks' },
]

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const path = usePathname()
  // Beta launch default: assume the gated sections are off until the real
  // flags load, so testers don't see items flash on then disappear — matches
  // the site_settings rows we ship disabled by default.
  const [flags, setFlags] = useState<Record<string, boolean>>({
    feature_blog: false, feature_forum: false, feature_marketplace: false,
    feature_pages: false, feature_pro_plan: false, feature_events: false,
  })

  useEffect(() => {
    let cancelled = false
    fetchFeatureFlagsClient().then(f => { if (!cancelled) setFlags(f) })
    return () => { cancelled = true }
  }, [])

  // Tapping a nav link should close the drawer on mobile — otherwise the
  // new page loads underneath a sidebar that's still covering half the
  // screen until you notice and dismiss it yourself.
  useEffect(() => { onClose() }, [path]) // eslint-disable-line react-hooks/exhaustive-deps

  const visibleNav = nav.filter(item => !item || !('flagKey' in item) || !item.flagKey || flags[item.flagKey] !== false)

  function active(href: string) {
    if (href === '/feed') return path === '/feed'
    return path === href || path.startsWith(href + '/')
  }

  return (
    <>
      {/* Backdrop — mobile only, dismisses the drawer on tap outside it */}
      {open && (
        <div onClick={onClose} className="md:hidden fixed inset-0 z-40 bg-black/60" aria-hidden="true" />
      )}
      <aside
        // md:top-[var(--banner-h,0px)] instead of md:top-0 — SiteBanner sets
        // that custom property (0px when it's not showing) so this sticks
        // right below the banner instead of overlapping it once scrolled.
        className={`fixed inset-y-0 left-0 z-50 md:sticky md:top-[var(--banner-h,0px)] md:z-30 md:translate-x-0 transition-transform duration-200 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{
          width: 'var(--sidebar-w)',
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          // Deliberately still 100vh, not calc(100vh - banner-h) — that
          // calc would be correct for the desktop sticky case but wrong for
          // the mobile drawer (fixed, top:0 unchanged, banner sits above
          // it) which would then fall short of the viewport bottom by the
          // banner's height. 100vh just means the sticky desktop sidebar's
          // own box extends a few tens of px past the viewport bottom when
          // a banner is showing — invisible/harmless, unlike the mobile gap.
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
      {/* Logo */}
      <Link href="/feed" style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '20px 16px 18px',
        borderBottom: '1px solid var(--border)',
        textDecoration: 'none',
      }}>
        <img src="/logo.png" alt="SlipSurge" style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
            Slip<span style={{ color: 'var(--accent)' }}>Surge</span>
          </div>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', marginTop: -1 }}>
            SPORTS · PICKS · SOCIAL
          </div>
        </div>
        <button
          onClick={e => { e.preventDefault(); onClose() }}
          className="md:hidden"
          style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4, flexShrink: 0 }}
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </Link>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {visibleNav.map((item, i) => {
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
          // A plain 'transparent' idle background would let the glow ring's
          // conic-gradient pseudo-element show through the whole button
          // instead of just its border — glowing items need an opaque idle
          // fill so only the 1.5px ring around the edge reads as lit.
          const idleBg = item.movingBorder ? 'var(--surface)' : 'transparent'
          const link = (
            <Link key={item.href} href={item.href} className="nav-item" data-active={isActive} style={{
              position: 'relative', display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: item.movingBorder ? 7 : 8,
              fontSize: 13, fontWeight: isActive ? 700 : 500,
              color: isActive ? 'var(--accent)' : 'var(--text-2)',
              background: isActive ? 'var(--accent-dim)' : idleBg,
              transition: 'all 130ms',
              textDecoration: 'none',
              userSelect: 'none',
            }}
            onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; } }}
            onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = idleBg; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; } }}>
              <Icon size={16} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7 }} />
              <span style={{ flex: 1, lineHeight: 1.2 }}>{item.label}</span>
              {item.badge && (
                <span style={{
                  fontSize: 9, fontWeight: 900, letterSpacing: '0.04em',
                  background: item.badgeColor ?? 'var(--red)', color: '#fff',
                  padding: '2px 5px', borderRadius: 99,
                }}>
                  {item.badge}
                </span>
              )}
            </Link>
          )
          // Golden moving-border treatment (à la Aceternity's Moving Border
          // component) to flag the newest MLB tool without yet another text
          // "NEW" badge — a rotating conic-gradient sits behind the item,
          // clipped by overflow:hidden so only a thin ring shows past the
          // item's own opaque idle background.
          if (item.movingBorder) {
            return (
              <div key={`glow-${item.href}`} className="mb-glow-wrap">
                {link}
              </div>
            )
          }
          return link
        })}
      </nav>
      <style>{`
        .mb-glow-wrap { position: relative; border-radius: 8px; padding: 1.5px; overflow: hidden; }
        .mb-glow-wrap::before {
          content: '';
          position: absolute;
          inset: -100%;
          background: conic-gradient(from 0deg, transparent 0deg, transparent 265deg, #f5d576 295deg, #fff6d6 320deg, #f5d576 345deg, transparent 360deg);
          animation: mb-glow-spin 3s linear infinite;
        }
        @keyframes mb-glow-spin { to { transform: rotate(360deg); } }
      `}</style>

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
    </>
  )
}

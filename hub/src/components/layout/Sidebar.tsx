'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Home, TrendingUp, MessageCircle, Users, Search, Compass,
  Bookmark, MessageSquare, Calendar, BookOpen, ShoppingBag, Zap,
  LayoutGrid, Bell, Star, Trophy, Activity, FlaskConical, Sparkles, CloudSun, Crosshair, Table2, Coins, Megaphone, Link2, X, Flame,
  ChevronLeft, ChevronRight, ChartSpline,
  type LucideIcon,
} from 'lucide-react'
import { fetchFeatureFlagsClient } from '@/lib/featureFlags'
import { useSidebarCollapsed } from '@/lib/useSidebarCollapsed'
import { MovingBorderGlow } from './MovingBorderGlow'
import { useAuth } from '@/context/AuthContext'
import { effectiveTier, hasFullAccessOverride, hasTierAccess, type Tier } from '@slipsurge/core/tiers'

// MLB league logo, hotlinked from ESPN's CDN — same pattern the rest of the
// app already uses for team logos (mlbstatic.com) rather than self-hosting.
const MLB_LOGO_URL = 'https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png'

// Mirrors --sidebar-w / --sidebar-w-collapsed in globals.css — kept as
// plain numbers here because the collapse toggle transitions this value,
// and animating between two var() references (rather than one) doesn't
// transition reliably (confirmed live); those CSS vars remain the source
// of truth for anything reading the sidebar's width statically.
const SIDEBAR_W = 220
const SIDEBAR_W_COLLAPSED = 64

type NavLink = {
  href: string; icon: LucideIcon; label: string
  flagKey?: string; badge?: string; badgeColor?: string; movingBorder?: boolean; ultimateOnly?: boolean
}
type NavItem = NavLink | { section: string; logo?: string } | null

const nav: NavItem[] = [
  { section: 'Community' },
  { href: '/feed',        icon: Home,          label: 'Feed' },
  { href: '/explore',     icon: Compass,       label: 'Explore' },
  { href: '/search',      icon: Search,        label: 'Search' },
  { href: '/picks',       icon: TrendingUp,    label: 'Picks' },
  { href: '/messages',    icon: MessageCircle, label: 'Messages' },
  { href: '/notifications',icon: Bell,         label: 'Notifications' },
  null, // divider
  // A labeled section (logo header, no per-item red "MLB" badge needed
  // anymore) so these read as a distinct tool group, not just more generic
  // pages mixed in with Groups/Explore/etc.
  { section: 'MLB Research', logo: MLB_LOGO_URL },
  { href: '/sports',      icon: Activity,      label: 'Live Scores', badge: 'LIVE' },
  { href: '/dugout',      icon: FlaskConical,  label: 'The Dugout' },
  { href: '/weather-lab', icon: CloudSun,      label: 'Weather Lab' },
  { href: '/pitcher-report', icon: Crosshair,  label: 'Pitcher Report' },
  { href: '/slate-breakdown', icon: Table2,    label: 'Slate Breakdown' },
  { href: '/batter-cost', icon: Coins,         label: 'Batter Cost' },
  { href: '/odds-terminal', icon: ChartSpline, label: 'Odds Terminal', badge: 'ULT' },
  { href: '/synergy',     icon: Link2,         label: 'Synergy' },
  { href: '/daily-recap', icon: Flame,         label: 'Daily Recap' },
  { href: '/the-public',  icon: Megaphone,     label: 'The Public', movingBorder: true },
  null,
  { section: 'Connect' },
  { href: '/groups',      icon: Users,         label: 'Groups' },
  { href: '/pages',       icon: LayoutGrid,    label: 'Pages', flagKey: 'feature_pages' },
  { href: '/events',      icon: Calendar,      label: 'Events', flagKey: 'feature_events' },
  { href: '/blog',        icon: BookOpen,      label: 'Blog', flagKey: 'feature_blog' },
  { href: '/forum',       icon: MessageSquare, label: 'Forum', flagKey: 'feature_forum' },
  { href: '/marketplace', icon: ShoppingBag,   label: 'Matrix Marketplace', badge: 'ULT', ultimateOnly: true },
  { href: '/channels',    icon: Zap,           label: 'Channels' },
  null,
  { section: 'Discover' },
  { href: '/leaderboard', icon: Trophy,        label: 'Leaderboard' },
  { href: '/creators',    icon: Star,          label: 'Creators' },
  { href: '/bookmarks',   icon: Bookmark,      label: 'Bookmarks' },
  { href: '/pricing',     icon: Sparkles,      label: 'Memberships' },
]

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const path = usePathname()
  const { profile } = useAuth()
  const { collapsed, toggle: toggleCollapsed } = useSidebarCollapsed()
  // The persisted collapse preference is desktop/tablet-only — if it's on
  // and the user then opens the mobile drawer (e.g. after resizing down),
  // the drawer should still show full nav, not a useless icon rail they
  // can't reach the toggle button for (it's hidden on mobile).
  const isCollapsed = collapsed && !open
  // Beta launch default: assume the gated sections are off until the real
  // flags load, so testers don't see items flash on then disappear — matches
  // the site_settings rows we ship disabled by default.
  const [flags, setFlags] = useState<Record<string, boolean>>({
    feature_blog: false, feature_forum: false, feature_marketplace: false,
    feature_pages: false, feature_events: false,
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

  // Keep the page behind the mobile drawer stationary while it is open.
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [open])

  const profileTier = effectiveTier((profile?.tier as Tier | undefined) ?? 'free', profile?.discord_advanced_claimed, profile?.admin_granted_tier as Tier | null)
  const hasUltimate = !!profile && (hasFullAccessOverride(profile.account_type, profile.beta_access_active) || hasTierAccess(profileTier, 'ultimate'))
  const visibleNav = nav.filter(item => {
    if (!item || !('href' in item)) return true
    if (item.ultimateOnly && !hasUltimate) return false
    return !item.flagKey || flags[item.flagKey] !== false
  })

  function active(href: string) {
    if (href === '/feed') return path === '/feed'
    return path === href || path.startsWith(href + '/')
  }

  return (
    <>
      {/* Backdrop — mobile only, dismisses the drawer on tap outside it */}
      {open && (
        <div onClick={onClose} className="ss-mobile-sidebar-backdrop md:hidden fixed inset-0 bg-black/60" aria-hidden="true" />
      )}
      <aside
        // md:top-[var(--banner-h,0px)] instead of md:top-0 — SiteBanner sets
        // that custom property (0px when it's not showing) so this sticks
        // right below the banner instead of overlapping it once scrolled.
        className={`ss-site-sidebar fixed inset-y-0 left-0 z-50 md:sticky md:top-[var(--banner-h,0px)] md:z-30 md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{
          // Confirmed live: a `width` transition on this element never
          // resolves — it commits the inline style and the DOM value
          // instantly but getComputedStyle/getBoundingClientRect stay
          // pinned to the pre-toggle width indefinitely (reflow, resize,
          // and scroll events don't unstick it either). That reproduced
          // identically whether width referenced CSS custom properties or
          // plain numbers, so it's specific to `position: sticky` + a
          // `width` transition on this element, not the value source.
          // Collapse/expand snaps instantly instead; only `transform`
          // (the mobile drawer's slide) stays animated.
          width: isCollapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W,
          transitionProperty: 'transform',
          transitionDuration: '200ms',
          transitionTimingFunction: 'ease-out',
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          // Deliberately still 100vh, not calc(100vh - banner-h) — that
          // calc would be correct for the desktop sticky case but wrong for
          // the mobile drawer (fixed, top:0 unchanged, banner sits above
          // it) which would then fall short of the viewport bottom by the
          // banner's height. 100vh just means the sticky desktop sidebar's
          // own box extends a few tens of px past the viewport bottom when
          // a banner is showing — invisible/harmless, unlike the mobile gap.
          height: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
      {/* Logo */}
      <Link href="/feed" className="ss-sidebar-brand" style={{
        display: 'flex', alignItems: 'center', gap: 10,
        justifyContent: isCollapsed ? 'center' : 'flex-start',
        padding: isCollapsed ? '20px 8px 18px' : '20px 16px 18px',
        borderBottom: '1px solid var(--border)',
        textDecoration: 'none',
      }}>
        <Image src="/logo.png" alt="SlipSurge" width={32} height={32} priority style={{ objectFit: 'contain', flexShrink: 0 }} />
        {!isCollapsed && (
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
              Slip<span style={{ color: 'var(--accent)' }}>Surge</span>
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', marginTop: -1 }}>
              SPORTS | PICKS | SOCIAL
            </div>
          </div>
        )}
        {!isCollapsed && (
          <button
            onClick={e => { e.preventDefault(); onClose() }}
            className="md:hidden"
            style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4, flexShrink: 0 }}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        )}
      </Link>

      {/* Collapse toggle — desktop/tablet only, mirrors the mobile X button's
          spot in the flow but lives in its own row since collapsing needs to
          stay reachable even when the logo row above is icon-only. */}
      <button
        onClick={toggleCollapsed}
        className="hidden md:flex"
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        style={{
          alignItems: 'center', gap: 6,
          justifyContent: isCollapsed ? 'center' : 'flex-end',
          padding: '6px 12px 10px',
          background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer',
          borderBottom: '1px solid var(--border)', marginBottom: 6,
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)' }}
      >
        {isCollapsed ? <ChevronRight size={14} /> : (
          <>
            <ChevronLeft size={14} />
            <span style={{ fontSize: 11, fontWeight: 600 }}>Collapse</span>
          </>
        )}
      </button>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {visibleNav.map((item, i) => {
          if (item === null) {
            return <div key={`div-${i}`} style={{ height: 1, background: 'var(--border)', margin: '6px 8px' }} />
          }
          if ('section' in item) {
            return (
              <div key={`section-${item.section}`} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                padding: isCollapsed ? '10px 0 4px' : '10px 10px 4px',
              }}>
                {item.logo
                  ? <img src={item.logo} alt="" title={isCollapsed ? item.section : undefined} style={{ width: 14, height: 14, objectFit: 'contain', flexShrink: 0 }} />
                  : <span aria-hidden="true" style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent-glow)', flexShrink: 0 }} />}
                {!isCollapsed && <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em' }}>{item.section}</span>}
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
            <Link key={item.href} href={item.href} className="nav-item" data-active={isActive} title={isCollapsed ? item.label : undefined} style={{
              position: 'relative', display: 'flex', alignItems: 'center', gap: isCollapsed ? 0 : 10,
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              padding: isCollapsed ? '8px' : '8px 10px', borderRadius: item.movingBorder ? 7 : 8,
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
              {!isCollapsed && <span style={{ flex: 1, lineHeight: 1.2 }}>{item.label}</span>}
              {!isCollapsed && item.badge && (
                <span style={{
                  fontSize: 9, fontWeight: 900, letterSpacing: '0.04em',
                  background: item.badgeColor ?? 'var(--red)', color: '#fff',
                  padding: '2px 5px', borderRadius: 99,
                }}>
                  {item.badge}
                </span>
              )}
              {isCollapsed && item.badge && (
                <span style={{
                  position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: '50%',
                  background: item.badgeColor ?? 'var(--red)',
                }} aria-hidden="true" />
              )}
            </Link>
          )
          // Golden moving-border treatment (Aceternity's actual technique,
          // see MovingBorderGlow.tsx) to flag the newest MLB tool without
          // yet another text "NEW" badge — a small point of light travels
          // around the item's own outline continuously.
          if (item.movingBorder) {
            return (
              <MovingBorderGlow key={`glow-${item.href}`} borderRadius={8}>
                {link}
              </MovingBorderGlow>
            )
          }
          return link
        })}
      </nav>

      {/* Bottom: Settings */}
      <div style={{ padding: '8px', borderTop: '1px solid var(--border)' }}>
        <Link href="/settings" title={isCollapsed ? 'Settings & Help' : undefined} style={{
          display: 'flex', alignItems: 'center', gap: isCollapsed ? 0 : 10,
          justifyContent: isCollapsed ? 'center' : 'flex-start',
          padding: isCollapsed ? '8px' : '8px 10px', borderRadius: 8,
          fontSize: 12, fontWeight: 500, color: 'var(--text-3)',
          textDecoration: 'none', transition: 'all 130ms',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}>
          <span>⚙</span>
          {!isCollapsed && <span>Settings & Help</span>}
        </Link>
      </div>
      </aside>
    </>
  )
}

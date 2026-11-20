'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  Home, TrendingUp, MessageCircle, Users, Search, Compass,
  Bookmark, Calendar, BookOpen, ShoppingBag,
  LayoutGrid, Bell, Star, Trophy, Activity, FlaskConical, Sparkles, CloudSun, Crosshair, Table2, Coins, Megaphone, Link2, X, Flame,
  ChevronLeft, ChevronRight, ChartSpline, Layers3, Award, History, LockKeyhole, Settings,
  type LucideIcon,
} from 'lucide-react'
import { fetchFeatureFlagsClient } from '@/lib/featureFlags'
import { useSidebarCollapsed } from '@/lib/useSidebarCollapsed'
import { SafeImage } from '@/components/ui/SafeImage'
import { useAuth } from '@/context/AuthContext'
import { useNflAccess } from '@/lib/useNflAccess'
import { effectiveTier, hasFullAccessOverride, hasTierAccess, type Tier } from '@slipsurge/core/tiers'
import { useResearchSport } from './useResearchSport'
import { ResearchSportSwitcher } from './ResearchSportSwitcher'
import { researchToolActive, researchNavigationHref, resolveResearchSport, researchSportForPath } from './researchNavigation'
import { hasNbaAccess } from '@/lib/nbaAccessPolicy'
import { nbaResearchNavigation } from './navigationConfig'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'
import { UpdateCenter } from './UpdateCenter'
import { ResearchNavGroup, researchToolGroup } from './ResearchNavGroup'
import { AccountMenu } from './AccountMenu'
import navigationStyles from './researchNavigation.module.css'

// MLB league logo, hotlinked from ESPN's CDN — same pattern the rest of the
// app already uses for team logos (mlbstatic.com) rather than self-hosting.
const MLB_LOGO_URL = 'https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png'
const NFL_LOGO_URL = 'https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png'
const NBA_LOGO_URL = 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png'

// Mirrors --sidebar-w / --sidebar-w-collapsed in globals.css — kept as
// plain numbers here because the collapse toggle transitions this value,
// and animating between two var() references (rather than one) doesn't
// transition reliably (confirmed live); those CSS vars remain the source
// of truth for anything reading the sidebar's width statically.
const SIDEBAR_W = 220
const SIDEBAR_W_COLLAPSED = 64
const hydrationSubscribe=()=>()=>{}

type NavLink = {
  href: string; icon: LucideIcon; label: string
  flagKey?: string; badge?: string; badgeColor?: string; ultimateOnly?: boolean; nflOnly?: boolean; nbaOnly?: boolean
}
type NavItem = NavLink | { section: string; logo?: string; nflOnly?: boolean; nbaOnly?: boolean } | null

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
  { href: '/dugout',      icon: FlaskConical,  label: 'The Dugout' },
  { href: '/weather-lab', icon: CloudSun,      label: 'Weather Lab' },
  { href: '/pitcher-report', icon: Crosshair,  label: 'Pitcher Report' },
  { href: '/slate-breakdown', icon: Table2,    label: 'Slate Breakdown' },
  { href: '/batter-cost', icon: Coins,         label: 'Batter Cost' },
  { href: '/odds-terminal', icon: ChartSpline, label: 'Odds Terminal' },
  { href: '/synergy',     icon: Link2,         label: 'Synergy' },
  { href: '/daily-recap', icon: Flame,         label: 'Daily Recap' },
  { href: '/spray-charts', icon: Crosshair,     label: 'Spray Charts', ultimateOnly: true },
  { href: '/the-public',  icon: Megaphone,     label: 'The Public' },
  null,
  { section: 'NFL Research', logo: NFL_LOGO_URL, nflOnly: true },
  { href: '/the-sideline', icon: Trophy, label: 'The Sideline', nflOnly: true },
  { href: '/the-sideline?view=odds-board', icon: Table2, label: 'Odds Board', nflOnly: true },
  { href: '/the-sideline?mode=cheatsheets', icon: Table2, label: 'Cheatsheets', nflOnly: true },
  { href: '/the-sideline?mode=public', icon: Megaphone, label: 'The Public', nflOnly: true },
  { href: '/the-sideline?mode=markets', icon: ChartSpline, label: 'Sportsbooks', nflOnly: true },
  { href: '/the-sideline?mode=research', icon: Crosshair, label: 'Matchup Lab', nflOnly: true },
  null,
  { section: 'NBA Research', logo: NBA_LOGO_URL, nbaOnly: true },
  ...nbaResearchNavigation.map(item => ({ href: item.href, icon: item.icon, label: item.shortLabel ?? item.label, nbaOnly: true })),
  null,
  { section: 'Connect' },
  { href: '/sports',      icon: Activity,      label: 'Live Scores', badge: 'LIVE' },
  { href: '/community',   icon: Users,         label: 'Community' },
  { href: '/pages',       icon: LayoutGrid,    label: 'Pages', flagKey: 'feature_pages' },
  { href: '/events',      icon: Calendar,      label: 'Events', flagKey: 'feature_events' },
  { href: '/blog',        icon: BookOpen,      label: 'Blog', flagKey: 'feature_blog' },
  { href: '/marketplace', icon: ShoppingBag,   label: 'Matrix Marketplace', ultimateOnly: true },
  null,
  { section: 'Discover' },
  { href: '/leaderboard', icon: Trophy,        label: 'Leaderboard' },
  { href: '/missions',    icon: Award,         label: 'Missions' },
  { href: '/activity',    icon: History,       label: 'Activity Replay' },
  { href: '/creators',    icon: Star,          label: 'Creators' },
  { href: '/bookmarks',   icon: Bookmark,      label: 'Bookmarks' },
  { href: '/workspace',   icon: Layers3,       label: 'Research Workspace' },
  { href: '/pricing',     icon: Sparkles,      label: 'Memberships' },
]

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const path = usePathname()
  const searchParams = useSearchParams()
  const sidelineMode = searchParams.get('mode') ?? ''
  const paintView = searchParams.get('view') ?? ''
  const { profile } = useAuth()
  const hydrated=useSyncExternalStore(hydrationSubscribe,()=>true,()=>false)
  const { allowed: nflAllowed } = useNflAccess()
  const nflAccess=hydrated&&nflAllowed
  const { sport, chooseSport } = useResearchSport(path)
  const nbaAccess = hydrated&&hasNbaAccess(profile)
  const mlbAccess = !MLB_HIBERNATING || hydrated&&profile?.account_type === 'admin'
  const selectedSport = resolveResearchSport(sport, nflAccess, mlbAccess)
  const [menuSearch, setMenuSearch] = useState('')
  const drawerRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
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
  useEffect(() => { onClose() }, [path, sidelineMode, paintView]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the page behind the mobile drawer stationary while it is open.
  useEffect(() => {
    if (!open) return
    const mobileQuery = window.matchMedia('(max-width: 767px), (max-width: 1024px) and (any-pointer: coarse)')
    const previousOverflow = document.body.style.overflow
    let locked = false

    const syncScrollLock = () => {
      if (mobileQuery.matches && !locked) {
        document.body.style.overflow = 'hidden'
        locked = true
      } else if (!mobileQuery.matches && locked) {
        document.body.style.overflow = previousOverflow
        locked = false
      }
    }

    syncScrollLock()
    mobileQuery.addEventListener('change', syncScrollLock)
    return () => {
      mobileQuery.removeEventListener('change', syncScrollLock)
      if (locked) document.body.style.overflow = previousOverflow
    }
  }, [open])

  useEffect(() => {
    if (!open || !window.matchMedia('(max-width: 767px), (max-width: 1024px) and (any-pointer: coarse)').matches) return
    const previous = document.activeElement as HTMLElement | null
    drawerRef.current?.querySelector<HTMLButtonElement>('[aria-label="Close menu"]')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return }
      if (event.key !== 'Tab') return
      const focusable = Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input') ?? []).filter(element => element.getClientRects().length > 0)
      const first = focusable[0], last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); previous?.focus() }
  }, [open])

  const profileTier = effectiveTier((profile?.tier as Tier | undefined) ?? 'free', profile?.discord_advanced_claimed, profile?.admin_granted_tier as Tier | null)
  const hasUltimate = hydrated && !!profile && (hasFullAccessOverride(profile.account_type, profile.beta_access_active) || hasTierAccess(profileTier, 'ultimate'))
  const permittedNav = nav.filter(item => {
    if (!item) return true
    if (!mlbAccess && (('section' in item && item.section === 'MLB Research') || ('href' in item && researchSportForPath(item.href.split('?')[0]) === 'mlb'))) return false
    if (item.nflOnly && !nflAccess) return false
    if (!('href' in item)) return true
    if (item.ultimateOnly && !hasUltimate) return false
    return !item.flagKey || flags[item.flagKey] !== false
  })
  const groups: { heading: Extract<NavItem, { section: string }>; links: NavLink[] }[] = []
  for (const item of permittedNav) {
    if (!item) continue
    if ('section' in item) groups.push({ heading: item, links: [] })
    else groups.at(-1)?.links.push(item)
  }
  const query = menuSearch.trim().toLowerCase()
  const orderedGroups = [...groups.filter(group => group.heading.section === selectedSport.toUpperCase() + ' Research'), ...groups.filter(group => group.heading.section !== selectedSport.toUpperCase() + ' Research')]
  const visibleNav: NavItem[] = orderedGroups.flatMap(group => {
    if (!query && group.heading.logo && group.heading.section !== selectedSport.toUpperCase() + ' Research') return []
    const links = query ? group.links.filter(link => (link.label + ' ' + group.heading.section).toLowerCase().includes(query)) : group.links
    return links.length ? [group.heading, ...links] : []
  })

  function active(href: string) {
    return researchToolActive(href, path, searchParams)
  }

  const renderNavItem = (item: NavItem, i: number) => {
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
                  ? <SafeImage src={item.logo} alt="" title={isCollapsed && !item.nbaOnly ? item.section : undefined} style={{ width: 14, height: 14, objectFit: 'contain', flexShrink: 0 }} />
                  : <span aria-hidden="true" style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-3)', flexShrink: 0 }} />}
                {!isCollapsed && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{item.section}</span>}
              </div>
            )
          }
          const Icon = item.icon
          const locked = !!item.nbaOnly && !nbaAccess
          const isActive = !locked && active(item.href)
          const idleBg = 'transparent'
          const link = (
            <Link key={item.href} href={researchNavigationHref(item.href, path, searchParams, nbaAccess)} prefetch={false} className="nav-item" data-active={isActive} aria-current={isActive ? 'page' : undefined} aria-label={locked ? `${item.label} · Ultimate required` : isCollapsed ? item.label : undefined} title={!item.nbaOnly && isCollapsed ? item.label : undefined} style={{
              position: 'relative', display: 'flex', alignItems: 'center', gap: isCollapsed ? 0 : 10,
              minHeight: 36,
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              padding: isCollapsed ? '8px' : '8px 10px', borderRadius: 8,
              fontSize: 13, fontWeight: isActive ? 600 : 450,
              color: isActive ? 'var(--accent)' : 'var(--text-2)',
              background: isActive ? 'var(--accent-dim)' : idleBg,
              transition: 'all 130ms',
              textDecoration: 'none',
              userSelect: 'none',
            }}
            onClick={() => { setMenuSearch(''); onClose() }}
            onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; } }}
            onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = idleBg; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; } }}>
              <Icon size={16} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7 }} />
              {!isCollapsed && <span style={{ flex: 1, lineHeight: 1.2 }}>{item.label}</span>}
              {!isCollapsed && locked && <LockKeyhole size={13} className={navigationStyles.lock} aria-hidden="true" />}
              {!isCollapsed && item.badge && (
                <span style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                  background: item.badgeColor ?? 'var(--red)', color: 'var(--text-1)',
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
          return link
  }

  return (
    <>
      {/* Backdrop — mobile only, dismisses the drawer on tap outside it */}
      {open && (
        <div onClick={onClose} className="ss-mobile-sidebar-backdrop md:hidden fixed inset-0 bg-[var(--overlay)]" aria-hidden="true" />
      )}
      <aside
        ref={drawerRef}
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
          // Shared chrome accounts for the notice above both the sticky
          // desktop sidebar and the fixed phone drawer.
          height: 'var(--sidebar-height,100dvh)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
      <div className="ss-sidebar-brand" data-collapsed={isCollapsed}>
        <Link href="/feed" prefetch={false} onClick={onClose} aria-label="SlipSurge home"><Image src="/logo.png" alt="SlipSurge" width={40} height={40} priority style={{ objectFit: 'contain' }} /></Link>
        <button type="button" onClick={toggleCollapsed} className="ss-sidebar-collapse hidden md:flex" aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button>
        <button type="button" onClick={onClose} className="ss-sidebar-close md:hidden" aria-label="Close menu"><X size={18}/></button>
      </div>

      <div className={navigationStyles.controls}>
        <ResearchSportSwitcher sport={selectedSport} nflAccess={nflAccess} nbaAccess={nbaAccess} mlbAccess={mlbAccess} compact={isCollapsed} onChange={value => { chooseSport(value); setMenuSearch('') }} />
        {!isCollapsed && <label className={navigationStyles.search}><Search size={16} aria-hidden="true" /><input aria-label="Find a page or tool" placeholder="Find a page…" value={menuSearch} onChange={event => setMenuSearch(event.target.value)} />{menuSearch && <button type="button" aria-label="Clear menu search" onClick={() => setMenuSearch('')}><X size={14} /></button>}</label>}
      </div>
      {/* Remount the scroll area when switching sports so its first tool is visible. */}
      <nav key={selectedSport + query} aria-label="All navigation" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {!visibleNav.length && <p role="status" className={navigationStyles.empty}>No matching pages.</p>}
        {visibleNav.map((item, index) => {
          const group = item && 'href' in item ? researchToolGroup(item.href) : null
          if (!group || isCollapsed || query) return renderNavItem(item, index)
          if (visibleNav.findIndex(row => row && 'href' in row && researchToolGroup(row.href) === group) !== index) return null
          const members = visibleNav.filter((row): row is NavLink => !!row && 'href' in row && researchToolGroup(row.href) === group)
          return <ResearchNavGroup key={group} label={group} active={members.some(row => active(row.href))}>{members.map(renderNavItem)}</ResearchNavGroup>
        })}
      </nav>

      {/* Bottom: Settings */}
      <div className="ss-sidebar-footer">
        <UpdateCenter compact={isCollapsed} />
        <Link href="/settings" prefetch={false} className="ss-sidebar-settings" aria-label={isCollapsed ? 'Settings & Help' : undefined} style={{
          display: 'flex', alignItems: 'center', gap: isCollapsed ? 0 : 10,
          minHeight: 44,
          justifyContent: isCollapsed ? 'center' : 'flex-start',
          padding: isCollapsed ? '8px' : '8px 10px', borderRadius: 8,
          fontSize: 12, fontWeight: 500, color: 'var(--text-3)',
          textDecoration: 'none', transition: 'all 130ms',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}>
          <Settings size={16} aria-hidden="true" />
          {!isCollapsed && <span>Settings</span>}
        </Link>
        {hydrated && <AccountMenu placement="sidebar" compact={isCollapsed} onNavigate={onClose} />}
      </div>
      </aside>
    </>
  )
}

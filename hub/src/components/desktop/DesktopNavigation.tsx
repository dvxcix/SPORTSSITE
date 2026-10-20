'use client'

import Link from 'next/link'
import { useNflAccess } from '@/lib/useNflAccess'
import { isNflToolHref } from '@/lib/nflAccessPolicy'
import { hasNbaAccess, isNbaToolHref } from '@/lib/nbaAccessPolicy'
import { usePathname, useSearchParams } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { ChevronLeft, ChevronRight, Crown, LockKeyhole, Settings2 } from 'lucide-react'
import { useSidebarCollapsed } from '@/lib/useSidebarCollapsed'
import { effectiveTier, hasFullAccessOverride, hasTierAccess, type Tier } from '@slipsurge/core/tiers'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { SafeImage } from '@/components/ui/SafeImage'
import { accountQuickNavigation, getContextNavigation, primaryNavigation, routeMatches } from '@/components/layout/navigationConfig'
import { researchHome, researchSportForPath, resolveResearchSport, researchToolActive, researchNavigationHref } from '@/components/layout/researchNavigation'
import { useResearchSport } from '@/components/layout/useResearchSport'
import { ResearchSportSwitcher } from '@/components/layout/ResearchSportSwitcher'
import navigationStyles from '@/components/layout/researchNavigation.module.css'

export function DesktopNavigation() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { sport, chooseSport } = useResearchSport(pathname)
  const { allowed: nflAccess } = useNflAccess()
  const { profile, loading } = useAuth()
  const nbaAccess = hasNbaAccess(profile)
  const selectedSport = resolveResearchSport(sport, nflAccess)
  const { collapsed, toggle } = useSidebarCollapsed()
  const channelsWorkspace = pathname.startsWith('/channels')
  const contextCollapsed = collapsed && !channelsWorkspace
  const context = getContextNavigation(pathname)
  const profileTier = effectiveTier((profile?.tier as Tier | undefined) ?? 'free', profile?.discord_advanced_claimed, profile?.admin_granted_tier as Tier | null)
  const fullAccess = !!profile && hasFullAccessOverride(profile.account_type, profile.beta_access_active)
  const hasUltimate = !!profile && (fullAccess || hasTierAccess(profileTier, 'ultimate'))
  const items = context.items.filter(item => (isNbaToolHref(item.href) || !item.ultimateOnly || hasUltimate) && (!isNflToolHref(item.href) || nflAccess) && (context.area !== 'research' || !researchSportForPath(item.href.split('?')[0]) || researchSportForPath(item.href.split('?')[0]) === selectedSport))
  const displayName = profile?.display_name || profile?.username || (loading ? 'Loading account…' : 'Account unavailable')
  const accessLabel = !profile
    ? (loading ? 'Checking access…' : 'Refresh account')
    : profile.account_type === 'admin'
      ? 'Admin workspace'
      : fullAccess
        ? 'Full-access workspace'
        : `${profileTier.charAt(0).toUpperCase()}${profileTier.slice(1)} workspace`

  return (
    <aside className="ss-desktop-navigation" data-channel-workspace={channelsWorkspace} data-collapsed={contextCollapsed}>
      <div className="ss-desktop-app-rail">
        <Link className="ss-desktop-rail-logo" href="/feed" prefetch={false} aria-label="SlipSurge home">
          <SafeImage src="/logo.png" alt="" />
        </Link>
        <nav aria-label="Desktop workspaces">
          {primaryNavigation.map(item => {
            const Icon = item.icon
            const active = routeMatches(pathname, item)
            return (
              <Link key={item.href} href={item.label === 'Research' ? researchNavigationHref(researchHome(selectedSport, nflAccess, nbaAccess), pathname, searchParams, nbaAccess) : item.href} prefetch={false} data-active={active} title={item.label === 'Research' && selectedSport === 'nba' ? undefined : item.label} aria-label={item.label}>
                <Icon size={19} />
                {item.badge && <i>{item.badge === 'LIVE' ? '' : item.badge}</i>}
              </Link>
            )
          })}
        </nav>
        <div className="ss-desktop-rail-bottom">
          {accountQuickNavigation.map(item => {
            const Icon = item.icon
            return <Link key={item.href} href={item.href} prefetch={false} title={item.label} aria-label={item.label} data-active={routeMatches(pathname, item)}><Icon size={18} /></Link>
          })}
        </div>
      </div>

      {!channelsWorkspace && (
        <div className="ss-desktop-context-nav">
          <header>
            <div><span>{context.meta.eyebrow}</span><strong>{context.meta.label}</strong></div>
            <Link href="/pricing" prefetch={false} title="Upgrade"><Crown size={15} /></Link>
          </header>
          <button className="ss-desktop-context-toggle" type="button" onClick={toggle} aria-label={contextCollapsed ? 'Expand navigation' : 'Collapse navigation'} title={contextCollapsed ? 'Expand navigation' : 'Collapse navigation'}>
            {contextCollapsed ? <ChevronRight size={14} /> : <><ChevronLeft size={14} /><span>Collapse</span></>}
          </button>
          {context.area === 'research' && <ResearchSportSwitcher sport={selectedSport} onChange={chooseSport} nflAccess={nflAccess} nbaAccess={nbaAccess} compact={contextCollapsed} />}
          <div className={`ss-desktop-context-label ${navigationStyles.heading}`}>{context.area === 'research' ? selectedSport.toUpperCase() + ' RESEARCH' : 'WORKSPACE'}</div>
          <nav className={navigationStyles.desktopTools} aria-label={`${context.area === 'research' ? selectedSport.toUpperCase() + ' research' : context.meta.label} navigation`}>
            {items.map(item => {
              const Icon = item.icon
              const nbaTool = isNbaToolHref(item.href)
              const locked = nbaTool && !nbaAccess
              const active = !locked && ((isNflToolHref(item.href) || nbaTool) ? researchToolActive(item.href, pathname, searchParams) : routeMatches(pathname, item))
              const label = nbaTool ? item.shortLabel ?? item.label : item.label
              return (
                <Link key={item.href} href={researchNavigationHref(item.href, pathname, searchParams, nbaAccess)} prefetch={false} className={navigationStyles.toolLink} data-active={active} aria-current={active ? 'page' : undefined} aria-label={locked ? `${label} · Ultimate required` : label} title={nbaTool ? undefined : label}>
                  <Icon size={15} aria-hidden="true" />
                  <span>{label}</span>
                  {locked && !contextCollapsed && <LockKeyhole size={13} className={navigationStyles.lock} aria-hidden="true" />}
                  {item.badge && <em>{item.badge}</em>}
                </Link>
              )
            })}
          </nav>
          <div className="ss-desktop-account-card">
            <Link href={profile?.username ? `/profile/${profile.username}` : '/settings'} prefetch={false} className="ss-desktop-avatar">
              <MemberAvatar src={profile?.avatar_url} name={displayName} size={36} ringStyle={profile?.avatar_ring_style} ringColor={profile?.avatar_ring_color} />
            </Link>
            <div><strong>{displayName}</strong><span>{accessLabel}</span></div>
            <Link href="/settings" prefetch={false} aria-label="Account settings"><Settings2 size={14} /></Link>
          </div>
        </div>
      )}
    </aside>
  )
}

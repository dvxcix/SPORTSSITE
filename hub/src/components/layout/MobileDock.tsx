'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { Suspense, useState } from 'react'
import { cn } from '@/lib/utils'
import { primaryNavigation, routeMatches } from './navigationConfig'
import { useResearchSport } from './useResearchSport'
import { useNflAccess } from '@/lib/useNflAccess'
import { useAuth } from '@/context/AuthContext'
import { effectiveTier, hasFullAccessOverride, hasTierAccess, type Tier } from '@slipsurge/core/tiers'
import { SafeImage } from '@/components/ui/SafeImage'
import { MobileResearchPicker } from './MobileResearchPicker'
import styles from './mobileResearch.module.css'

export function MobileDock({ onMenuClick, hidden = false }: { onMenuClick: () => void; hidden?: boolean }) {
  const pathname = usePathname()
  const { sport, chooseSport } = useResearchSport(pathname)
  const { allowed: nflAccess } = useNflAccess()
  const { profile } = useAuth()
  const [pickerPath, setPickerPath] = useState<string | null>(null)
  const pickerOpen = pickerPath === pathname && !hidden
  const tier = effectiveTier((profile?.tier as Tier | undefined) ?? 'free', profile?.discord_advanced_claimed, profile?.admin_granted_tier as Tier | null)
  const hasUltimate = !!profile && (hasFullAccessOverride(profile.account_type, profile.beta_access_active) || hasTierAccess(tier, 'ultimate'))

  return (
    <>
    <nav className="ss-mobile-dock md:hidden" data-hidden={hidden} aria-label="Primary navigation" aria-hidden={hidden}>
      <div className="ss-mobile-dock-surface">
        {primaryNavigation.map((item) => {
          const Icon = item.icon
          const active = routeMatches(pathname, item)
          if (item.label === 'Research') return <button key={item.href} type="button" data-label="Research" className={cn('ss-mobile-dock-item', (active || pickerOpen) && 'is-active')} aria-label="Choose sport and research tools" aria-haspopup="dialog" aria-expanded={pickerOpen} onClick={() => setPickerPath(pathname)}>
            <span className={styles.marks}>{(nflAccess ? ['nfl','mlb'] : ['mlb']).map(league => <SafeImage key={league} src={`https://a.espncdn.com/i/teamlogos/leagues/500/${league}.png`} alt="" fallback={<span>{league.toUpperCase()}</span>} />)}</span>
            <span>Research</span>
          </button>
          return (
            <Link key={item.href} href={item.href} prefetch={false} className={cn('ss-mobile-dock-item', active && 'is-active')} aria-current={active ? 'page' : undefined} data-label={item.label}>
              <span className="ss-mobile-dock-icon"><Icon size={18} strokeWidth={active ? 2.4 : 1.9} aria-hidden="true" /></span>
              <span>{item.label}</span>
            </Link>
          )
        })}
        <button type="button" className="ss-mobile-dock-item" onClick={onMenuClick} aria-label="Open all navigation">
          <span className="ss-mobile-dock-icon"><Menu size={19} aria-hidden="true" /></span>
          <span>More</span>
        </button>
      </div>
    </nav>
    {pickerOpen && <Suspense fallback={null}><MobileResearchPicker path={pathname} sport={sport} nflAccess={nflAccess} hasUltimate={hasUltimate} onSport={chooseSport} onClose={() => setPickerPath(null)} /></Suspense>}
    </>
  )
}

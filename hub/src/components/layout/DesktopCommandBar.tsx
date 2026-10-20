'use client'

import Link from 'next/link'
import { useNflAccess } from '@/lib/useNflAccess'
import { useAuth } from '@/context/AuthContext'
import { isNflToolHref } from '@/lib/nflAccessPolicy'
import { hasNbaAccess, isNbaToolHref } from '@/lib/nbaAccessPolicy'
import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, LockKeyhole, Search, Wifi, WifiOff } from 'lucide-react'
import { getContextNavigation, routeMatches } from './navigationConfig'
import { researchSportForPath, resolveResearchSport, researchToolActive, researchNavigationHref } from './researchNavigation'
import { useResearchSport } from './useResearchSport'

export function DesktopCommandBar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { sport } = useResearchSport(pathname)
  const { allowed: nflAccess } = useNflAccess()
  const { profile } = useAuth()
  const nbaAccess = hasNbaAccess(profile)
  const selectedSport = resolveResearchSport(sport, nflAccess)
  const router = useRouter()
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)
  const context = getContextNavigation(pathname)
  const ContextIcon = context.meta.icon
  const shortcuts = context.items.filter(item => (!item.ultimateOnly || isNbaToolHref(item.href)) && (!isNflToolHref(item.href) || nflAccess) && (context.area !== 'research' || !researchSportForPath(item.href.split('?')[0]) || researchSportForPath(item.href.split('?')[0]) === selectedSport)).slice(0, 5)

  useEffect(() => {
    const markOnline = () => setOnline(true)
    const markOffline = () => setOnline(false)
    window.addEventListener('online', markOnline)
    window.addEventListener('offline', markOffline)
    return () => {
      window.removeEventListener('online', markOnline)
      window.removeEventListener('offline', markOffline)
    }
  }, [])

  return (
    <div className="ss-desktop-commandbar" role="toolbar" aria-label="Desktop navigation">
      <div className="ss-desktop-history">
        <button type="button" onClick={() => router.back()} aria-label="Go back" title="Back">
          <ArrowLeft size={14} />
        </button>
      </div>

      <div className="ss-desktop-context-identity" aria-label={`${context.meta.label} workspace`}>
        <span><ContextIcon size={14} /></span>
        <div><small>{context.meta.eyebrow}</small><strong>{context.meta.label}</strong></div>
      </div>

      <div className="ss-desktop-workspaces" aria-label="Workspaces">
        {shortcuts.map(item => {
          const Icon = item.icon
          const locked = isNbaToolHref(item.href) && !nbaAccess
          const active = !locked && ((isNflToolHref(item.href) || isNbaToolHref(item.href)) ? researchToolActive(item.href, pathname, searchParams) : routeMatches(pathname, item))
          const label = item.shortLabel ?? item.label
          return (
            <Link key={item.href} href={researchNavigationHref(item.href, pathname, searchParams, nbaAccess)} prefetch={false} data-active={active} aria-current={active ? 'page' : undefined} aria-label={locked ? `${label} · Ultimate required` : label} title={locked ? `${label} · Ultimate required` : label}>
              {locked ? <LockKeyhole size={13} aria-hidden="true" /> : <Icon size={13} aria-hidden="true" />}
              <span>{label}</span>
            </Link>
          )
        })}
      </div>

      <button
        type="button"
        className="ss-desktop-search-command"
        onClick={() => window.dispatchEvent(new CustomEvent('slipsurge:open-command'))}
        title="Search SlipSurge (Ctrl+K)"
      >
        <Search size={13} />
        <span>Search SlipSurge</span>
        <kbd>Ctrl K</kbd>
      </button>

      <div className="ss-desktop-connection" data-online={online} title={online ? 'Connected' : 'Offline'}>
        {online ? <Wifi size={12} /> : <WifiOff size={12} />}
        <span>{online ? 'Live' : 'Offline'}</span>
      </div>
    </div>
  )
}

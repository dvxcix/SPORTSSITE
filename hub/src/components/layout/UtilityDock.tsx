'use client'

import { useWatchlist } from '@/context/WatchlistContext'
import { VoltTeaser } from '@/components/volt/VoltTeaser'

/** VOLT is the only floating launcher. Header/account actions open the portals below. */
export function UtilityDock({ children, teaserOnly = false }: { children?: React.ReactNode; teaserOnly?: boolean }) {
  const { signedIn } = useWatchlist()
  return <div className={`ss-utility-dock${teaserOnly ? ' is-teaser-only' : ''}`}>
    <style>{`
      .ss-utility-dock{position:fixed;right:20px;bottom:calc(20px + env(safe-area-inset-bottom,0px) + var(--volt-resume-offset,0px) + var(--volt-action-offset,0px));z-index:var(--layer-floating);pointer-events:none}
      body:has(.ss-context-handoff) .ss-utility-dock{--volt-resume-offset:76px}
      @media(max-width:767px),(max-width:1024px) and (any-pointer:coarse){.ss-utility-dock{right:14px;bottom:calc(var(--mobile-dock-clearance,88px) - 8px + var(--volt-resume-offset,0px) + var(--volt-action-offset,0px))}.ss-utility-dock.is-teaser-only{bottom:calc(16px + env(safe-area-inset-bottom,0px))}}
    `}</style>
    {signedIn && !teaserOnly && <div className="ss-utility-dock-items" hidden inert aria-hidden="true">{children}</div>}
    <VoltTeaser />
  </div>
}

'use client'

import { useState } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
import { useWatchlist } from '@/context/WatchlistContext'
import { VoltTeaser } from '@/components/volt/VoltTeaser'

export function UtilityDock({ children, teaserOnly = false, toolsInHeader = false }: { children?: React.ReactNode; teaserOnly?: boolean; toolsInHeader?: boolean }) {
  const { signedIn } = useWatchlist()
  const [expanded, setExpanded] = useState(false)

  const mountTools = signedIn && !teaserOnly
  // Header buttons open these same layout-owned portals; keep their listeners mounted.
  const showTools = mountTools && !toolsInHeader

  return (
    <div className={`ss-utility-dock ${showTools && expanded ? 'is-expanded' : ''} ${teaserOnly ? 'is-teaser-only' : ''}`}>
      <style>{`
        .ss-utility-dock {
          position: fixed; right: 20px; bottom: calc(20px + env(safe-area-inset-bottom, 0px) + var(--volt-resume-offset, 0px));
          z-index: var(--layer-floating); display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
          pointer-events: none;
        }
        body:has(.ss-context-handoff) .ss-utility-dock { --volt-resume-offset: 76px; }
        .ss-utility-dock-launchers { display: flex; align-items: flex-end; gap: 12px; }
        .ss-utility-dock-items {
          display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
          opacity: 0; visibility: hidden; pointer-events: none;
          transition: opacity 160ms ease, visibility 0s linear 160ms;
        }
        .ss-utility-dock.is-expanded .ss-utility-dock-items {
          opacity: 1; visibility: visible; pointer-events: auto; transition-delay: 0s;
        }
        .ss-utility-dock-items[hidden] { display: none; }
        .ss-utility-dock .wl-fab, .ss-utility-dock .mp-fab, .ss-utility-dock .matrix-fab {
          position: static !important; right: auto !important; bottom: auto !important;
          transform: none !important; margin: 0; cursor: pointer !important;
        }
        .ss-utility-dock-toggle {
          pointer-events: auto; width: 48px; height: 48px; border-radius: 16px;
          display: grid; place-items: center; cursor: pointer; color: var(--accent-fg);
          border: 1px solid rgba(180,255,77,.7);
          background: linear-gradient(135deg, var(--accent), #76e63b);
          box-shadow: 0 10px 30px rgba(0,0,0,.42), 0 0 24px rgba(180,255,77,.18);
          transition: transform 160ms ease, border-radius 160ms ease, box-shadow 160ms ease;
        }
        .ss-utility-dock-toggle:hover { transform: translateY(-2px); box-shadow: 0 14px 34px rgba(0,0,0,.48), 0 0 30px rgba(180,255,77,.25); }
        .ss-utility-dock.is-expanded .ss-utility-dock-toggle { border-radius: 999px; }
        @media (max-width: 767px), (max-width: 1024px) and (any-pointer: coarse) {
          .ss-utility-dock {
            right: 14px;
            bottom: calc(var(--mobile-dock-clearance) - 8px + var(--volt-resume-offset, 0px));
          }
          .ss-utility-dock-items { gap: 7px; }
          .ss-utility-dock.is-teaser-only { bottom: calc(16px + env(safe-area-inset-bottom, 0px)); }
          .ss-utility-dock-toggle {
            width: 50px; height: 50px; border-radius: 18px;
            box-shadow: 0 12px 38px rgba(0,0,0,.52), 0 0 30px rgba(180,255,77,.22);
          }
          .ss-utility-dock.is-expanded::before {
            content: ''; position: absolute; right: -7px; bottom: -7px;
            width: 64px; height: calc(100% + 14px); z-index: -1;
            border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--border));
            border-radius: 22px; background: color-mix(in srgb, var(--surface) 82%, transparent);
            box-shadow: 0 18px 52px rgba(0,0,0,.42); backdrop-filter: blur(18px);
          }
          .ss-utility-dock .wl-fab, .ss-utility-dock .mp-fab, .ss-utility-dock .matrix-fab {
            max-width: min(76vw, 270px); min-height: 44px;
            box-shadow: 0 10px 30px rgba(0,0,0,.38) !important;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .ss-utility-dock-items, .ss-utility-dock-toggle { transition: none; }
        }
      `}</style>
      {mountTools && <div className="ss-utility-dock-items" hidden={toolsInHeader} aria-hidden={!showTools || !expanded} inert={!showTools || !expanded ? true : undefined}>{children}</div>}
      <div className="ss-utility-dock-launchers">
      <VoltTeaser onActivate={() => setExpanded(false)} />
      {showTools && <>
      <button
        type="button"
        className="ss-utility-dock-toggle"
        onClick={() => setExpanded(value => !value)}
        aria-label={expanded ? 'Close quick tools' : 'Open quick tools'}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown size={20} /> : <Sparkles size={20} />}
      </button>
      </>}
      </div>
    </div>
  )
}

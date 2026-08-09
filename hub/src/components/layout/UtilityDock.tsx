'use client'

import { useState } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
import { useWatchlist } from '@/context/WatchlistContext'

export function UtilityDock({ children }: { children: React.ReactNode }) {
  const { signedIn } = useWatchlist()
  const [expanded, setExpanded] = useState(false)

  if (!signedIn) return null

  return (
    <div className={`ss-utility-dock ${expanded ? 'is-expanded' : ''}`}>
      <style>{`
        .ss-utility-dock {
          position: fixed; right: 20px; bottom: calc(20px + env(safe-area-inset-bottom, 0px));
          z-index: 50; display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
          pointer-events: none;
        }
        .ss-utility-dock-items {
          display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
          opacity: 0; transform: translateY(12px) scale(.96); transform-origin: bottom right;
          pointer-events: none; transition: opacity 160ms ease, transform 200ms cubic-bezier(.2,.8,.2,1);
        }
        .ss-utility-dock.is-expanded .ss-utility-dock-items {
          opacity: 1; transform: translateY(0) scale(1); pointer-events: auto;
        }
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
        @media (prefers-reduced-motion: reduce) {
          .ss-utility-dock-items, .ss-utility-dock-toggle { transition: none; }
        }
      `}</style>
      <div className="ss-utility-dock-items" aria-hidden={!expanded} inert={!expanded ? true : undefined}>{children}</div>
      <button
        type="button"
        className="ss-utility-dock-toggle"
        onClick={() => setExpanded(value => !value)}
        aria-label={expanded ? 'Close quick tools' : 'Open quick tools'}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown size={20} /> : <Sparkles size={20} />}
      </button>
    </div>
  )
}

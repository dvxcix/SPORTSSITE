'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ClipboardList, Grid3X3, Star, type LucideIcon } from 'lucide-react'
import { useWatchlist } from '@/context/WatchlistContext'
import { FloatingSurface } from '@/components/ui/FloatingSurface'
import styles from './researchSavedActions.module.css'

function SavedAction({ label, text, event, icon: Icon }: { label: string; text: string; event: string; icon: LucideIcon }) {
  const anchor = useRef<HTMLButtonElement>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null), description = useId()
  const [hint, setHint] = useState(false)
  const cancel = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }
  const close = () => { cancel(); setHint(false) }
  const reveal = () => { cancel(); setHint(true) }
  const leave = () => { cancel(); if (document.activeElement !== anchor.current) timer.current = setTimeout(() => setHint(false), 140) }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  return <>
    <button ref={anchor} type="button" aria-label={label} aria-haspopup="dialog" aria-describedby={hint ? description : undefined}
      onPointerEnter={e => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') reveal() }} onPointerLeave={leave} onFocus={reveal} onBlur={close}
      onClick={() => { close(); window.dispatchEvent(new Event(event)) }}><Icon size={17} aria-hidden="true" /><span>{text}</span></button>
    <FloatingSurface open={hint} anchorRef={anchor} onClose={close} role="tooltip" ariaLabel={text} className={styles.hint} width={112} onPointerEnter={reveal} onPointerLeave={leave}><span id={description}>{text}</span></FloatingSurface>
  </>
}

/** Opens the single, layout-owned drawers from the active research workspace. */
export function ResearchSavedActions({ nflMatrix = false }: { nflMatrix?: boolean }) {
  const { signedIn } = useWatchlist()
  if (!signedIn) return null

  return <div className={styles.actions} role="group" aria-label="Saved research">
    {nflMatrix && <SavedAction label="Open NFL matrices" text="NFL Matrix" event="ss:open-nfl-matrices" icon={Grid3X3} />}
    <SavedAction label="Open my picks" text="Picks" event="ss:open-my-picks" icon={ClipboardList} />
    <SavedAction label="Open watchlist" text="Watchlist" event="ss:open-watchlist" icon={Star} />
  </div>
}

'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { FloatingSurface } from '@/components/ui/FloatingSurface'
import { VoltCharacter } from './VoltCharacter'
import styles from './volt.module.css'

export function VoltTeaser({ onActivate }: { onActivate?: () => void }) {
  const path = usePathname()
  return <VoltTeaserContent key={path} path={path} onActivate={onActivate} />
}

function VoltTeaserContent({ path, onActivate }: { path: string; onActivate?: () => void }) {
  const description = useId()
  const anchor = useRef<HTMLButtonElement>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null), pinned = useRef(false)
  const [open, setOpen] = useState(false)
  const cancelClose = useCallback(() => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }, [])
  const close = useCallback(() => { cancelClose(); pinned.current = false; setOpen(false) }, [cancelClose])
  const reveal = () => { cancelClose(); setOpen(true) }
  const leave = () => {
    cancelClose()
    if (!pinned.current && document.activeElement !== anchor.current) timer.current = setTimeout(() => setOpen(false), 140)
  }
  useEffect(() => cancelClose, [cancelClose])
  useEffect(() => {
    if (!open) return
    const changed = () => { if (document.body.classList.contains('ss-modal-open')) close() }
    const observer = new MutationObserver(changed)
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] }); changed()
    return () => observer.disconnect()
  }, [open, close])

  return <>
    <button ref={anchor} type="button" className={styles.trigger} aria-label="VOLT — Sparks coming soon" aria-expanded={open} aria-describedby={open ? description : undefined}
      onPointerEnter={event => { if (event.pointerType === 'mouse' || event.pointerType === 'pen') reveal() }} onPointerLeave={leave}
      onFocus={reveal} onBlur={close}
      onClick={() => { onActivate?.(); cancelClose(); pinned.current = !pinned.current; setOpen(pinned.current) }}>
      <span className={styles.float}><VoltCharacter jersey={path.startsWith('/the-paint') || path.startsWith('/nba') ? 'nba' : 'nfl'} /></span>
    </button>
    <FloatingSurface open={open} anchorRef={anchor} onClose={close} role="tooltip" ariaLabel="About VOLT and Sparks" className={styles.tooltip} width={214} align="end" side="top" gap={8} onPointerEnter={reveal} onPointerLeave={leave}>
      <div id={description}><strong>VOLT <span>Sparks</span></strong><p>COMING SOON</p></div>
    </FloatingSurface>
  </>
}

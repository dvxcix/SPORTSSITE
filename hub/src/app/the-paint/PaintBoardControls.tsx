'use client'

import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { ModalSurface } from '@/components/ui/ModalSurface'
import styles from './paint.module.css'

const compactQuery = '(max-width: 767px)'
const subscribe = (notify: () => void) => {
  if (typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia(compactQuery)
  query.addEventListener('change', notify)
  return () => query.removeEventListener('change', notify)
}
export function useCompactBoard() {
  return useSyncExternalStore(subscribe, () => typeof window.matchMedia === 'function' && window.matchMedia(compactQuery).matches, () => false)
}

/** One set of controls, inline on desktop and in a focused phone sheet. */
export function PaintBoardControls({ compact, summary, count, search, children }: {
  compact: boolean; summary: string; count: number; search: ReactNode; children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return <>
    <div className={styles.boardOptionsRow}>{compact && search}<button type="button" className={styles.boardOptions} aria-label={`Open board filters: ${summary}`} aria-haspopup="dialog" aria-expanded={compact && open} onClick={() => setOpen(true)}><span>{summary}</span><SlidersHorizontal size={16} aria-hidden="true"/></button></div>
    <div className={styles.boardControlsDesktop}>{!compact && children}</div>
    <ModalSurface open={compact && open} onClose={() => setOpen(false)} label="Board filters" backdropClassName={styles.modalBackdrop} backdropStyle={{ alignItems: 'flex-end' }} panelClassName={styles.boardFilterSheet}>
      <header><h2>Board filters</h2><button type="button" aria-label="Close board filters" onClick={() => setOpen(false)}><X size={20}/></button></header>
      <div className={styles.boardFilterBody}>{children}</div>
      <footer><button type="button" onClick={() => setOpen(false)}>Show {count} {count === 1 ? 'player' : 'players'}</button></footer>
    </ModalSurface>
  </>
}

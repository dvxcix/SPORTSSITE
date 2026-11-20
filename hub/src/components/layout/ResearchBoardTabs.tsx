'use client'

import { Layers3, Table2 } from 'lucide-react'
import styles from './ResearchBoardTabs.module.css'

/** Primary boards stay visible independently of the larger research tool menu. */
export function ResearchBoardTabs({ sport, researchLabel, oddsActive, onSelect }: {
  sport: 'NBA' | 'NFL'
  researchLabel: string
  oddsActive: boolean
  onSelect: (board: 'research' | 'odds-board') => void
}) {
  return <nav className={styles.tabs} aria-label={`${sport} boards`}>
    <button type="button" aria-current={!oddsActive ? 'page' : undefined} onClick={() => onSelect('research')}><Layers3 size={15} aria-hidden="true"/><span>{researchLabel}</span></button>
    <button type="button" aria-current={oddsActive ? 'page' : undefined} onClick={() => onSelect('odds-board')}><Table2 size={15} aria-hidden="true"/><span>Odds Board</span></button>
  </nav>
}

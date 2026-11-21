'use client'
import { Fragment, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import type { PaintPlayer } from '@/lib/nbaPaint'
import type { NbaPlayerMarketGroup } from '@/lib/nbaPlayerMarketGroups'
import styles from './paint.module.css'

export function PaintPlayerMarketGroups({ groups, layout, expanded, onToggle, searching, children }: {
  groups: Record<NbaPlayerMarketGroup, PaintPlayer[]>; layout: 'table' | 'cards';
  expanded: Record<'unpriced' | 'unavailable', boolean>; onToggle: (group: 'unpriced' | 'unavailable') => void;
  searching: boolean; children: (players: PaintPlayer[]) => ReactNode;
}) {
  return <>{children(groups.priced)}{(['unpriced', 'unavailable'] as const).map(group => {
    const players = groups[group]
    if (!players.length) return null
    const open = searching || expanded[group], label = group === 'unpriced' ? 'No current price' : 'Unavailable'
    const control = <button className={styles.marketGroupToggle} type="button" aria-expanded={open} aria-label={`${label}, ${players.length} ${players.length === 1 ? 'player' : 'players'}`} aria-description={group === 'unpriced' ? 'No usable price for the selected market, book and target' : 'Out, inactive or otherwise unavailable for this matchup'} onClick={() => onToggle(group)}><span>{label}<b>{players.length}</b></span><ChevronDown size={16} style={{ transform: open ? 'rotate(180deg)' : undefined }}/></button>
    const heading = searching ? <div className={styles.marketGroupToggle} role="heading" aria-level={3}><span>{label}<b>{players.length}</b></span></div> : control
    return <Fragment key={group}>{layout === 'table' ? <tr className={styles.marketGroupRow} data-market-group={group}><td colSpan={11}>{heading}</td></tr> : <div className={styles.marketGroupSection} data-market-group={group}>{heading}</div>}{open && children(players)}</Fragment>
  })}</>
}

'use client'

import { ChartNoAxesCombined, Info, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import styles from './ResearchMetrics.module.css'

/** Original SlipSurge crowd mark. Uses theme ink; animation never changes a value. */
export function PicksMark({ className = '' }: { className?: string }) {
  return <svg className={`${styles.pickMark} ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path className={styles.crowd} d="M7 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm10 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.5 19v-2a4.5 4.5 0 0 1 9 0v2m1-4a4.5 4.5 0 0 1 8 2v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    <path className={styles.surge} d="m12.7 9.8-2 3.3h2.1l-1.4 3.1 3.8-4.5h-2.5l1.2-1.9" fill="currentColor"/>
  </svg>
}

export function PickCount({ value, estimated = false, observed = false }: { value: number | null | undefined; estimated?: boolean; observed?: boolean }) {
  const count = value == null ? null : value.toLocaleString('en-US')
  const label = `${estimated ? 'Estimated' : observed ? 'Observed market' : 'Recorded'} picks: ${count ?? 'unavailable'}`
  return <span className={styles.pickCount} role="img" aria-label={label} title={label} data-estimated={estimated || undefined}>
    <PicksMark/><span aria-hidden="true">{estimated && count != null ? '≈' : ''}{count ?? '—'}</span>
  </span>
}

export function MarketMovement({ value, precision = 1 }: { value: number | null; precision?: number }) {
  const direction = value == null ? 'unknown' : value > 0 ? 'shortened' : value < 0 ? 'lengthened' : 'unchanged'
  const rounded = value == null ? null : Math.abs(value).toFixed(precision)
  const display = value == null ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${rounded}`
  const label = value == null ? 'Market movement unavailable: no comparable observation' : `${direction[0].toUpperCase()+direction.slice(1)}: ${display} probability points`
  const Icon = value == null ? ChartNoAxesCombined : value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus
  return <span className={styles.movement} data-direction={direction} role="img" aria-label={label} title={label}>
    <Icon size={14} aria-hidden="true"/><span aria-hidden="true">{display}{value != null && <small> pp</small>}</span>
  </span>
}

export function OddsBoardGuide({ players, className='' }: { players: number; className?:string }) {
  return <div className={`${styles.boardMeta} ${className}`}>
    <span>{players.toLocaleString('en-US')} {players===1?'player':'players'}</span>
    <details className={styles.guide}>
      <summary aria-label="How to read this board"><Info size={18} aria-hidden="true"/></summary>
      <div className={styles.guideBody}>
        <p><PicksMark/> Counts show recorded market activity. <b>≈</b> marks an estimate; <b>—</b> means unavailable, not zero.</p>
        <p><ChartNoAxesCombined size={16} aria-hidden="true"/> Signed changes are probability points: up is shortened, down is lengthened. Open or Earlier is the comparison price; the large number is last observed.</p>
      </div>
    </details>
  </div>
}

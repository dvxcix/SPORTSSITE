'use client'

import type { CSSProperties } from 'react'
import styles from './MarketBaselineRead.module.css'

export type BaselineMarketKind = 'HR' | 'FHR'

export function baselinePriceFromPercent(current: number | null, priceDeltaPct: number | null) {
  return current != null && priceDeltaPct != null && Math.abs(1 + priceDeltaPct) > .0001
    ? current / (1 + priceDeltaPct)
    : null
}

function formatOdds(value: number | null) {
  if (value == null) return '—'
  const rounded = Math.round(value)
  return rounded > 0 ? `+${rounded}` : String(rounded)
}

function BaselineMarket({ market, current, baseline }: {
  market: BaselineMarketKind
  current: number | null
  baseline: number | null
}) {
  if (current == null || baseline == null) return null
  const difference = Math.round(current - baseline)
  const direction = difference < 0 ? 'shorter' : difference > 0 ? 'longer' : 'flat'
  const movement = direction === 'shorter'
    ? `▼ ${Math.abs(difference).toLocaleString()}`
    : direction === 'longer'
      ? `▲ ${Math.abs(difference).toLocaleString()}`
      : 'Held'
  const currentPosition = 50 + Math.max(-34, Math.min(34, difference / 12))
  const marketName = market === 'FHR' ? 'First HR' : 'Anytime HR'
  const tileStyle = { '--market-position': `${currentPosition}%` } as CSSProperties

  return <span
    className={styles.market}
    data-market={market}
    data-direction={direction}
    style={tileStyle}
    title={`${marketName}: ${formatOdds(current)}; ${Math.abs(difference)} points ${direction} than ${formatOdds(baseline)} norm`}
  >
    <span className={styles.head}><b>{market}</b><small>{marketName}</small></span>
    <span className={styles.price}><strong>{formatOdds(current)}</strong><i>{movement}</i></span>
    <span className={styles.track} aria-hidden="true"><span className={styles.normDot} /><span className={styles.currentDot} /></span>
    <span className={styles.foot}><small>Current</small><span>Norm <b>{formatOdds(baseline)}</b></span></span>
  </span>
}

export function MarketBaselineRead({ hr, hrBaseline, fhr, fhrBaseline, compact = false, variant = 'cards', className = '' }: {
  hr: number | null
  hrBaseline: number | null
  fhr: number | null
  fhrBaseline: number | null
  compact?: boolean
  variant?: 'cards' | 'rail'
  className?: string
}) {
  const hasBaseline = (hr != null && hrBaseline != null) || (fhr != null && fhrBaseline != null)
  if (!hasBaseline) return <span className={`${styles.empty} ${className}`.trim()}>Baseline unavailable</span>

  return <span
    className={`${styles.read} ${className}`.trim()}
    data-compact={compact || undefined}
    data-variant={variant}
    aria-label="Home run prices versus player baseline"
  >
    <BaselineMarket market="HR" current={hr} baseline={hrBaseline} />
    <BaselineMarket market="FHR" current={fhr} baseline={fhrBaseline} />
  </span>
}

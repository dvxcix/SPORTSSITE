'use client'

import { memo } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { nbaOdds, nbaPrice, type PaintProp, type PaintGameOdds } from '@/lib/nbaPaint'
import { nbaOddsDelta } from '@/lib/nbaOddsDelta'
import styles from './paint.module.css'

const captureFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })

type GameField = 'spread_home' | 'spread_away' | 'moneyline_home' | 'moneyline_away' | 'total_over' | 'total_under'

export function PaintPriceDelta({ open, current }: { open?: number | null; current?: number | null }) {
  const move = nbaOddsDelta(open, current)
  const direction = move?.direction ?? 'unknown'
  const value = move == null ? '—' : `${move.pp > 0 ? '+' : ''}${move.pp.toFixed(1)} pp`
  return <span className={styles.priceDelta} data-direction={direction} aria-label={move == null ? 'No comparable opening capture yet' : `${direction === 'flat' ? 'Unchanged implied probability' : direction === 'shorter' ? 'Odds shortened' : 'Odds lengthened'} · ${value} probability points`}>
    {direction === 'shorter' ? <ArrowDownRight size={12} aria-hidden="true"/> : direction === 'longer' ? <ArrowUpRight size={12} aria-hidden="true"/> : <Minus size={12} aria-hidden="true"/>}
    <span><span className="sr-only">Change </span>{value}</span>
  </span>
}

/** Spans only: safe inside a quote button without extra controls or network requests. */
export const PaintPriceValue = memo(function PaintPriceValue({ current, opening, at, compact = false, openingLabel = 'OPEN', comparable = true }: { current?: number | null; opening?: number | null; at?: string; compact?: boolean; openingLabel?: 'OPEN' | 'FIRST' | 'PREV'; comparable?: boolean }) {
  const captured = at && Number.isFinite(Date.parse(at)) ? captureFormat.format(new Date(at)) + ' ET' : null
  const validOpening = nbaOddsDelta(opening, current) != null ? opening : null
  return <span className={styles.priceQuote} data-compact={compact || undefined} aria-label={`Now ${nbaOdds(current)}, ${openingLabel.toLowerCase()} ${nbaOdds(validOpening)}`}>
    <span className={styles.priceNow}><small className="sr-only">Current odds</small><b>{nbaOdds(current)}</b></span>
    <span className={styles.priceComparison}><span className={styles.priceOpen} aria-label={validOpening == null ? 'Comparison price unavailable' : `${openingLabel === 'PREV' ? 'Previous capture' : openingLabel === 'FIRST' ? 'First available' : 'First captured'} ${captured ?? 'quote'}`}><small>{openingLabel === 'OPEN' ? 'Open' : openingLabel === 'FIRST' ? 'First' : 'Prev'}</small><span>{nbaOdds(validOpening)}</span></span>
    <PaintPriceDelta open={comparable ? validOpening : null} current={current}/></span>
  </span>
})

export function PaintPrice({ offer, side = 'over', compact = false }: { offer: PaintProp; side?: 'over' | 'under'; compact?: boolean }) {
  const opening = offer.opening?.[side]
  return <PaintPriceValue current={nbaPrice(offer, side)} opening={opening?.odds} at={opening?.at} compact={compact}/>
}

export function PaintGamePrice({ quote, field, compact = false }: { quote: PaintGameOdds; field: GameField; compact?: boolean }) {
  const opening = quote.opening?.[field]
  return <PaintPriceValue current={quote[`${field}_odds`]} opening={opening?.odds} at={opening?.at} compact={compact}/>
}

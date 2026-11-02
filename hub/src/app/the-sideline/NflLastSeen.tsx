'use client'

import { BookLogo, bookName } from '@/components/BookLogo'
import type { NflMarketOffer, SidelineOddsBoard } from '@/lib/nflOddsTypes'
import styles from './nflLastSeen.module.css'

const price = (value: number | null | undefined) => value == null ? '—' : value > 0 ? `+${value}` : `${value}`
const stamp = (value: string | null) => {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Time unavailable'
  return new Date(value).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET'
}
const offerPrice = (offer: NflMarketOffer) => offer.type === 'milestone'
  ? `${offer.line != null ? `Line ${offer.line} · ` : ''}${price(offer.current.odds)}`
  : `${offer.line == null ? '' : `${offer.line} · `}Over ${price(offer.current.over)} / Under ${price(offer.current.under)}`

function Prices({ label, prices }: { label: string; prices: SidelineOddsBoard['lastSeen'] }) {
  const rows = prices?.offers ?? [], lines = prices?.lines ?? []
  if (!rows.length && !lines.length) return null
  return <details className={styles.root}>
    <summary>{label} <span>{rows.length + lines.length}</span></summary>
    <div className={styles.rows}>
      {rows.map((row, index) => <div className={styles.row} key={`${row.playerId}:${row.label}:${row.offer.vendor}:${row.offer.line}:${index}`}>
        <div><strong>{row.name}</strong> <small>{row.team} · {row.label}</small></div>
        <div className={styles.book}><BookLogo vendor={row.offer.vendor} size={18} /> {bookName(row.offer.vendor)} · {offerPrice(row.offer)}</div>
        <time dateTime={row.offer.updatedAt ?? undefined}>{stamp(row.offer.updatedAt)}</time>
      </div>)}
      {lines.map((line, index) => <div className={styles.row} key={`${line.vendor}:${index}`}>
        <div><strong>Game lines · away / home</strong></div><div className={styles.book}><BookLogo vendor={line.vendor} size={18} /> {bookName(line.vendor)} · Moneyline {price(line.moneylineAway)} / {price(line.moneylineHome)} · Spread {line.spreadAway ?? '—'} ({price(line.spreadAwayOdds)}) / {line.spreadHome ?? '—'} ({price(line.spreadHomeOdds)}) · Total {line.total ?? '—'} O {price(line.totalOverOdds)} / U {price(line.totalUnderOdds)}</div><time dateTime={line.updatedAt ?? undefined}>{stamp(line.updatedAt)}</time>
      </div>)}
    </div>
  </details>
}

/** Historical observations are informational and have no pick actions. */
export function NflLastSeen({ board }: { board: SidelineOddsBoard }) {
  return <>{board.legacyUnverified ? <p role="status" className={styles.history}>Historical prices · unverified</p> : null}<Prices label="Last seen prices" prices={board.lastSeen} /><Prices label="Opening prices" prices={board.openingOnly} /></>
}

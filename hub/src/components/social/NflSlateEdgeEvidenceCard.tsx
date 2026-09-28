'use client'
import Link from 'next/link'
import { BookLogo } from '@/components/BookLogo'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { MechanicsScoreRing } from '@/components/ui/MechanicsScoreRing'
import { NFL_SLATE_EDGE_MARKETS } from '@/lib/nflSlateEdge'
import type { SlateEdgeEvidence } from '@/lib/slateEdgeEvidence'
import styles from './SlateEdgeEvidenceCard.module.css'

const price = (n: number | null) => n == null ? '—' : `${n > 0 ? '+' : ''}${n}`
export function NflSlateEdgeEvidenceCard({ evidence, interactive }: { evidence: SlateEdgeEvidence; interactive: boolean }) {
  if (!evidence.nfl) return null
  const { entry, focus, sampleLabel } = evidence.nfl
  const body = <article className={styles.card}>
    <header><span>NFL Slate Edge</span><small>{sampleLabel}</small></header>
    <div className={styles.nflHero}>
      <span className={styles.player}><PlayerAvatar headshot={entry.headshot} teamLogo={entry.teamLogo} teamAbbr={entry.team} name={entry.name} size={48} /><span><strong>{entry.name}</strong><small>{entry.team} · {entry.position} · {entry.gameLabel}</small></span></span>
      {entry.score[focus] != null && <MechanicsScoreRing score={entry.score[focus]!} label="SlipSurge Score" size="small" />}
      <span className={styles.nflMm}><small>MM</small><strong>{price(entry.mm[focus])}</strong></span>
    </div>
    <div className={styles.nflMarketGrid}>{NFL_SLATE_EDGE_MARKETS.map(({ key, label }) => {
      const market = entry.markets[key]
      return <span className={styles.nflMarket} data-focus={key === focus} key={key}><small>{market.vendor && <BookLogo vendor={market.vendor} size={16} />}{label}</small><span>{market.line != null ? `${market.selection?.nfl_selection?.market_side === 'milestone' ? `${market.line}+` : `Over ${market.line}`}` : 'To Score'}<b>{price(market.odds)}</b></span><i>Open {price(market.openingOdds)}</i></span>
    })}</div>
    <footer><span>{interactive ? 'Open in The Sideline ↗' : entry.gameLabel}</span><time dateTime={evidence.capturedAt}>Captured {new Date(evidence.capturedAt).toLocaleString()}</time></footer>
  </article>
  return interactive ? <Link className={styles.link} href={evidence.source.path}>{body}</Link> : body
}

'use client'

import Link from 'next/link'
import { ArrowUpRight, Layers3, Zap } from 'lucide-react'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { MarketBaselineRead } from '@/components/dugout/MarketBaselineRead'
import type { SlateEdgeEvidence } from '@/lib/slateEdgeEvidence'
import styles from './SlateEdgeEvidenceCard.module.css'

export function SlateEdgeEvidenceCard({ evidence, interactive = true }: { evidence: SlateEdgeEvidence; interactive?: boolean }) {
  const snapshot = evidence.snapshot
  const body = <article className={styles.card} data-interactive={interactive || undefined}>
    <header>
      <span><Layers3 size={13}/> Slate Edge evidence</span>
      <small>{evidence.source.window.toUpperCase()} / {evidence.source.view === 'signals' ? 'Signal Lab' : 'Slate Rankings'}</small>
    </header>
    <div className={styles.read}>
      <span className={styles.market}>
        <small>Market</small>
        <strong>{snapshot.marketScore ?? '-'}</strong>
        {snapshot.marketOverlay != null && <i>{snapshot.marketOverlay > 0 ? '+' : ''}{snapshot.marketOverlay}</i>}
      </span>
      <span className={styles.rank}><small>Rank</small><strong>#{String(snapshot.rank).padStart(2, '0')}</strong><i><Zap size={8}/> Edge {snapshot.edge ?? '-'}</i></span>
      <span className={styles.player}>
        <PlayerAvatar headshot={evidence.source.playerId ? mlbHeadshot(evidence.source.playerId) : null} teamLogo={getTeamLogoUrl(snapshot.team)} teamAbbr={snapshot.team} name={snapshot.name} size={46}/>
        <span><strong>{snapshot.name}</strong><small>{snapshot.team} / {snapshot.position}{snapshot.battingOrder ? ' / Batting #' + snapshot.battingOrder : ''}</small><span>{snapshot.tags.slice(0, 2).map(tag => <i key={tag}>{tag}</i>)}</span></span>
      </span>
      <MarketBaselineRead hr={snapshot.hr} hrBaseline={snapshot.hrBaseline} fhr={snapshot.fhr} fhrBaseline={snapshot.fhrBaseline} compact className={styles.baseline}/>
      {interactive && <span className={styles.open}><ArrowUpRight size={15}/><small>Open live board</small></span>}
    </div>
    <footer><span>{snapshot.awayAbbr} @ {snapshot.homeAbbr}</span><time dateTime={evidence.capturedAt}>Captured {new Date(evidence.capturedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></footer>
  </article>

  return interactive ? <Link className={styles.link} href={evidence.source.path}>{body}</Link> : body
}

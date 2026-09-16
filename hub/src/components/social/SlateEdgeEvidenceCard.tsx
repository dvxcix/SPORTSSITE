'use client'

import Link from 'next/link'
import { ArrowUpRight, Gauge, Layers3, Radar, Target, TimerReset, UsersRound, Wind, Zap } from 'lucide-react'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { BookLogo } from '@/components/BookLogo'
import { MarketBaselineRead } from '@/components/dugout/MarketBaselineRead'
import { MechanicsScoreRing } from '@/components/ui/MechanicsScoreRing'
import type { SlateEdgeEvidence } from '@/lib/slateEdgeEvidence'
import styles from './SlateEdgeEvidenceCard.module.css'

const odds = (value: number | null | undefined) => value == null ? '—' : `${Math.round(value) > 0 ? '+' : ''}${Math.round(value)}`
const signed = (value: number | null | undefined, suffix = '') => value == null ? '—' : `${value > 0 ? '+' : ''}${Math.round(value)}${suffix}`
const tone = (value: number | null | undefined, center = 0) => value == null ? 'neutral' : value > center ? 'positive' : value < center ? 'negative' : 'neutral'

export function SlateEdgeEvidenceCard({ evidence, interactive = true }: { evidence: SlateEdgeEvidence; interactive?: boolean }) {
  const snapshot = evidence.snapshot
  const books = snapshot.hrBooks ?? []
  const factors = [
    { label: 'MM', value: signed(snapshot.mm), metric: snapshot.mm, Icon: Radar },
    { label: 'Pitch fit', value: snapshot.pitchFit == null ? '—' : String(Math.round(snapshot.pitchFit)), metric: snapshot.pitchFit == null ? null : snapshot.pitchFit - 50, Icon: Target },
    { label: 'Barrel', value: snapshot.barrelRecent == null ? '—' : `${snapshot.barrelRecent.toFixed(1)}%`, metric: snapshot.barrelDelta, Icon: Gauge },
    { label: 'Hard-hit', value: signed(snapshot.hardHitDelta, 'pp'), metric: snapshot.hardHitDelta, Icon: Zap },
    { label: 'Pull-air', value: snapshot.pullAirRecent == null ? '—' : `${(snapshot.pullAirRecent * 100).toFixed(1)}%`, metric: snapshot.pullAirDelta, Icon: Wind },
    { label: 'Timing', value: signed(snapshot.timingDelta == null ? null : snapshot.timingDelta * 100, 'pp'), metric: snapshot.timingDelta, Icon: TimerReset },
  ]
  const body = <article className={styles.card} data-interactive={interactive || undefined}>
    <header>
      <span><Layers3 size={13}/> Slate Edge evidence</span>
      <small>{evidence.source.window.toUpperCase()} · {evidence.source.view === 'signals' ? 'Signal Lab' : 'Slate Rankings'}</small>
    </header>

    <div className={styles.hero}>
      <span className={styles.rank}><small>Rank</small><strong>#{String(snapshot.rank).padStart(2, '0')}</strong><i><Zap size={8}/> Edge {snapshot.edge ?? '—'}</i></span>
      <span className={styles.player}>
        <PlayerAvatar headshot={evidence.source.playerId ? mlbHeadshot(evidence.source.playerId) : null} teamLogo={getTeamLogoUrl(snapshot.team)} teamAbbr={snapshot.team} name={snapshot.name} size={48}/>
        <span><strong>{snapshot.name}</strong><small>{snapshot.team} · {snapshot.position}{snapshot.battingOrder ? ' · Batting #' + snapshot.battingOrder : ''}</small><span>{snapshot.tags.slice(0, 3).map(tag => <i key={tag}>{tag}</i>)}</span></span>
      </span>
      <span className={styles.market}><small>Market</small><strong>{snapshot.marketScore ?? '—'}</strong>{snapshot.marketOverlay != null && <i data-tone={tone(snapshot.marketOverlay)}>{signed(snapshot.marketOverlay)}</i>}</span>
      {snapshot.score != null && <MechanicsScoreRing score={snapshot.score} label="SlipSurge Score" size="small" />}
      {interactive && <span className={styles.open}><ArrowUpRight size={15}/><small>Open board</small></span>}
    </div>

    <MarketBaselineRead hr={snapshot.hr} hrBaseline={snapshot.hrBaseline} fhr={snapshot.fhr} fhrBaseline={snapshot.fhrBaseline} compact className={styles.baseline}/>

    {factors.some(item => item.value !== '—') && <div className={styles.factorRail}>
      {factors.map(({ label, value, metric, Icon }) => <span key={label} data-tone={tone(metric)}><Icon size={12}/><small>{label}</small><b>{value}</b></span>)}
    </div>}

    <div className={styles.marketStrip}>
      <span className={styles.price}><small>HR</small><b>{odds(snapshot.hr)}</b>{snapshot.hrOpen != null && <i>Open {odds(snapshot.hrOpen)}</i>}</span>
      <span className={styles.price} data-fhr><small>FHR</small><b>{odds(snapshot.fhr)}</b>{snapshot.fhrOpen != null && <i>Open {odds(snapshot.fhrOpen)}</i>}</span>
      {books.length > 0 && <span className={styles.books}>{books.slice(0, 5).map(offer => <span key={offer.book} title={offer.book}><BookLogo vendor={offer.book} size={17}/><b>{odds(offer.price)}</b></span>)}</span>}
      {snapshot.publicPicks != null && <span className={styles.picks}><UsersRound size={12}/><b>{snapshot.publicPicks.toLocaleString()}</b><small>picks</small></span>}
    </div>

    <footer><span>{snapshot.awayAbbr} @ {snapshot.homeAbbr}</span><time dateTime={evidence.capturedAt}>Captured {new Date(evidence.capturedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></footer>
  </article>

  return interactive ? <Link className={styles.link} href={evidence.source.path}>{body}</Link> : body
}

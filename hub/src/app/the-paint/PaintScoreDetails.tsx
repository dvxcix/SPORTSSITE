'use client'
import { useState } from 'react'
import { X } from 'lucide-react'
import { ModalSurface } from '@/components/ui/ModalSurface'
import { MechanicsScoreRing } from '@/components/ui/MechanicsScoreRing'
import { PAINT_MARKETS, type PaintMarket } from '@/lib/nbaPaint'
import type { NbaScoreDetails } from '@/lib/nbaIntelligence'
import type { NbaWorkload } from '@/lib/nbaWorkload'
import { PaintScoreCell } from './PaintResearchCells'
import { number } from './PaintVisuals'
import styles from './paint.module.css'
import css from './workload.module.css'

const marketName = (market: PaintMarket) => PAINT_MARKETS.find(row => row.key === market)?.label ?? market
const signed = (n: number) => `${n > 0 ? '+' : ''}${number(n)}`
export function PaintWorkloadDetails({ value, gap }: { value?: NbaWorkload | null; gap?: number | null }) {
  if (!value || value.status !== 'available') return <p className={css.note} aria-label="Workload unavailable">{value?.reason ?? 'Workload inputs unavailable'}</p>
  return <div className={css.detail}>
    <h4>{marketName(value.market)} workload</h4>
    <dl>
      <dt>{value.opportunityLabel} · last 2 / prior {value.priorGames}</dt><dd>{number(value.recentOpportunity)} / {number(value.priorOpportunity)}</dd>
      <dt>Minutes · last 2 / prior</dt><dd>{number(value.recentMinutes)} / {number(value.priorMinutes)}</dd>
      <dt>Opportunity estimate</dt><dd>{number(value.estimate)}{value.proxy ? ' · pass-based proxy' : ''}</dd>
      <dt>Gap to selected target · selected side</dt><dd>{gap == null ? '—' : signed(gap)}</dd>
      <dt>Team workload rank</dt><dd>{value.teamRank == null ? '—' : `${value.teamRank} / ${value.teamPool}`}</dd>
      <dt>Share of available team workload</dt><dd>{value.teamShare == null ? '—' : `${(value.teamShare * 100).toFixed(1)}%`}</dd>
    </dl>
    <p>Last two appearances’ opportunities × earlier conversion. Passes are a proxy for assist opportunity. Estimates describe observed workload; they are not hit probabilities.</p>
  </div>
}

export function PaintScoreWorkloadCell({ score, details, value, gap, playerName, market, contract }: {
  score: number | null; details?: NbaScoreDetails | null; value?: NbaWorkload | null; gap?: number | null
  playerName: string; market?: PaintMarket; contract?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const selectedMarket = market ?? details?.market ?? value?.market
  const workload = details?.workload
  const absences = [...new Map(workload?.components.flatMap(row => row.absent).map(row => [row.playerId, row]) ?? []).values()]
  const at = details?.observedAt && Number.isFinite(Date.parse(details.observedAt)) ? details.observedAt : null
  return <>
    <button type="button" className={css.trigger} aria-label={`View SlipSurge Score details for ${playerName}`} aria-haspopup="dialog" aria-expanded={expanded} onClick={() => setExpanded(true)}><PaintScoreCell score={score}/></button>
    <ModalSurface open={expanded} onClose={() => setExpanded(false)} label={`SlipSurge Score details for ${playerName}`} backdropClassName={styles.modalBackdrop} panelClassName={css.panel}>
      <header><div><h3>SlipSurge Score</h3><p>{playerName}</p></div><button type="button" className={styles.iconButton} aria-label="Close score details" onClick={() => setExpanded(false)}><X size={20}/></button></header>
      <div className={css.score}><MechanicsScoreRing score={score ?? NaN}/><div><h4>{selectedMarket ? marketName(selectedMarket) : 'Selected market'}</h4>{contract && <p>{contract}</p>}<small>{details?.frozen ? 'Saved pregame inputs' : 'Observed research inputs'}{at && <> · <time dateTime={at}>{new Date(at).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET</time></>}</small></div></div>
      {details ? <>
        {details.unavailableReason && <p className={css.note} role="status">{details.unavailableReason}</p>}
        <div className={css.totals} aria-label="Score calculation"><span>Inputs<strong>{number(details.baseScore)}</strong></span><span>Market movement<strong>{signed(details.marketAdjustment)}</strong></span><span>Final score<strong>{number(score)}</strong></span></div>
        <ul className={css.parts} aria-label="Weighted score inputs">{details.parts.map(part => <li key={part.key}>
          <div><span>{part.label}</span><small>{Math.round(part.weight * 100)}%</small><strong>{number(part.value)}</strong></div>
          <div className={css.partTrack} aria-hidden="true"><i style={{ width: `${part.value ?? 0}%` }}/></div>
          {part.value == null ? <small>Unavailable · excluded from weight</small> : part.beforeWorkload != null && Math.abs(part.beforeWorkload - part.value) > .05 ? <small>{number(part.beforeWorkload)} → {number(part.value)} with workload{part.key === 'opportunity' ? ' & availability' : ''}</small> : null}
        </li>)}</ul>
        <p className={css.note}>{details.marketGames} market observations · {Math.round(details.coverage * 100)}% input coverage. Available weights are normalized; samples below 20 games are pulled toward 50.</p>
        <section className={css.workload} aria-label="Workload contribution"><div className={css.sectionTitle}><h4>Workload & availability</h4><strong>{details.baseScore != null && details.beforeWorkload != null ? `${signed(details.baseScore - details.beforeWorkload)} pts` : '—'}</strong></div>
          {workload?.components.length ? <ul className={css.workloadRows}>{workload.components.map(row => <li key={row.market}><span>{marketName(row.market)}<small>{row.workload.opportunityLabel} · {row.workload.recentGames} recent / {row.workload.priorGames} prior</small></span><strong>{row.change == null ? 'Unavailable' : `${signed((row.change - 1) * 100)}%`}</strong></li>)}</ul> : <p className={css.note}>{workload?.reason ?? 'No matching workload observation was saved for this market.'}</p>}
          {workload?.opportunityFactor != null && <p className={css.note}>Observed opportunity ×{number(workload.opportunityFactor)} · availability ×{number(workload.availabilityFactor ?? 1)}. These change the existing opportunity and minutes inputs above.</p>}
          {workload?.status === 'partial' || workload?.status === 'unavailable' ? <p className={css.note}>{workload.reason}</p> : null}
          {absences.length > 0 && <div className={css.absences}>{absences.map(row => <span key={row.playerId}>{row.name}<b>{row.status}</b></span>)}</div>}
          <p className={css.note}>{workload?.availabilityKnown ? 'Only definite absences with recent team participation affect availability, capped at ×1.25. Questionable players are not counted as out.' : 'Complete availability observations were not saved; no absence adjustment is applied.'}{selectedMarket === 'double_double' || selectedMarket === 'triple_double' ? ' PTS, REB and AST workload support is combined geometrically; it is not a joint event probability.' : ''}</p>
        </section>
      </> : <><p className={css.note}>This saved score has no recorded calculation breakdown.</p><PaintWorkloadDetails value={value} gap={gap}/></>}
      <p className={css.note}>A market-specific research index out of 100, not a win probability.</p>
    </ModalSurface>
  </>
}

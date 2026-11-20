'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Activity, BarChart3, CalendarDays, Check, ChevronDown, ChevronRight, CircleDot,
  Database, Dna, Fingerprint, Gauge, History, LoaderCircle, Search, ShieldCheck,
  Sparkles, Target, Trophy, X,
} from 'lucide-react'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import { PlayerAvatar, TeamLogo } from '@/components/sports/PlayerAvatar'
import { getDugoutPercentStyle } from '@/lib/dugoutPercentColor'
import type {
  HistoricalMatch, MarketDnaAnalysis, MarketDnaGame, MarketDnaGameAnalysis,
  MarketDnaGameComponents, MarketDnaGameRank, MarketDnaPlayer, MarketDnaSlateAudit,
} from '@/lib/marketDna'

type Slate = { date: string; games: MarketDnaGame[] }
type ViewMode = 'slate' | 'game' | 'player'

const odds = (value: number | null | undefined) => value == null ? '—' : `${value > 0 ? '+' : ''}${Math.round(value)}`
const pct = (value: number | null, digits = 0) => value == null ? '—' : `${(value * 100).toFixed(digits)}%`
const signed = (value: number | null, digits = 1) => value == null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`
const todayEt = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
const market = (player: MarketDnaPlayer, key: string) => player.markets.find(item => item.key === key)

function SummaryMetric({ label, value, detail, tone = 'text-[var(--text-1)]' }: { label: string; value: string; detail: string; tone?: string }) {
  return <div className="rounded-2xl border border-[color-mix(in_srgb,var(--border)_90%,transparent)] bg-[var(--overlay)] p-4">
    <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--text-3)]">{label}</p>
    <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
    <p className="mt-1 text-[12px] text-[var(--text-3)]">{detail}</p>
  </div>
}

function ComponentBars({ components }: { components: MarketDnaGameComponents }) {
  const labels: Array<[keyof MarketDnaGameComponents, string]> = [
    ['market', 'Market'], ['settlement', 'Settlement'], ['movement', 'Movement'],
    ['historical', 'History'], ['statcast', 'Statcast'], ['traffic', 'Traffic'], ['publicLeverage', 'Leverage'],
  ]
  return <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
    {labels.map(([key, label]) => <div key={key} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]"><span>{label}</span><span className="text-[var(--text-2)]">{Math.round(components[key])}</span></div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface)]"><div className="h-full rounded-full bg-gradient-to-r from-lime-500 to-cyan-400" style={{ width: `${Math.max(2, components[key])}%` }} /></div>
    </div>)}
  </div>
}

function OutcomeChips({ match }: { match: HistoricalMatch }) {
  return <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
    {match.didHr ? <span className="rounded-full bg-[var(--accent-fill)] px-2 py-1 text-[var(--accent-fg)]">HR</span> : <span className="rounded-full bg-[var(--surface-2)] px-2 py-1 text-[var(--text-2)]">No HR</span>}
    {match.rbis != null && match.rbis > 0 ? <span className="rounded-full border border-[color-mix(in_srgb,var(--gold)_25%,transparent)] bg-[color-mix(in_srgb,var(--gold)_10%,transparent)] px-2 py-1 text-[var(--gold)]">{match.rbis} RBI</span> : null}
    {match.totalBases != null ? <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-cyan-300">{match.totalBases} TB</span> : null}
  </div>
}

function MatchRow({ match, rank }: { match: HistoricalMatch; rank: number }) {
  return <div className="grid gap-3 border-b border-[color-mix(in_srgb,var(--border)_70%,transparent)] px-4 py-4 last:border-0 md:grid-cols-[38px_minmax(170px,1fr)_120px_150px] md:items-center">
    <span className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[12px] font-semibold text-[var(--text-3)]">{rank}</span>
    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-[var(--text-1)]">{match.playerName}</strong><span className="text-[12px] font-bold text-[var(--text-3)]">{match.team ?? 'MLB'} · #{match.battingOrder ?? '—'}</span></div><p className="mt-1 text-[12px] text-[var(--text-3)]">{match.gameDate} · HR {odds(match.hrOdds)} · FHR {odds(match.fhrOdds)}</p></div>
    <div><p className="text-lg font-semibold text-[var(--accent)]">{pct(match.similarity)}</p><p className="text-[11px] uppercase tracking-wide text-[var(--text-3)]">{pct(match.coverage)} coverage</p></div>
    <OutcomeChips match={match} />
  </div>
}

function MarketStrip({ player }: { player: MarketDnaPlayer }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
    {player.markets.filter(item => item.current != null).slice(0, 10).map(item => <div key={item.key} className="rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_70%,transparent)] p-2.5">
      <p className="truncate text-[11px] font-bold uppercase tracking-wide text-[var(--text-3)]">{item.label}</p>
      <div className="mt-1 flex items-end justify-between gap-2"><strong className="text-sm text-[var(--text-1)]">{odds(item.current)}</strong><span className={item.probabilityMove == null ? 'text-[var(--text-3)]' : item.probabilityMove > 0 ? 'text-[var(--accent)]' : item.probabilityMove < 0 ? 'text-[var(--red)]' : 'text-[var(--text-3)]'}>{signed(item.probabilityMove)}</span></div>
    </div>)}
  </div>
}

function MmL1Value({ value, showLabel = false }: { value: number | null; showLabel?: boolean }) {
  const color = value == null ? '#71717a' : value > 3 ? '#4ade80' : value < -3 ? '#f87171' : '#f4f4f5'
  const display = value == null ? '—' : `${value > 0 ? '+' : ''}${value}`
  return <span className="inline-flex items-center gap-1.5 font-bold" style={{ color }}>
    {showLabel ? <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)]">MM · Last 1</span> : null}
    <span>{display}</span>
  </span>
}

function PlayerButton({ player, selected, onSelect }: { player: MarketDnaPlayer; selected: boolean; onSelect: () => void }) {
  return <button onClick={onSelect} className={`group flex min-h-16 w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${selected ? 'border-[color-mix(in_srgb,var(--accent)_70%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_70%,transparent)] hover:border-[var(--border-2)] hover:bg-[var(--surface)]'}`}>
    <PlayerAvatar headshot={mlbHeadshot(player.mlbId)} teamLogo={getTeamLogoUrl(player.team)} teamAbbr={player.team} name={player.name} size={38} />
    <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-[12px] font-semibold text-[var(--text-3)]">{player.battingOrder}</span><strong className="truncate text-xs text-[var(--text-1)]">{player.name}</strong></div><p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-3)]">{player.position} · {player.team} · HR {odds(market(player, 'hr')?.current)}</p></div>
    <span className="flex shrink-0 items-center gap-2 text-[12px]"><MmL1Value value={player.metrics.mmL1} showLabel /><ChevronRight size={14} className={selected ? 'text-[var(--accent)]' : 'text-[var(--text-3)]'} /></span>
  </button>
}

function livePlayer(player: MarketDnaPlayer, game: MarketDnaGame | null | undefined) {
  return game?.players.find(candidate => candidate.mlbId === player.mlbId) ?? player
}

function DugoutSignals({ player, pool, compact = false }: { player: MarketDnaPlayer; pool: MarketDnaPlayer[]; compact?: boolean }) {
  const teamPool = pool.filter(candidate => candidate.team === player.team)
  const fhrStyle = getDugoutPercentStyle(
    player.metrics.dugoutFhrPct,
    player.metrics.fhrWeightedDelta,
    pool.map(candidate => candidate.metrics.fhrWeightedDelta),
  )
  const hrStyle = getDugoutPercentStyle(
    player.metrics.dugoutHrPct,
    player.metrics.hrDelta,
    teamPool.map(candidate => candidate.metrics.hrDelta),
  )
  const publicHrPicks = player.picks.home_runs ?? 0

  return <div className={`grid grid-cols-4 gap-1.5 ${compact ? 'min-w-[276px]' : 'w-full max-w-xl gap-2'}`}>
    <div className={`rounded-lg border border-[var(--border)] bg-[var(--overlay)] ${compact ? 'px-2 py-1.5' : 'px-3 py-2.5'}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)]">FHR%</p>
      <p className={compact ? 'text-xs' : 'text-base'} style={fhrStyle}>{pct(player.metrics.dugoutFhrPct, 1)}</p>
    </div>
    <div className={`rounded-lg border border-[var(--border)] bg-[var(--overlay)] ${compact ? 'px-2 py-1.5' : 'px-3 py-2.5'}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)]">HR%</p>
      <p className={compact ? 'text-xs' : 'text-base'} style={hrStyle}>{pct(player.metrics.dugoutHrPct, 1)}</p>
    </div>
    <div className={`rounded-lg border border-[color-mix(in_srgb,var(--gold)_15%,transparent)] bg-[var(--gold-fill)]/[.04] ${compact ? 'px-2 py-1.5' : 'px-3 py-2.5'}`}>
      <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)]"><span className="h-1.5 w-1.5 rounded-full bg-[var(--gold-fill)] shadow-[0_0_8px_rgba(253,224,71,.8)]" />Public HR</p>
      <p className={`${compact ? 'text-xs' : 'text-base'} font-semibold text-[var(--gold)]`}>{publicHrPicks.toLocaleString()}</p>
    </div>
    <div className={`rounded-lg border border-[var(--border)] bg-[var(--overlay)] ${compact ? 'px-2 py-1.5' : 'px-3 py-2.5'}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)]">MM · Last 1</p>
      <p className={compact ? 'text-xs' : 'text-base'}><MmL1Value value={player.metrics.mmL1} /></p>
    </div>
  </div>
}

function RankRow({ entry, game }: { entry: MarketDnaGameRank; game?: MarketDnaGame | null }) {
  const [open, setOpen] = useState(entry.rank <= 2)
  const player = livePlayer(entry.player, game)
  const pool = game?.players ?? [entry.player]
  return <div className="border-b border-[color-mix(in_srgb,var(--border)_70%,transparent)] last:border-0">
    <button onClick={() => setOpen(value => !value)} className="grid w-full gap-3 px-3 py-4 text-left transition hover:bg-[rgba(var(--contrast-rgb),0.025)] xl:grid-cols-[44px_minmax(190px,1fr)_72px_276px_78px_78px_28px] xl:items-center xl:px-4">
      <span className={`grid h-9 w-9 place-items-center rounded-xl border text-xs font-semibold ${entry.rank === 1 ? 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)]' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-3)]'}`}>{entry.rank}</span>
      <div className="flex min-w-0 items-center gap-3"><PlayerAvatar headshot={mlbHeadshot(entry.player.mlbId)} teamLogo={getTeamLogoUrl(entry.player.team)} teamAbbr={entry.player.team} name={entry.player.name} size={42} /><div className="min-w-0"><strong className="block truncate text-sm text-[var(--text-1)]">{entry.player.name}</strong><p className="text-[12px] font-bold uppercase tracking-wide text-[var(--text-3)]">{entry.player.team} · #{entry.player.battingOrder} · {entry.player.position}</p></div></div>
      <div><p className="text-[11px] font-semibold uppercase text-[var(--text-3)]">Learned</p><p className="text-lg font-semibold text-[var(--accent)]">{entry.score.toFixed(1)}</p></div>
      <DugoutSignals player={player} pool={pool} compact />
      <div><p className="text-[11px] font-semibold uppercase text-[var(--text-3)]">FHR</p><p className="text-sm font-semibold text-[var(--text-1)]">{odds(market(player, 'fhr')?.current)}</p></div>
      <div><p className="text-[11px] font-semibold uppercase text-[var(--text-3)]">Anytime</p><p className="text-sm font-semibold text-[var(--text-1)]">{odds(market(player, 'hr')?.current)}</p></div>
      <ChevronDown size={15} className={`text-[var(--text-3)] transition ${open ? 'rotate-180' : ''}`} />
    </button>
    {open ? <div className="space-y-4 bg-[var(--surface)] px-4 pb-4 pt-1">
      <ComponentBars components={entry.components} />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric label="Broad profile" value={entry.profileScore.toFixed(1)} detail="Descriptive evidence score, not the learned rank" />
        <SummaryMetric label="Own matched profile" value={pct(entry.historical.samePlayerHrRate)} detail={`${entry.historical.samePlayerSample} same-player comparisons`} />
        <SummaryMetric label="Own baseline" value={pct(entry.historical.samePlayerBaselineHrRate)} detail={entry.historical.samePlayerLift == null ? 'No stable self-lift yet' : `${entry.historical.samePlayerLift.toFixed(2)}x profile lift`} />
        <SummaryMetric label="Blended analog rate" value={pct(entry.historical.profileProbability)} detail={`${entry.historical.sample} nearest league profiles`} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-[color-mix(in_srgb,var(--accent)_15%,transparent)] bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] p-3"><p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">What separates</p><ul className="mt-2 space-y-1 text-xs text-[var(--text-2)]">{entry.signals.map(signal => <li key={signal}>• {signal}</li>)}</ul></div>
        <div className="rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_60%,transparent)] p-3"><p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)]">Checks against the read</p>{entry.contradictions.length ? <ul className="mt-2 space-y-1 text-xs text-[var(--text-2)]">{entry.contradictions.map(item => <li key={item}>• {item}</li>)}</ul> : <p className="mt-2 text-xs text-[var(--text-3)]">No major captured contradiction.</p>}</div>
      </div>
      <div className="flex flex-wrap gap-2 text-[12px] text-[var(--text-3)]"><span>Analog HR: {pct(entry.historical.matchedHrRate)}</span><span>·</span><span>Game-relative lift: {entry.historical.lift == null ? '—' : `${entry.historical.lift.toFixed(2)}x`}</span><span>·</span><span>Multi-RBI HR shape: {pct(entry.historical.settlementShape.multiRbiHrRate)}</span><span>·</span><span>5+ TB HR shape: {pct(entry.historical.settlementShape.fivePlusTbHrRate)}</span>{entry.outcome ? <><span>·</span><strong className={entry.outcome.hr ? 'text-[var(--accent)]' : 'text-[var(--text-3)]'}>{entry.outcome.hr ? `${entry.outcome.hr} HR · ${entry.outcome.rbi} RBI · ${entry.outcome.tb} TB${entry.outcome.hrMlWon ? ' · HR/ML' : ''}` : 'No HR'}</strong></> : null}</div>
    </div> : null}
  </div>
}

function GameAnalysisPanel({ analysis, liveGame }: { analysis: MarketDnaGameAnalysis; liveGame?: MarketDnaGame | null }) {
  const leader = analysis.ranking[0]
  const validation = analysis.reducer?.validation
  if (!leader) return null
  const signalPool = liveGame?.players ?? analysis.game.players
  const liveLeader = livePlayer(leader.player, liveGame)
  return <div className="space-y-5">
    <section className="overflow-hidden rounded-3xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5"><div><p className="text-xs font-semibold text-[var(--text-1)]">Game-first decision</p><p className="mt-1 max-w-3xl text-[12px] leading-5 text-[var(--text-3)]">The game HR volume is estimated first. Zero, one or several independent player cards can follow; no pair is forced.</p></div>{analysis.projection ? <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-right"><p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300">Projected HR events</p><p className="text-xl font-semibold text-[var(--text-1)]">{analysis.projection.label}</p><p className="text-[11px] text-[var(--text-3)]">{Math.round(analysis.projection.confidence * 100)}% bucket confidence</p></div> : null}</div>
      {analysis.candidates.length ? <div className="grid gap-3 p-4 lg:grid-cols-2">{analysis.candidates.map(candidate => {
        const result = analysis.actualHomeRuns.find(outcome => outcome.mlbId === candidate.player.mlbId)
        const candidatePlayer = livePlayer(candidate.player, liveGame)
        return <article key={candidate.player.mlbId} className="rounded-2xl border border-[var(--border)] bg-[var(--overlay)] p-4">
          <div className="mb-3"><DugoutSignals player={candidatePlayer} pool={signalPool} /></div>
          <div className="flex items-center gap-3"><PlayerAvatar headshot={mlbHeadshot(candidate.player.mlbId)} teamLogo={getTeamLogoUrl(candidate.player.team)} teamAbbr={candidate.player.team} name={candidate.player.name} size={48} /><div className="min-w-0 flex-1"><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">{candidate.label}</p><h3 className="truncate text-base font-semibold text-[var(--text-1)]">{candidate.player.name}</h3><p className="text-[12px] text-[var(--text-3)]">{candidate.player.team} #{candidate.player.battingOrder} · learned rank #{candidate.learnedRank}</p></div><div className="text-right"><p className="text-xl font-semibold text-[var(--accent)]">{candidate.score.toFixed(1)}</p><p className="text-[11px] font-semibold uppercase text-[var(--text-3)]">lane score</p></div></div>
          <ul className="mt-3 space-y-1.5 text-[12px] leading-5 text-[var(--text-2)]">{candidate.reasons.map(reason => <li key={reason}>• {reason}</li>)}</ul>
          {result ? <p className="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-2 text-[12px] font-semibold text-[var(--accent)]">Postgame: {result.homeRuns} HR · {result.rbis} RBI · {result.totalBases} TB{result.hrMlWon ? ' · HR/ML' : ''}</p> : null}
        </article>
      })}</div> : <div className="p-5"><p className="rounded-xl border border-[var(--border)] bg-[var(--overlay)] p-4 text-sm text-[var(--text-2)]">{analysis.readState === 'clear' && analysis.projection?.candidateLimit === 0 ? 'No-HR is the game model strongest pregame bucket. No player card is forced.' : 'No player cleared the separation threshold. The reducer passes instead of inventing a pair.'}</p></div>}
    </section>
    <section className="overflow-hidden rounded-3xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center gap-4 border-b border-[color-mix(in_srgb,var(--border)_80%,transparent)] p-5 sm:p-6">
        <PlayerAvatar headshot={mlbHeadshot(leader.player.mlbId)} teamLogo={getTeamLogoUrl(leader.player.team)} teamAbbr={leader.player.team} name={leader.player.name} size={64} />
        <div className="min-w-0 flex-1"><p className="text-[12px] font-semibold uppercase tracking-[.2em] text-cyan-300">Learned HR likelihood leader</p><h2 className="truncate text-2xl font-semibold text-[var(--text-1)] sm:text-3xl">{leader.player.name}</h2><p className="mt-1 text-xs text-[var(--text-3)]">{leader.player.team} #{leader.player.battingOrder} · all 18 compared · {analysis.stage === 'frozen_close' ? 'frozen at first pitch' : 'current pregame capture'}</p><p className="mt-2 text-[12px] text-[var(--text-3)]">This is the learned probability lens. The game-specific lanes above are scored separately.</p></div>
        <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-5 py-3 text-right"><p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300">Learned rank</p><p className="text-3xl font-semibold text-[var(--text-1)]">#1</p><p className="text-[12px] text-[var(--text-3)]">{leader.score.toFixed(1)} score</p></div>
      </div>
      <div className="space-y-4 p-5 sm:p-6"><ComponentBars components={leader.components} /><DugoutSignals player={liveLeader} pool={signalPool} /><MarketStrip player={liveLeader} /></div>
    </section>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryMetric label="Learned separation" value={`+${analysis.separation.toFixed(1)}`} detail="Learned leader over the second-ranked profile" tone="text-cyan-300" />
      <SummaryMetric label="Profiles ranked" value={`${analysis.ranking.length}/18`} detail="One game, one comparable field" />
      <SummaryMetric label="Training rows" value={(analysis.reducer?.trainingRows ?? analysis.sourceRows).toLocaleString()} detail={analysis.reducer ? `Completed boards through ${analysis.reducer.trainedThrough}` : 'Pregame-only archive rows scanned'} />
      <SummaryMetric label="Board stage" value={analysis.stage === 'frozen_close' ? 'CLOSE' : 'LIVE'} detail={analysis.stage === 'frozen_close' ? 'Locked at first pitch' : 'Updates with captured markets'} />
    </div>

    {validation ? <section className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_70%,transparent)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold text-[var(--text-1)]">Held-out validation</p><p className="text-[12px] text-[var(--text-3)]">Games from {validation.cutoff} forward were excluded from that validation model.</p></div><span className="rounded-full border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-2.5 py-1 text-[11px] font-semibold uppercase text-[var(--accent)]">{analysis.reducer?.version}</span></div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric label="Guarded top one" value={pct(validation.guardedTopOne)} detail={validation.guardActive ? `Market guard active · raw learned ${pct(validation.gameFirstTopOne)}` : `Learned-only: ${pct(validation.learnedTopOne)}`} />
        <SummaryMetric label="Guarded top two" value={pct(validation.guardedTopTwo)} detail={`Top three: ${pct(validation.guardedTopThree)}`} tone="text-[var(--accent)]" />
        <SummaryMetric label="Selected coverage" value={pct(validation.selectedGameCoverage)} detail={`Player precision: ${pct(validation.selectedPlayerPrecision)}`} />
        <SummaryMetric label="Count model" value={pct(validation.countBucketAccuracy)} detail={`No-HR: ${pct(validation.noHrAccuracy)} · MAE ${validation.countMae.toFixed(2)}`} />
      </div>
    </section> : null}

    {analysis.outcomeAvailable ? <section className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[.05] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[.18em] text-cyan-300"><ShieldCheck size={15} /> Postgame reveal</p><p className="mt-1 text-xs text-[var(--text-3)]">Attached after scoring. Never used in the ranking.</p></div>{analysis.score ? <strong className="text-sm text-[var(--text-1)]">{analysis.game.awayAbbr} {analysis.score.away} · {analysis.game.homeAbbr} {analysis.score.home}</strong> : null}</div>
      {analysis.actualHomeRuns.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{analysis.actualHomeRuns.map(result => <div key={`${result.mlbId}-${result.name}`} className="flex items-center gap-3 rounded-xl border border-cyan-400/15 bg-[var(--overlay)] p-3"><PlayerAvatar headshot={result.mlbId ? mlbHeadshot(result.mlbId) : null} teamLogo={getTeamLogoUrl(result.team)} teamAbbr={result.team} name={result.name} size={42} /><div className="min-w-0 flex-1"><strong className="text-sm text-[var(--text-1)]">{result.name}</strong><p className="text-[12px] text-[var(--text-3)]">Pregame rank #{result.pregameRank ?? '—'} · {result.homeRuns} HR · {result.rbis} RBI · {result.totalBases} TB</p></div><div className="flex flex-col gap-1 text-right text-[11px] font-semibold uppercase">{result.firstHr ? <span className="text-[var(--accent)]">First HR</span> : null}{result.hrMlWon ? <span className="text-cyan-300">HR/ML</span> : null}</div></div>)}</div> : <p className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--text-3)]">No home runs recorded in the MLB result.</p>}
    </section> : null}

    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_70%,transparent)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3"><div><p className="text-xs font-semibold text-[var(--text-1)]">All 18, game-first ranking</p><p className="text-[12px] text-[var(--text-3)]">Market, settlement, mechanics, MM and public leverage are compared inside this game. Outcomes attach afterward.</p></div><Trophy size={17} className="text-[var(--accent)]" /></div>
      {analysis.ranking.map(entry => <RankRow key={entry.player.mlbId} entry={entry} game={liveGame ?? analysis.game} />)}
    </section>
  </div>
}

function SlateAuditPanel({ audit }: { audit: MarketDnaSlateAudit }) {
  const { summary } = audit
  return <div className="space-y-5">
    <section className="rounded-3xl border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] bg-[var(--surface)] p-5 sm:p-6">
      <p className="text-[12px] font-semibold uppercase tracking-[.2em] text-[var(--accent)]">Final-slate validation</p>
      <h2 className="mt-1 text-2xl font-semibold text-[var(--text-1)]">Every game, every actual homer rank</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-2)]">Each board is scored from information available before first pitch. Results are joined afterward so a miss stays visible instead of being rewritten.</p>
    </section>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <SummaryMetric label="Games with HR" value={`${summary.gamesWithHomeRun}`} detail={`${summary.completedGames} final boards`} />
      <SummaryMetric label="#1 contained HR" value={`${summary.leaderHitGames}/${summary.gamesWithHomeRun}`} detail="At least one actual homer ranked first" tone="text-[var(--accent)]" />
      <SummaryMetric label="Top two contained HR" value={`${summary.topTwoHitGames}/${summary.gamesWithHomeRun}`} detail="At least one actual homer in the top two" />
      <SummaryMetric label="Selected cards contained HR" value={`${summary.candidateCoverageGames}/${summary.gamesWithHomeRun}`} detail="Variable-cardinality pregame reads" tone="text-[var(--gold)]" />
      <SummaryMetric label="Perfect separation" value={`${summary.perfectSeparationGames}/${summary.gamesWithHomeRun}`} detail="Every homer above every non-homer" />
      <SummaryMetric label="Average best rank" value={summary.averageBestHomerRank == null ? '—' : summary.averageBestHomerRank.toFixed(2)} detail="Best actual homer in each game" />
    </div>
    <section className="grid gap-4 lg:grid-cols-2">
      {audit.games.map(analysis => {
        const isFinal = /final/i.test(analysis.game.status)
        const homerIds = new Set(analysis.actualHomeRuns.map(result => result.mlbId))
        const homerScores = analysis.ranking.filter(entry => homerIds.has(entry.player.mlbId)).map(entry => entry.score)
        const nonHomerScores = analysis.ranking.filter(entry => !homerIds.has(entry.player.mlbId)).map(entry => entry.score)
        const perfect = homerScores.length > 0 && nonHomerScores.length > 0 && Math.min(...homerScores) > Math.max(...nonHomerScores)
        return <article key={analysis.game.gamePk} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_70%,transparent)]">
          <div className="flex items-center gap-3 border-b border-[var(--border)] p-4">
            <div className="flex -space-x-1"><TeamLogo logo={getTeamLogoUrl(analysis.game.awayAbbr)} name={analysis.game.awayAbbr} size={32} /><TeamLogo logo={getTeamLogoUrl(analysis.game.homeAbbr)} name={analysis.game.homeAbbr} size={32} /></div>
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[var(--text-1)]">{analysis.game.awayAbbr} at {analysis.game.homeAbbr}</p><p className="text-[12px] text-[var(--text-3)]">{analysis.score ? `${analysis.game.awayAbbr} ${analysis.score.away} · ${analysis.game.homeAbbr} ${analysis.score.home}` : analysis.game.status}</p></div>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase ${!isFinal ? 'border-cyan-400/25 bg-cyan-400/10 text-cyan-300' : perfect ? 'border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]' : analysis.actualHomeRuns.length ? 'border-[color-mix(in_srgb,var(--gold)_25%,transparent)] bg-[color-mix(in_srgb,var(--gold)_10%,transparent)] text-[var(--gold)]' : 'border-[var(--border-2)] bg-[var(--surface)] text-[var(--text-3)]'}`}>{!isFinal ? 'Awaiting final' : analysis.actualHomeRuns.length ? perfect ? 'Perfect separation' : 'Miss exposed' : 'No HR'}</span>
          </div>
          <div className="space-y-3 p-4">
            {analysis.actualHomeRuns.length ? <div className="space-y-2">{analysis.actualHomeRuns.map(result => <div key={`${result.mlbId}-${result.name}`} className="flex items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--accent)_15%,transparent)] bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] p-2.5"><PlayerAvatar headshot={result.mlbId ? mlbHeadshot(result.mlbId) : null} teamLogo={getTeamLogoUrl(result.team)} teamAbbr={result.team} name={result.name} size={36} /><div className="min-w-0 flex-1"><strong className="text-xs text-[var(--text-1)]">{result.name}</strong><p className="text-[11px] text-[var(--text-3)]">{result.homeRuns} HR · {result.rbis} RBI · {result.totalBases} TB{result.hrMlWon ? ' · HR/ML' : ''}</p></div><span className="text-lg font-semibold text-[var(--accent)]">#{result.pregameRank ?? '—'}</span></div>)}</div> : <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--text-3)]">{isFinal ? 'No home run recorded.' : 'Outcome is not scored until the game is final.'}</p>}
            <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)]">Pregame top three</p><div className="grid gap-2 sm:grid-cols-3">{analysis.ranking.slice(0, 3).map(entry => <div key={entry.player.mlbId} className={`rounded-lg border p-2 ${homerIds.has(entry.player.mlbId) ? 'border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'border-[var(--border)] bg-[var(--surface)]'}`}><p className="truncate text-[12px] font-semibold text-[var(--text-1)]">{entry.rank}. {entry.player.name}</p><p className="text-[11px] text-[var(--text-3)]">{entry.score.toFixed(1)}</p></div>)}</div></div>
          </div>
        </article>
      })}
    </section>
  </div>
}

function PlayerAnalysisPanel({ analysis }: { analysis: MarketDnaAnalysis }) {
  return <div className="space-y-5">
    <section className="overflow-hidden rounded-3xl border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] bg-[color-mix(in_srgb,var(--bg)_80%,transparent)]"><div className="flex flex-wrap items-center gap-4 border-b border-[var(--border)] p-5"><PlayerAvatar headshot={mlbHeadshot(analysis.player.mlbId)} teamLogo={getTeamLogoUrl(analysis.player.team)} teamAbbr={analysis.player.team} name={analysis.player.name} size={58} /><div className="min-w-0 flex-1"><p className="text-[12px] font-semibold uppercase tracking-[.2em] text-[var(--accent)]">Captured market fingerprint</p><h2 className="truncate text-2xl font-semibold text-[var(--text-1)]">{analysis.player.name}</h2><p className="text-xs text-[var(--text-3)]">{analysis.player.team} #{analysis.player.battingOrder} · {analysis.stage === 'frozen_close' ? 'Frozen at first pitch' : 'Current pregame profile'}</p></div><strong className="text-2xl text-[var(--accent)]">{pct(analysis.read.nearestSimilarity)}</strong></div><div className="p-5"><MarketStrip player={analysis.player} /></div></section>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><SummaryMetric label="Same-player matches" value={pct(analysis.samePlayer.matchedHrRate)} detail={`${analysis.samePlayer.sample} comparable games`} /><SummaryMetric label="Nearest 25 analogs" value={pct(analysis.leagueAnalogs.top25HrRate)} detail="HR rate among closest profiles" /><SummaryMetric label="Historical lift" value={analysis.read.historicalHrLift == null ? '—' : `${analysis.read.historicalHrLift.toFixed(2)}x`} detail="Analogs versus filtered pool" /><SummaryMetric label="Coverage" value={pct(analysis.read.profileCoverage)} detail={`${analysis.sourceRows.toLocaleString()} rows scanned`} /></div>
    <div className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_70%,transparent)] p-4"><div className="flex gap-3"><Fingerprint className="text-[var(--accent)]" size={18} /><div><p className="text-xs font-semibold text-[var(--text-1)]">Profile read</p><p className="mt-1 text-sm leading-6 text-[var(--text-2)]">{analysis.read.summary}</p></div></div></div>
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_60%,transparent)]"><div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3"><div><p className="text-xs font-semibold text-[var(--text-1)]">Closest league-wide profiles</p><p className="text-[12px] text-[var(--text-3)]">Previous dates only</p></div><Target size={17} className="text-[var(--accent)]" /></div>{analysis.leagueAnalogs.matches.length ? analysis.leagueAnalogs.matches.map((match, index) => <MatchRow key={`${match.playerName}-${match.gameDate}-${match.gamePk}`} match={match} rank={index + 1} />) : <p className="p-6 text-sm text-[var(--text-3)]">No historical profiles met the minimum coverage.</p>}</section>
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_60%,transparent)]"><div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3"><div><p className="text-xs font-semibold text-[var(--text-1)]">This player’s closest prior profiles</p><p className="text-[12px] text-[var(--text-3)]">Same-player settlements from similar shapes</p></div><History size={17} className="text-cyan-300" /></div>{analysis.samePlayer.matches.length ? analysis.samePlayer.matches.map((match, index) => <MatchRow key={`${match.gameDate}-${match.gamePk}`} match={match} rank={index + 1} />) : <p className="p-6 text-sm text-[var(--text-3)]">No prior same-player profile has enough comparable fields yet.</p>}</section>
  </div>
}

export function MarketDnaLab() {
  const [date, setDate] = useState(todayEt)
  const [slate, setSlate] = useState<Slate | null>(null)
  const [selectedGamePk, setSelectedGamePk] = useState<number | null>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<MarketDnaPlayer | null>(null)
  const [mode, setMode] = useState<ViewMode>('game')
  const [playerAnalysis, setPlayerAnalysis] = useState<MarketDnaAnalysis | null>(null)
  const [gameAnalysis, setGameAnalysis] = useState<MarketDnaGameAnalysis | null>(null)
  const [slateAudit, setSlateAudit] = useState<MarketDnaSlateAudit | null>(null)
  const [loadingSlate, setLoadingSlate] = useState(true)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/admin/market-dna?date=${date}`, { signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not load the captured slate.'); return data as Slate })
      .then(data => { setSlate(data); const first = data.games.find(game => game.players.length); setSelectedGamePk(first?.gamePk ?? null); setSelectedPlayer(first?.players[0] ?? null) })
      .catch(caught => { if (caught instanceof Error && caught.name !== 'AbortError') setError(caught.message) })
      .finally(() => setLoadingSlate(false))
    return () => controller.abort()
  }, [date])

  useEffect(() => {
    if (date !== todayEt()) return
    let active = true
    const refresh = async () => {
      try {
        const response = await fetch(`/api/admin/market-dna?date=${date}`, { cache: 'no-store' })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Could not refresh live Dugout signals.')
        if (!active) return
        const nextSlate = data as Slate
        setSlate(nextSlate)
        setSelectedPlayer(current => {
          if (!current) return current
          const game = nextSlate.games.find(candidate => candidate.gamePk === current.gamePk)
          return game?.players.find(candidate => candidate.mlbId === current.mlbId) ?? current
        })
        setGameAnalysis(current => {
          if (!current) return current
          const game = nextSlate.games.find(candidate => candidate.gamePk === current.game.gamePk)
          if (!game) return current
          const resolve = (player: MarketDnaPlayer) => livePlayer(player, game)
          return {
            ...current,
            game,
            ranking: current.ranking.map(entry => ({ ...entry, player: resolve(entry.player) })),
            candidates: current.candidates.map(candidate => ({ ...candidate, player: resolve(candidate.player) })),
          }
        })
        setPlayerAnalysis(current => {
          if (!current) return current
          const game = nextSlate.games.find(candidate => candidate.gamePk === current.player.gamePk)
          return game ? { ...current, player: livePlayer(current.player, game) } : current
        })
      } catch {
        // Keep the last successful board visible. The next interval retries.
      }
    }
    const interval = window.setInterval(refresh, 30_000)
    return () => { active = false; window.clearInterval(interval) }
  }, [date])

  const selectedGame = slate?.games.find(game => game.gamePk === selectedGamePk) ?? null
  const visiblePlayers = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return (selectedGame?.players ?? []).filter(player => !normalized || `${player.name} ${player.team} ${player.position}`.toLowerCase().includes(normalized))
  }, [query, selectedGame])

  function resetAnalysis() { setPlayerAnalysis(null); setGameAnalysis(null); setSlateAudit(null); setError('') }
  function chooseGame(game: MarketDnaGame) { setSelectedGamePk(game.gamePk); setSelectedPlayer(game.players[0] ?? null); setQuery(''); resetAnalysis() }
  function changeDate(value: string) { setLoadingSlate(true); setSlate(null); setSelectedGamePk(null); setSelectedPlayer(null); resetAnalysis(); setDate(value) }

  async function runAnalysis() {
    if ((mode !== 'slate' && !selectedGame) || (mode === 'player' && !selectedPlayer)) return
    setLoadingAnalysis(true); resetAnalysis()
    try {
      const body = mode === 'slate'
        ? { mode: 'slate', date }
        : mode === 'game'
          ? { mode: 'game', date, gamePk: selectedGame!.gamePk }
          : { mode: 'player', date, gamePk: selectedGame!.gamePk, mlbId: selectedPlayer!.mlbId }
      const response = await fetch('/api/admin/market-dna', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Market DNA analysis failed.')
      if (mode === 'slate') setSlateAudit(data as MarketDnaSlateAudit)
      else if (mode === 'game') setGameAnalysis(data as MarketDnaGameAnalysis)
      else setPlayerAnalysis(data as MarketDnaAnalysis)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Market DNA analysis failed.') }
    finally { setLoadingAnalysis(false) }
  }

  return <div className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">
    <header className="relative mb-6 overflow-hidden rounded-3xl border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] bg-[var(--surface)] p-5 sm:p-7"><div className="relative flex flex-wrap items-end justify-between gap-5"><div className="max-w-3xl"><div className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[.24em] text-[var(--accent)]"><Dna size={15} /> Historical market intelligence</div><h1 className="text-3xl font-semibold tracking-tight text-[var(--text-1)] sm:text-4xl">Market DNA Lab</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-2)]">Rank the complete 18-player game board, then inspect any player’s closest settled market profiles. Pregame scoring and postgame outcomes remain strictly separated.</p></div><label className="min-w-52"><span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-[var(--text-3)]">Captured slate</span><div className="flex items-center gap-2 rounded-xl border border-[var(--border-2)] bg-[var(--overlay)] px-3"><CalendarDays size={15} className="text-[var(--accent)]" /><input type="date" value={date} max={todayEt()} onChange={event => changeDate(event.target.value)} className="h-11 min-w-0 flex-1 bg-transparent text-sm font-bold text-[var(--text-1)] outline-none [color-scheme:dark]" /></div></label></div></header>

    {error ? <div className="mb-5 flex items-center gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--red)_25%,transparent)] bg-[color-mix(in_srgb,var(--red)_10%,transparent)] p-4 text-sm text-[var(--red)]"><X size={17} />{error}</div> : null}
    {loadingSlate ? <div className="grid min-h-72 place-items-center rounded-3xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)]"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-[var(--accent)]" /><p className="mt-3 text-xs font-bold text-[var(--text-3)]">Reconstructing the captured boards</p></div></div> : null}

    {!loadingSlate && slate ? <div className="grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
      <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <div className="grid grid-cols-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-1"><button onClick={() => { setMode('slate'); resetAnalysis() }} className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-[12px] font-semibold ${mode === 'slate' ? 'bg-[var(--accent-fill)] text-[var(--accent-fg)]' : 'text-[var(--text-3)]'}`}><ShieldCheck size={13} />Date audit</button><button onClick={() => { setMode('game'); resetAnalysis() }} className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-[12px] font-semibold ${mode === 'game' ? 'bg-[var(--accent-fill)] text-[var(--accent-fg)]' : 'text-[var(--text-3)]'}`}><BarChart3 size={13} />Game board</button><button onClick={() => { setMode('player'); resetAnalysis() }} className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-[12px] font-semibold ${mode === 'player' ? 'bg-[var(--accent-fill)] text-[var(--accent-fg)]' : 'text-[var(--text-3)]'}`}><Fingerprint size={13} />Player DNA</button></div>
        <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_70%,transparent)]"><div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3"><div><p className="text-xs font-semibold text-[var(--text-1)]">Games</p><p className="text-[12px] text-[var(--text-3)]">{slate.games.length} captured</p></div><Database size={16} className="text-[var(--accent)]" /></div><div className="max-h-72 space-y-1 overflow-y-auto p-2">{slate.games.map(game => <button key={game.gamePk} onClick={() => chooseGame(game)} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${selectedGamePk === game.gamePk ? 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--surface)]'}`}><div className="flex -space-x-1"><TeamLogo logo={getTeamLogoUrl(game.awayAbbr)} name={game.awayAbbr} size={28} /><TeamLogo logo={getTeamLogoUrl(game.homeAbbr)} name={game.homeAbbr} size={28} /></div><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-[var(--text-1)]">{game.awayAbbr} at {game.homeAbbr}</p><p className="truncate text-[11px] uppercase tracking-wide text-[var(--text-3)]">{game.status} · {game.players.length}/18 profiles</p></div>{game.lineupConfirmed ? <Check size={13} className="text-[var(--accent)]" /> : <CircleDot size={13} className="text-[var(--gold)]" />}</button>)}</div></section>
        {mode === 'player' ? <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_70%,transparent)]"><div className="border-b border-[var(--border)] p-3"><label className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--overlay)] px-3"><Search size={14} className="text-[var(--text-3)]" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a player" className="h-9 min-w-0 flex-1 bg-transparent text-xs text-[var(--text-1)] outline-none" /></label></div><div className="max-h-[52vh] space-y-2 overflow-y-auto p-2">{visiblePlayers.map(player => <PlayerButton key={`${player.team}-${player.mlbId}`} player={player} selected={selectedPlayer?.mlbId === player.mlbId} onSelect={() => { setSelectedPlayer(player); resetAnalysis() }} />)}</div></section> : <div className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_70%,transparent)] p-4"><p className="flex items-center gap-2 text-xs font-semibold text-[var(--text-1)]"><Gauge size={15} className="text-[var(--accent)]" />{mode === 'slate' ? 'Leakage-proof scorecard' : 'Game-first reducer'}</p><p className="mt-2 text-[12px] leading-5 text-[var(--text-3)]">{mode === 'slate' ? 'Runs every complete board on the date, then joins outcomes afterward and exposes every miss.' : 'Compares all 18 across prices, settlement markets, each player’s history, league analogs, Statcast, lineup traffic and public leverage.'}</p></div>}
        <button onClick={runAnalysis} disabled={(mode !== 'slate' && !selectedGame) || (mode === 'player' && !selectedPlayer) || loadingAnalysis} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-fill)] px-4 text-sm font-semibold text-[var(--accent-fg)] shadow-[0_0_28px_rgba(163,230,53,.2)] transition hover:bg-[var(--accent-fill)] disabled:opacity-40">{loadingAnalysis ? <><LoaderCircle size={17} className="animate-spin" />Analyzing the archive</> : mode === 'slate' ? <><ShieldCheck size={17} />Audit every game</> : mode === 'game' ? <><Sparkles size={17} />Analyze 18-player board</> : <><Fingerprint size={17} />Run player match</>}</button>
      </aside>
      <div className="min-w-0">{slateAudit ? <SlateAuditPanel audit={slateAudit} /> : gameAnalysis ? <GameAnalysisPanel analysis={gameAnalysis} /> : playerAnalysis ? <PlayerAnalysisPanel analysis={playerAnalysis} /> : <div className="grid min-h-[620px] place-items-center rounded-3xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center"><div className="max-w-md"><span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]">{mode === 'slate' ? <ShieldCheck size={28} /> : mode === 'game' ? <BarChart3 size={28} /> : <Fingerprint size={28} />}</span><h2 className="mt-5 text-xl font-semibold text-[var(--text-1)]">{mode === 'slate' ? 'Audit the complete date' : mode === 'game' ? 'Reveal the complete game hierarchy' : 'Inspect one player profile'}</h2><p className="mt-2 text-sm leading-6 text-[var(--text-3)]">{mode === 'slate' ? 'Run every completed 18-player board and see the true pregame rank of every actual homer.' : mode === 'game' ? 'Rank every captured player together and see exactly where the strongest complete market profile separates.' : 'Compare one captured profile with previous settled player-games without using this game’s result.'}</p><div className="mt-5 flex flex-wrap justify-center gap-2 text-[12px] font-bold text-[var(--text-3)]"><span className="rounded-full border border-[var(--border)] px-3 py-1.5"><Activity size={11} className="mr-1 inline" />Pregame only</span><span className="rounded-full border border-[var(--border)] px-3 py-1.5"><ShieldCheck size={11} className="mr-1 inline" />Outcome isolated</span><span className="rounded-full border border-[var(--border)] px-3 py-1.5"><Gauge size={11} className="mr-1 inline" />Full market</span></div></div></div>}</div>
    </div> : null}
  </div>
}

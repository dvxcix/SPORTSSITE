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

function SummaryMetric({ label, value, detail, tone = 'text-white' }: { label: string; value: string; detail: string; tone?: string }) {
  return <div className="rounded-2xl border border-zinc-800/90 bg-black/30 p-4">
    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600">{label}</p>
    <p className={`mt-1 text-2xl font-black ${tone}`}>{value}</p>
    <p className="mt-1 text-[11px] text-zinc-500">{detail}</p>
  </div>
}

function ComponentBars({ components }: { components: MarketDnaGameComponents }) {
  const labels: Array<[keyof MarketDnaGameComponents, string]> = [
    ['market', 'Market'], ['settlement', 'Settlement'], ['movement', 'Movement'],
    ['historical', 'History'], ['statcast', 'Statcast'], ['traffic', 'Traffic'], ['publicLeverage', 'Leverage'],
  ]
  return <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
    {labels.map(([key, label]) => <div key={key} className="rounded-xl border border-zinc-800 bg-black/25 p-2.5">
      <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-wide text-zinc-500"><span>{label}</span><span className="text-zinc-300">{Math.round(components[key])}</span></div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-900"><div className="h-full rounded-full bg-gradient-to-r from-lime-500 to-cyan-400" style={{ width: `${Math.max(2, components[key])}%` }} /></div>
    </div>)}
  </div>
}

function OutcomeChips({ match }: { match: HistoricalMatch }) {
  return <div className="flex flex-wrap gap-1.5 text-[9px] font-black uppercase tracking-wide">
    {match.didHr ? <span className="rounded-full bg-lime-400 px-2 py-1 text-black">HR</span> : <span className="rounded-full bg-zinc-800 px-2 py-1 text-zinc-400">No HR</span>}
    {match.rbis != null && match.rbis > 0 ? <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-amber-300">{match.rbis} RBI</span> : null}
    {match.totalBases != null ? <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-cyan-300">{match.totalBases} TB</span> : null}
  </div>
}

function MatchRow({ match, rank }: { match: HistoricalMatch; rank: number }) {
  return <div className="grid gap-3 border-b border-zinc-800/70 px-4 py-4 last:border-0 md:grid-cols-[38px_minmax(170px,1fr)_120px_150px] md:items-center">
    <span className="grid h-8 w-8 place-items-center rounded-lg border border-zinc-800 bg-zinc-900 text-[10px] font-black text-zinc-500">{rank}</span>
    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-white">{match.playerName}</strong><span className="text-[10px] font-bold text-zinc-600">{match.team ?? 'MLB'} · #{match.battingOrder ?? '—'}</span></div><p className="mt-1 text-[10px] text-zinc-500">{match.gameDate} · HR {odds(match.hrOdds)} · FHR {odds(match.fhrOdds)}</p></div>
    <div><p className="text-lg font-black text-lime-300">{pct(match.similarity)}</p><p className="text-[9px] uppercase tracking-wide text-zinc-600">{pct(match.coverage)} coverage</p></div>
    <OutcomeChips match={match} />
  </div>
}

function MarketStrip({ player }: { player: MarketDnaPlayer }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
    {player.markets.filter(item => item.current != null).slice(0, 10).map(item => <div key={item.key} className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-2.5">
      <p className="truncate text-[9px] font-bold uppercase tracking-wide text-zinc-600">{item.label}</p>
      <div className="mt-1 flex items-end justify-between gap-2"><strong className="text-sm text-white">{odds(item.current)}</strong><span className={item.probabilityMove == null ? 'text-zinc-700' : item.probabilityMove > 0 ? 'text-lime-400' : item.probabilityMove < 0 ? 'text-red-400' : 'text-zinc-500'}>{signed(item.probabilityMove)}</span></div>
    </div>)}
  </div>
}

function MmL1Value({ value, showLabel = false }: { value: number | null; showLabel?: boolean }) {
  const color = value == null ? '#71717a' : value > 3 ? '#4ade80' : value < -3 ? '#f87171' : '#f4f4f5'
  const display = value == null ? '—' : `${value > 0 ? '+' : ''}${value}`
  return <span className="inline-flex items-center gap-1.5 font-bold" style={{ color }}>
    {showLabel ? <span className="text-[8px] font-black uppercase tracking-wider text-zinc-600">MM · Last 1</span> : null}
    <span>{display}</span>
  </span>
}

function PlayerButton({ player, selected, onSelect }: { player: MarketDnaPlayer; selected: boolean; onSelect: () => void }) {
  return <button onClick={onSelect} className={`group flex min-h-16 w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${selected ? 'border-lime-400/70 bg-lime-400/10' : 'border-zinc-800 bg-zinc-950/70 hover:border-zinc-700 hover:bg-zinc-900'}`}>
    <PlayerAvatar headshot={mlbHeadshot(player.mlbId)} teamLogo={getTeamLogoUrl(player.team)} teamAbbr={player.team} name={player.name} size={38} />
    <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-[10px] font-black text-zinc-600">{player.battingOrder}</span><strong className="truncate text-xs text-white">{player.name}</strong></div><p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-zinc-600">{player.position} · {player.team} · HR {odds(market(player, 'hr')?.current)}</p></div>
    <span className="flex shrink-0 items-center gap-2 text-[10px]"><MmL1Value value={player.metrics.mmL1} showLabel /><ChevronRight size={14} className={selected ? 'text-lime-300' : 'text-zinc-700'} /></span>
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
    <div className={`rounded-lg border border-zinc-800 bg-black/30 ${compact ? 'px-2 py-1.5' : 'px-3 py-2.5'}`}>
      <p className="text-[8px] font-black uppercase tracking-wider text-zinc-600">FHR%</p>
      <p className={compact ? 'text-xs' : 'text-base'} style={fhrStyle}>{pct(player.metrics.dugoutFhrPct, 1)}</p>
    </div>
    <div className={`rounded-lg border border-zinc-800 bg-black/30 ${compact ? 'px-2 py-1.5' : 'px-3 py-2.5'}`}>
      <p className="text-[8px] font-black uppercase tracking-wider text-zinc-600">HR%</p>
      <p className={compact ? 'text-xs' : 'text-base'} style={hrStyle}>{pct(player.metrics.dugoutHrPct, 1)}</p>
    </div>
    <div className={`rounded-lg border border-amber-400/15 bg-amber-400/[.04] ${compact ? 'px-2 py-1.5' : 'px-3 py-2.5'}`}>
      <p className="flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-zinc-600"><span className="h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(253,224,71,.8)]" />Public HR</p>
      <p className={`${compact ? 'text-xs' : 'text-base'} font-black text-amber-200`}>{publicHrPicks.toLocaleString()}</p>
    </div>
    <div className={`rounded-lg border border-zinc-800 bg-black/30 ${compact ? 'px-2 py-1.5' : 'px-3 py-2.5'}`}>
      <p className="text-[8px] font-black uppercase tracking-wider text-zinc-600">MM · Last 1</p>
      <p className={compact ? 'text-xs' : 'text-base'}><MmL1Value value={player.metrics.mmL1} /></p>
    </div>
  </div>
}

function RankRow({ entry, game }: { entry: MarketDnaGameRank; game?: MarketDnaGame | null }) {
  const [open, setOpen] = useState(entry.rank <= 2)
  const player = livePlayer(entry.player, game)
  const pool = game?.players ?? [entry.player]
  return <div className="border-b border-zinc-800/70 last:border-0">
    <button onClick={() => setOpen(value => !value)} className="grid w-full gap-3 px-3 py-4 text-left transition hover:bg-white/[.025] xl:grid-cols-[44px_minmax(190px,1fr)_72px_276px_78px_78px_28px] xl:items-center xl:px-4">
      <span className={`grid h-9 w-9 place-items-center rounded-xl border text-xs font-black ${entry.rank === 1 ? 'border-lime-400/40 bg-lime-400/15 text-lime-300' : 'border-zinc-800 bg-zinc-900 text-zinc-500'}`}>{entry.rank}</span>
      <div className="flex min-w-0 items-center gap-3"><PlayerAvatar headshot={mlbHeadshot(entry.player.mlbId)} teamLogo={getTeamLogoUrl(entry.player.team)} teamAbbr={entry.player.team} name={entry.player.name} size={42} /><div className="min-w-0"><strong className="block truncate text-sm text-white">{entry.player.name}</strong><p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">{entry.player.team} · #{entry.player.battingOrder} · {entry.player.position}</p></div></div>
      <div><p className="text-[9px] font-black uppercase text-zinc-600">Learned</p><p className="text-lg font-black text-lime-300">{entry.score.toFixed(1)}</p></div>
      <DugoutSignals player={player} pool={pool} compact />
      <div><p className="text-[9px] font-black uppercase text-zinc-600">FHR</p><p className="text-sm font-black text-white">{odds(market(player, 'fhr')?.current)}</p></div>
      <div><p className="text-[9px] font-black uppercase text-zinc-600">Anytime</p><p className="text-sm font-black text-white">{odds(market(player, 'hr')?.current)}</p></div>
      <ChevronDown size={15} className={`text-zinc-600 transition ${open ? 'rotate-180' : ''}`} />
    </button>
    {open ? <div className="space-y-4 bg-black/20 px-4 pb-4 pt-1">
      <ComponentBars components={entry.components} />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric label="Broad profile" value={entry.profileScore.toFixed(1)} detail="Descriptive evidence score, not the learned rank" />
        <SummaryMetric label="Own matched profile" value={pct(entry.historical.samePlayerHrRate)} detail={`${entry.historical.samePlayerSample} same-player comparisons`} />
        <SummaryMetric label="Own baseline" value={pct(entry.historical.samePlayerBaselineHrRate)} detail={entry.historical.samePlayerLift == null ? 'No stable self-lift yet' : `${entry.historical.samePlayerLift.toFixed(2)}x profile lift`} />
        <SummaryMetric label="Blended analog rate" value={pct(entry.historical.profileProbability)} detail={`${entry.historical.sample} nearest league profiles`} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-lime-400/15 bg-lime-400/[.04] p-3"><p className="text-[9px] font-black uppercase tracking-wider text-lime-300">What separates</p><ul className="mt-2 space-y-1 text-xs text-zinc-300">{entry.signals.map(signal => <li key={signal}>• {signal}</li>)}</ul></div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Checks against the read</p>{entry.contradictions.length ? <ul className="mt-2 space-y-1 text-xs text-zinc-400">{entry.contradictions.map(item => <li key={item}>• {item}</li>)}</ul> : <p className="mt-2 text-xs text-zinc-500">No major captured contradiction.</p>}</div>
      </div>
      <div className="flex flex-wrap gap-2 text-[10px] text-zinc-500"><span>Analog HR: {pct(entry.historical.matchedHrRate)}</span><span>·</span><span>Game-relative lift: {entry.historical.lift == null ? '—' : `${entry.historical.lift.toFixed(2)}x`}</span><span>·</span><span>Multi-RBI HR shape: {pct(entry.historical.settlementShape.multiRbiHrRate)}</span><span>·</span><span>5+ TB HR shape: {pct(entry.historical.settlementShape.fivePlusTbHrRate)}</span>{entry.outcome ? <><span>·</span><strong className={entry.outcome.hr ? 'text-lime-300' : 'text-zinc-600'}>{entry.outcome.hr ? `${entry.outcome.hr} HR · ${entry.outcome.rbi} RBI · ${entry.outcome.tb} TB${entry.outcome.hrMlWon ? ' · HR/ML' : ''}` : 'No HR'}</strong></> : null}</div>
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
    <section className="overflow-hidden rounded-3xl border border-lime-400/25 bg-[radial-gradient(circle_at_top_left,rgba(163,230,53,.14),transparent_44%),rgba(9,9,11,.92)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-4 sm:px-5"><div><p className="text-xs font-black text-white">Game-first decision</p><p className="mt-1 max-w-3xl text-[11px] leading-5 text-zinc-500">The game HR volume is estimated first. Zero, one or several independent player cards can follow; no pair is forced.</p></div>{analysis.projection ? <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-right"><p className="text-[8px] font-black uppercase tracking-wider text-cyan-300">Projected HR events</p><p className="text-xl font-black text-white">{analysis.projection.label}</p><p className="text-[9px] text-zinc-500">{Math.round(analysis.projection.confidence * 100)}% bucket confidence</p></div> : null}</div>
      {analysis.candidates.length ? <div className="grid gap-3 p-4 lg:grid-cols-2">{analysis.candidates.map(candidate => {
        const result = analysis.actualHomeRuns.find(outcome => outcome.mlbId === candidate.player.mlbId)
        const candidatePlayer = livePlayer(candidate.player, liveGame)
        return <article key={candidate.player.mlbId} className="rounded-2xl border border-zinc-800 bg-black/40 p-4">
          <div className="mb-3"><DugoutSignals player={candidatePlayer} pool={signalPool} /></div>
          <div className="flex items-center gap-3"><PlayerAvatar headshot={mlbHeadshot(candidate.player.mlbId)} teamLogo={getTeamLogoUrl(candidate.player.team)} teamAbbr={candidate.player.team} name={candidate.player.name} size={48} /><div className="min-w-0 flex-1"><p className="text-[9px] font-black uppercase tracking-[.16em] text-lime-300">{candidate.label}</p><h3 className="truncate text-base font-black text-white">{candidate.player.name}</h3><p className="text-[10px] text-zinc-500">{candidate.player.team} #{candidate.player.battingOrder} · learned rank #{candidate.learnedRank}</p></div><div className="text-right"><p className="text-xl font-black text-lime-300">{candidate.score.toFixed(1)}</p><p className="text-[8px] font-black uppercase text-zinc-600">lane score</p></div></div>
          <ul className="mt-3 space-y-1.5 text-[11px] leading-5 text-zinc-400">{candidate.reasons.map(reason => <li key={reason}>• {reason}</li>)}</ul>
          {result ? <p className="mt-3 rounded-lg border border-lime-400/20 bg-lime-400/10 px-3 py-2 text-[10px] font-black text-lime-300">Postgame: {result.homeRuns} HR · {result.rbis} RBI · {result.totalBases} TB{result.hrMlWon ? ' · HR/ML' : ''}</p> : null}
        </article>
      })}</div> : <div className="p-5"><p className="rounded-xl border border-zinc-800 bg-black/30 p-4 text-sm text-zinc-400">{analysis.readState === 'clear' && analysis.projection?.candidateLimit === 0 ? 'No-HR is the game model strongest pregame bucket. No player card is forced.' : 'No player cleared the separation threshold. The reducer passes instead of inventing a pair.'}</p></div>}
    </section>
    <section className="overflow-hidden rounded-3xl border border-lime-400/25 bg-[radial-gradient(circle_at_top_left,rgba(163,230,53,.16),transparent_42%),rgba(9,9,11,.9)]">
      <div className="flex flex-wrap items-center gap-4 border-b border-zinc-800/80 p-5 sm:p-6">
        <PlayerAvatar headshot={mlbHeadshot(leader.player.mlbId)} teamLogo={getTeamLogoUrl(leader.player.team)} teamAbbr={leader.player.team} name={leader.player.name} size={64} />
        <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-300">Learned HR likelihood leader</p><h2 className="truncate text-2xl font-black text-white sm:text-3xl">{leader.player.name}</h2><p className="mt-1 text-xs text-zinc-500">{leader.player.team} #{leader.player.battingOrder} · all 18 compared · {analysis.stage === 'frozen_close' ? 'frozen at first pitch' : 'current pregame capture'}</p><p className="mt-2 text-[10px] text-zinc-600">This is the learned probability lens. The game-specific lanes above are scored separately.</p></div>
        <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-5 py-3 text-right"><p className="text-[9px] font-black uppercase tracking-wider text-cyan-300">Learned rank</p><p className="text-3xl font-black text-white">#1</p><p className="text-[10px] text-zinc-500">{leader.score.toFixed(1)} score</p></div>
      </div>
      <div className="space-y-4 p-5 sm:p-6"><ComponentBars components={leader.components} /><DugoutSignals player={liveLeader} pool={signalPool} /><MarketStrip player={liveLeader} /></div>
    </section>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryMetric label="Learned separation" value={`+${analysis.separation.toFixed(1)}`} detail="Learned leader over the second-ranked profile" tone="text-cyan-300" />
      <SummaryMetric label="Profiles ranked" value={`${analysis.ranking.length}/18`} detail="One game, one comparable field" />
      <SummaryMetric label="Training rows" value={(analysis.reducer?.trainingRows ?? analysis.sourceRows).toLocaleString()} detail={analysis.reducer ? `Completed boards through ${analysis.reducer.trainedThrough}` : 'Pregame-only archive rows scanned'} />
      <SummaryMetric label="Board stage" value={analysis.stage === 'frozen_close' ? 'CLOSE' : 'LIVE'} detail={analysis.stage === 'frozen_close' ? 'Locked at first pitch' : 'Updates with captured markets'} />
    </div>

    {validation ? <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-black text-white">Held-out validation</p><p className="text-[10px] text-zinc-600">Games from {validation.cutoff} forward were excluded from that validation model.</p></div><span className="rounded-full border border-lime-400/20 bg-lime-400/10 px-2.5 py-1 text-[9px] font-black uppercase text-lime-300">{analysis.reducer?.version}</span></div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric label="Guarded top one" value={pct(validation.guardedTopOne)} detail={validation.guardActive ? `Market guard active · raw learned ${pct(validation.gameFirstTopOne)}` : `Learned-only: ${pct(validation.learnedTopOne)}`} />
        <SummaryMetric label="Guarded top two" value={pct(validation.guardedTopTwo)} detail={`Top three: ${pct(validation.guardedTopThree)}`} tone="text-lime-300" />
        <SummaryMetric label="Selected coverage" value={pct(validation.selectedGameCoverage)} detail={`Player precision: ${pct(validation.selectedPlayerPrecision)}`} />
        <SummaryMetric label="Count model" value={pct(validation.countBucketAccuracy)} detail={`No-HR: ${pct(validation.noHrAccuracy)} · MAE ${validation.countMae.toFixed(2)}`} />
      </div>
    </section> : null}

    {analysis.outcomeAvailable ? <section className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[.05] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-cyan-300"><ShieldCheck size={15} /> Postgame reveal</p><p className="mt-1 text-xs text-zinc-500">Attached after scoring. Never used in the ranking.</p></div>{analysis.score ? <strong className="text-sm text-white">{analysis.game.awayAbbr} {analysis.score.away} · {analysis.game.homeAbbr} {analysis.score.home}</strong> : null}</div>
      {analysis.actualHomeRuns.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{analysis.actualHomeRuns.map(result => <div key={`${result.mlbId}-${result.name}`} className="flex items-center gap-3 rounded-xl border border-cyan-400/15 bg-black/30 p-3"><PlayerAvatar headshot={result.mlbId ? mlbHeadshot(result.mlbId) : null} teamLogo={getTeamLogoUrl(result.team)} teamAbbr={result.team} name={result.name} size={42} /><div className="min-w-0 flex-1"><strong className="text-sm text-white">{result.name}</strong><p className="text-[10px] text-zinc-500">Pregame rank #{result.pregameRank ?? '—'} · {result.homeRuns} HR · {result.rbis} RBI · {result.totalBases} TB</p></div><div className="flex flex-col gap-1 text-right text-[9px] font-black uppercase">{result.firstHr ? <span className="text-lime-300">First HR</span> : null}{result.hrMlWon ? <span className="text-cyan-300">HR/ML</span> : null}</div></div>)}</div> : <p className="mt-4 rounded-xl border border-zinc-800 bg-black/20 p-4 text-sm text-zinc-500">No home runs recorded in the MLB result.</p>}
    </section> : null}

    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/70">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3"><div><p className="text-xs font-black text-white">All 18, game-first ranking</p><p className="text-[10px] text-zinc-600">Market, settlement, mechanics, MM and public leverage are compared inside this game. Outcomes attach afterward.</p></div><Trophy size={17} className="text-lime-300" /></div>
      {analysis.ranking.map(entry => <RankRow key={entry.player.mlbId} entry={entry} game={liveGame ?? analysis.game} />)}
    </section>
  </div>
}

function SlateAuditPanel({ audit }: { audit: MarketDnaSlateAudit }) {
  const { summary } = audit
  return <div className="space-y-5">
    <section className="rounded-3xl border border-lime-400/20 bg-[radial-gradient(circle_at_top_left,rgba(163,230,53,.14),transparent_40%),rgba(9,9,11,.92)] p-5 sm:p-6">
      <p className="text-[10px] font-black uppercase tracking-[.2em] text-lime-300">Final-slate validation</p>
      <h2 className="mt-1 text-2xl font-black text-white">Every game, every actual homer rank</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Each board is scored from information available before first pitch. Results are joined afterward so a miss stays visible instead of being rewritten.</p>
    </section>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <SummaryMetric label="Games with HR" value={`${summary.gamesWithHomeRun}`} detail={`${summary.completedGames} final boards`} />
      <SummaryMetric label="#1 contained HR" value={`${summary.leaderHitGames}/${summary.gamesWithHomeRun}`} detail="At least one actual homer ranked first" tone="text-lime-300" />
      <SummaryMetric label="Top two contained HR" value={`${summary.topTwoHitGames}/${summary.gamesWithHomeRun}`} detail="At least one actual homer in the top two" />
      <SummaryMetric label="Selected cards contained HR" value={`${summary.candidateCoverageGames}/${summary.gamesWithHomeRun}`} detail="Variable-cardinality pregame reads" tone="text-amber-300" />
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
        return <article key={analysis.game.gamePk} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/70">
          <div className="flex items-center gap-3 border-b border-zinc-800 p-4">
            <div className="flex -space-x-1"><TeamLogo logo={getTeamLogoUrl(analysis.game.awayAbbr)} name={analysis.game.awayAbbr} size={32} /><TeamLogo logo={getTeamLogoUrl(analysis.game.homeAbbr)} name={analysis.game.homeAbbr} size={32} /></div>
            <div className="min-w-0 flex-1"><p className="text-sm font-black text-white">{analysis.game.awayAbbr} at {analysis.game.homeAbbr}</p><p className="text-[10px] text-zinc-600">{analysis.score ? `${analysis.game.awayAbbr} ${analysis.score.away} · ${analysis.game.homeAbbr} ${analysis.score.home}` : analysis.game.status}</p></div>
            <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${!isFinal ? 'border-cyan-400/25 bg-cyan-400/10 text-cyan-300' : perfect ? 'border-lime-400/30 bg-lime-400/10 text-lime-300' : analysis.actualHomeRuns.length ? 'border-amber-400/25 bg-amber-400/10 text-amber-300' : 'border-zinc-700 bg-zinc-900 text-zinc-500'}`}>{!isFinal ? 'Awaiting final' : analysis.actualHomeRuns.length ? perfect ? 'Perfect separation' : 'Miss exposed' : 'No HR'}</span>
          </div>
          <div className="space-y-3 p-4">
            {analysis.actualHomeRuns.length ? <div className="space-y-2">{analysis.actualHomeRuns.map(result => <div key={`${result.mlbId}-${result.name}`} className="flex items-center gap-3 rounded-xl border border-lime-400/15 bg-lime-400/[.04] p-2.5"><PlayerAvatar headshot={result.mlbId ? mlbHeadshot(result.mlbId) : null} teamLogo={getTeamLogoUrl(result.team)} teamAbbr={result.team} name={result.name} size={36} /><div className="min-w-0 flex-1"><strong className="text-xs text-white">{result.name}</strong><p className="text-[9px] text-zinc-500">{result.homeRuns} HR · {result.rbis} RBI · {result.totalBases} TB{result.hrMlWon ? ' · HR/ML' : ''}</p></div><span className="text-lg font-black text-lime-300">#{result.pregameRank ?? '—'}</span></div>)}</div> : <p className="rounded-xl border border-zinc-800 bg-black/20 p-3 text-xs text-zinc-500">{isFinal ? 'No home run recorded.' : 'Outcome is not scored until the game is final.'}</p>}
            <div><p className="mb-2 text-[9px] font-black uppercase tracking-wider text-zinc-600">Pregame top three</p><div className="grid gap-2 sm:grid-cols-3">{analysis.ranking.slice(0, 3).map(entry => <div key={entry.player.mlbId} className={`rounded-lg border p-2 ${homerIds.has(entry.player.mlbId) ? 'border-lime-400/30 bg-lime-400/10' : 'border-zinc-800 bg-black/25'}`}><p className="truncate text-[10px] font-black text-white">{entry.rank}. {entry.player.name}</p><p className="text-[9px] text-zinc-600">{entry.score.toFixed(1)}</p></div>)}</div></div>
          </div>
        </article>
      })}
    </section>
  </div>
}

function PlayerAnalysisPanel({ analysis }: { analysis: MarketDnaAnalysis }) {
  return <div className="space-y-5">
    <section className="overflow-hidden rounded-3xl border border-lime-400/20 bg-zinc-950/80"><div className="flex flex-wrap items-center gap-4 border-b border-zinc-800 p-5"><PlayerAvatar headshot={mlbHeadshot(analysis.player.mlbId)} teamLogo={getTeamLogoUrl(analysis.player.team)} teamAbbr={analysis.player.team} name={analysis.player.name} size={58} /><div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.2em] text-lime-300">Captured market fingerprint</p><h2 className="truncate text-2xl font-black text-white">{analysis.player.name}</h2><p className="text-xs text-zinc-500">{analysis.player.team} #{analysis.player.battingOrder} · {analysis.stage === 'frozen_close' ? 'Frozen at first pitch' : 'Current pregame profile'}</p></div><strong className="text-2xl text-lime-300">{pct(analysis.read.nearestSimilarity)}</strong></div><div className="p-5"><MarketStrip player={analysis.player} /></div></section>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><SummaryMetric label="Same-player matches" value={pct(analysis.samePlayer.matchedHrRate)} detail={`${analysis.samePlayer.sample} comparable games`} /><SummaryMetric label="Nearest 25 analogs" value={pct(analysis.leagueAnalogs.top25HrRate)} detail="HR rate among closest profiles" /><SummaryMetric label="Historical lift" value={analysis.read.historicalHrLift == null ? '—' : `${analysis.read.historicalHrLift.toFixed(2)}x`} detail="Analogs versus filtered pool" /><SummaryMetric label="Coverage" value={pct(analysis.read.profileCoverage)} detail={`${analysis.sourceRows.toLocaleString()} rows scanned`} /></div>
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4"><div className="flex gap-3"><Fingerprint className="text-lime-300" size={18} /><div><p className="text-xs font-black text-white">Profile read</p><p className="mt-1 text-sm leading-6 text-zinc-400">{analysis.read.summary}</p></div></div></div>
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/60"><div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3"><div><p className="text-xs font-black text-white">Closest league-wide profiles</p><p className="text-[10px] text-zinc-600">Previous dates only</p></div><Target size={17} className="text-lime-300" /></div>{analysis.leagueAnalogs.matches.length ? analysis.leagueAnalogs.matches.map((match, index) => <MatchRow key={`${match.playerName}-${match.gameDate}-${match.gamePk}`} match={match} rank={index + 1} />) : <p className="p-6 text-sm text-zinc-500">No historical profiles met the minimum coverage.</p>}</section>
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/60"><div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3"><div><p className="text-xs font-black text-white">This player’s closest prior profiles</p><p className="text-[10px] text-zinc-600">Same-player settlements from similar shapes</p></div><History size={17} className="text-cyan-300" /></div>{analysis.samePlayer.matches.length ? analysis.samePlayer.matches.map((match, index) => <MatchRow key={`${match.gameDate}-${match.gamePk}`} match={match} rank={index + 1} />) : <p className="p-6 text-sm text-zinc-500">No prior same-player profile has enough comparable fields yet.</p>}</section>
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
    <header className="relative mb-6 overflow-hidden rounded-3xl border border-lime-400/20 bg-[radial-gradient(circle_at_15%_0%,rgba(163,230,53,.18),transparent_34%),linear-gradient(135deg,rgba(24,24,27,.96),rgba(9,9,11,.96))] p-5 sm:p-7"><div className="relative flex flex-wrap items-end justify-between gap-5"><div className="max-w-3xl"><div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[.24em] text-lime-300"><Dna size={15} /> Historical market intelligence</div><h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Market DNA Lab</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Rank the complete 18-player game board, then inspect any player’s closest settled market profiles. Pregame scoring and postgame outcomes remain strictly separated.</p></div><label className="min-w-52"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-zinc-500">Captured slate</span><div className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-black/40 px-3"><CalendarDays size={15} className="text-lime-300" /><input type="date" value={date} max={todayEt()} onChange={event => changeDate(event.target.value)} className="h-11 min-w-0 flex-1 bg-transparent text-sm font-bold text-white outline-none [color-scheme:dark]" /></div></label></div></header>

    {error ? <div className="mb-5 flex items-center gap-3 rounded-2xl border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-200"><X size={17} />{error}</div> : null}
    {loadingSlate ? <div className="grid min-h-72 place-items-center rounded-3xl border border-zinc-800 bg-zinc-950/50"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-lime-300" /><p className="mt-3 text-xs font-bold text-zinc-500">Reconstructing the captured boards</p></div></div> : null}

    {!loadingSlate && slate ? <div className="grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
      <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <div className="grid grid-cols-3 rounded-xl border border-zinc-800 bg-zinc-950 p-1"><button onClick={() => { setMode('slate'); resetAnalysis() }} className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-[11px] font-black ${mode === 'slate' ? 'bg-lime-400 text-black' : 'text-zinc-500'}`}><ShieldCheck size={13} />Date audit</button><button onClick={() => { setMode('game'); resetAnalysis() }} className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-[11px] font-black ${mode === 'game' ? 'bg-lime-400 text-black' : 'text-zinc-500'}`}><BarChart3 size={13} />Game board</button><button onClick={() => { setMode('player'); resetAnalysis() }} className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-[11px] font-black ${mode === 'player' ? 'bg-lime-400 text-black' : 'text-zinc-500'}`}><Fingerprint size={13} />Player DNA</button></div>
        <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/70"><div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3"><div><p className="text-xs font-black text-white">Games</p><p className="text-[10px] text-zinc-600">{slate.games.length} captured</p></div><Database size={16} className="text-lime-300" /></div><div className="max-h-72 space-y-1 overflow-y-auto p-2">{slate.games.map(game => <button key={game.gamePk} onClick={() => chooseGame(game)} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${selectedGamePk === game.gamePk ? 'border-lime-400/40 bg-lime-400/10' : 'border-transparent hover:border-zinc-800 hover:bg-zinc-900'}`}><div className="flex -space-x-1"><TeamLogo logo={getTeamLogoUrl(game.awayAbbr)} name={game.awayAbbr} size={28} /><TeamLogo logo={getTeamLogoUrl(game.homeAbbr)} name={game.homeAbbr} size={28} /></div><div className="min-w-0 flex-1"><p className="text-xs font-black text-white">{game.awayAbbr} at {game.homeAbbr}</p><p className="truncate text-[9px] uppercase tracking-wide text-zinc-600">{game.status} · {game.players.length}/18 profiles</p></div>{game.lineupConfirmed ? <Check size={13} className="text-lime-400" /> : <CircleDot size={13} className="text-amber-400" />}</button>)}</div></section>
        {mode === 'player' ? <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/70"><div className="border-b border-zinc-800 p-3"><label className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-black/30 px-3"><Search size={14} className="text-zinc-600" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a player" className="h-9 min-w-0 flex-1 bg-transparent text-xs text-white outline-none" /></label></div><div className="max-h-[52vh] space-y-2 overflow-y-auto p-2">{visiblePlayers.map(player => <PlayerButton key={`${player.team}-${player.mlbId}`} player={player} selected={selectedPlayer?.mlbId === player.mlbId} onSelect={() => { setSelectedPlayer(player); resetAnalysis() }} />)}</div></section> : <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4"><p className="flex items-center gap-2 text-xs font-black text-white"><Gauge size={15} className="text-lime-300" />{mode === 'slate' ? 'Leakage-proof scorecard' : 'Game-first reducer'}</p><p className="mt-2 text-[11px] leading-5 text-zinc-500">{mode === 'slate' ? 'Runs every complete board on the date, then joins outcomes afterward and exposes every miss.' : 'Compares all 18 across prices, settlement markets, each player’s history, league analogs, Statcast, lineup traffic and public leverage.'}</p></div>}
        <button onClick={runAnalysis} disabled={(mode !== 'slate' && !selectedGame) || (mode === 'player' && !selectedPlayer) || loadingAnalysis} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-lime-400 px-4 text-sm font-black text-black shadow-[0_0_28px_rgba(163,230,53,.2)] transition hover:bg-lime-300 disabled:opacity-40">{loadingAnalysis ? <><LoaderCircle size={17} className="animate-spin" />Analyzing the archive</> : mode === 'slate' ? <><ShieldCheck size={17} />Audit every game</> : mode === 'game' ? <><Sparkles size={17} />Analyze 18-player board</> : <><Fingerprint size={17} />Run player match</>}</button>
      </aside>
      <main className="min-w-0">{slateAudit ? <SlateAuditPanel audit={slateAudit} /> : gameAnalysis ? <GameAnalysisPanel analysis={gameAnalysis} /> : playerAnalysis ? <PlayerAnalysisPanel analysis={playerAnalysis} /> : <div className="grid min-h-[620px] place-items-center rounded-3xl border border-dashed border-zinc-800 bg-[radial-gradient(circle_at_center,rgba(163,230,53,.05),transparent_45%)] p-8 text-center"><div className="max-w-md"><span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-lime-400/20 bg-lime-400/10 text-lime-300">{mode === 'slate' ? <ShieldCheck size={28} /> : mode === 'game' ? <BarChart3 size={28} /> : <Fingerprint size={28} />}</span><h2 className="mt-5 text-xl font-black text-white">{mode === 'slate' ? 'Audit the complete date' : mode === 'game' ? 'Reveal the complete game hierarchy' : 'Inspect one player profile'}</h2><p className="mt-2 text-sm leading-6 text-zinc-500">{mode === 'slate' ? 'Run every completed 18-player board and see the true pregame rank of every actual homer.' : mode === 'game' ? 'Rank every captured player together and see exactly where the strongest complete market profile separates.' : 'Compare one captured profile with previous settled player-games without using this game’s result.'}</p><div className="mt-5 flex flex-wrap justify-center gap-2 text-[10px] font-bold text-zinc-500"><span className="rounded-full border border-zinc-800 px-3 py-1.5"><Activity size={11} className="mr-1 inline" />Pregame only</span><span className="rounded-full border border-zinc-800 px-3 py-1.5"><ShieldCheck size={11} className="mr-1 inline" />Outcome isolated</span><span className="rounded-full border border-zinc-800 px-3 py-1.5"><Gauge size={11} className="mr-1 inline" />Full market</span></div></div></div>}</main>
    </div> : null}
  </div>
}

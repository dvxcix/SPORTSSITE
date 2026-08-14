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
import type {
  HistoricalMatch, MarketDnaAnalysis, MarketDnaGame, MarketDnaGameAnalysis,
  MarketDnaGameComponents, MarketDnaGameRank, MarketDnaPlayer,
} from '@/lib/marketDna'

type Slate = { date: string; games: MarketDnaGame[] }
type ViewMode = 'game' | 'player'

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

function PlayerButton({ player, selected, onSelect }: { player: MarketDnaPlayer; selected: boolean; onSelect: () => void }) {
  return <button onClick={onSelect} className={`group flex min-h-16 w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${selected ? 'border-lime-400/70 bg-lime-400/10' : 'border-zinc-800 bg-zinc-950/70 hover:border-zinc-700 hover:bg-zinc-900'}`}>
    <PlayerAvatar headshot={mlbHeadshot(player.mlbId)} teamLogo={getTeamLogoUrl(player.team)} teamAbbr={player.team} name={player.name} size={38} />
    <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-[10px] font-black text-zinc-600">{player.battingOrder}</span><strong className="truncate text-xs text-white">{player.name}</strong></div><p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-zinc-600">{player.position} · {player.team} · HR {odds(market(player, 'hr')?.current)}</p></div>
    <ChevronRight size={14} className={selected ? 'text-lime-300' : 'text-zinc-700'} />
  </button>
}

function RankRow({ entry }: { entry: MarketDnaGameRank }) {
  const [open, setOpen] = useState(entry.rank <= 2)
  return <div className="border-b border-zinc-800/70 last:border-0">
    <button onClick={() => setOpen(value => !value)} className="grid w-full gap-3 px-3 py-4 text-left transition hover:bg-white/[.025] sm:grid-cols-[44px_minmax(210px,1fr)_85px_100px_100px_28px] sm:items-center sm:px-4">
      <span className={`grid h-9 w-9 place-items-center rounded-xl border text-xs font-black ${entry.rank === 1 ? 'border-lime-400/40 bg-lime-400/15 text-lime-300' : 'border-zinc-800 bg-zinc-900 text-zinc-500'}`}>{entry.rank}</span>
      <div className="flex min-w-0 items-center gap-3"><PlayerAvatar headshot={mlbHeadshot(entry.player.mlbId)} teamLogo={getTeamLogoUrl(entry.player.team)} teamAbbr={entry.player.team} name={entry.player.name} size={42} /><div className="min-w-0"><strong className="block truncate text-sm text-white">{entry.player.name}</strong><p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">{entry.player.team} · #{entry.player.battingOrder} · {entry.player.position}</p></div></div>
      <div><p className="text-[9px] font-black uppercase text-zinc-600">Score</p><p className="text-lg font-black text-lime-300">{entry.score.toFixed(1)}</p></div>
      <div><p className="text-[9px] font-black uppercase text-zinc-600">FHR</p><p className="text-sm font-black text-white">{odds(market(entry.player, 'fhr')?.current)}</p></div>
      <div><p className="text-[9px] font-black uppercase text-zinc-600">Anytime</p><p className="text-sm font-black text-white">{odds(market(entry.player, 'hr')?.current)}</p></div>
      <ChevronDown size={15} className={`text-zinc-600 transition ${open ? 'rotate-180' : ''}`} />
    </button>
    {open ? <div className="space-y-4 bg-black/20 px-4 pb-4 pt-1">
      <ComponentBars components={entry.components} />
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-lime-400/15 bg-lime-400/[.04] p-3"><p className="text-[9px] font-black uppercase tracking-wider text-lime-300">What separates</p><ul className="mt-2 space-y-1 text-xs text-zinc-300">{entry.signals.map(signal => <li key={signal}>• {signal}</li>)}</ul></div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Checks against the read</p>{entry.contradictions.length ? <ul className="mt-2 space-y-1 text-xs text-zinc-400">{entry.contradictions.map(item => <li key={item}>• {item}</li>)}</ul> : <p className="mt-2 text-xs text-zinc-500">No major captured contradiction.</p>}</div>
      </div>
      <div className="flex flex-wrap gap-2 text-[10px] text-zinc-500"><span>Historical HR: {pct(entry.historical.matchedHrRate)}</span><span>·</span><span>Lift: {entry.historical.lift == null ? '—' : `${entry.historical.lift.toFixed(2)}x`}</span><span>·</span><span>{entry.historical.sample} nearest profiles</span>{entry.outcome ? <><span>·</span><strong className={entry.outcome.hr ? 'text-lime-300' : 'text-zinc-600'}>{entry.outcome.hr ? `${entry.outcome.hr} HR · ${entry.outcome.rbi} RBI · ${entry.outcome.tb} TB${entry.outcome.hrMlWon ? ' · HR/ML' : ''}` : 'No HR'}</strong></> : null}</div>
    </div> : null}
  </div>
}

function GameAnalysisPanel({ analysis }: { analysis: MarketDnaGameAnalysis }) {
  const leader = analysis.ranking[0]
  if (!leader) return null
  return <div className="space-y-5">
    <section className="overflow-hidden rounded-3xl border border-lime-400/25 bg-[radial-gradient(circle_at_top_left,rgba(163,230,53,.16),transparent_42%),rgba(9,9,11,.9)]">
      <div className="flex flex-wrap items-center gap-4 border-b border-zinc-800/80 p-5 sm:p-6">
        <PlayerAvatar headshot={mlbHeadshot(leader.player.mlbId)} teamLogo={getTeamLogoUrl(leader.player.team)} teamAbbr={leader.player.team} name={leader.player.name} size={64} />
        <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.2em] text-lime-300">Top complete game profile</p><h2 className="truncate text-2xl font-black text-white sm:text-3xl">{leader.player.name}</h2><p className="mt-1 text-xs text-zinc-500">{leader.player.team} #{leader.player.battingOrder} · all 18 compared · {analysis.stage === 'frozen_close' ? 'frozen at first pitch' : 'current pregame capture'}</p></div>
        <div className="rounded-2xl border border-lime-400/30 bg-lime-400/10 px-5 py-3 text-right"><p className="text-[9px] font-black uppercase tracking-wider text-lime-300">Game rank</p><p className="text-3xl font-black text-white">#1</p><p className="text-[10px] text-zinc-500">{leader.score.toFixed(1)} score</p></div>
      </div>
      <div className="space-y-4 p-5 sm:p-6"><ComponentBars components={leader.components} /><MarketStrip player={leader.player} /></div>
    </section>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryMetric label="Separation" value={`+${analysis.separation.toFixed(1)}`} detail="Leader over the second-ranked profile" tone="text-lime-300" />
      <SummaryMetric label="Profiles ranked" value={`${analysis.ranking.length}/18`} detail="One game, one comparable field" />
      <SummaryMetric label="Historical rows" value={analysis.sourceRows.toLocaleString()} detail="Pregame-only archive rows scanned" />
      <SummaryMetric label="Board stage" value={analysis.stage === 'frozen_close' ? 'CLOSE' : 'LIVE'} detail={analysis.stage === 'frozen_close' ? 'Locked at first pitch' : 'Updates with captured markets'} />
    </div>

    {analysis.outcomeAvailable ? <section className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[.05] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-cyan-300"><ShieldCheck size={15} /> Postgame reveal</p><p className="mt-1 text-xs text-zinc-500">Attached after scoring. Never used in the ranking.</p></div>{analysis.score ? <strong className="text-sm text-white">{analysis.game.awayAbbr} {analysis.score.away} · {analysis.game.homeAbbr} {analysis.score.home}</strong> : null}</div>
      {analysis.actualHomeRuns.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{analysis.actualHomeRuns.map(result => <div key={`${result.mlbId}-${result.name}`} className="flex items-center gap-3 rounded-xl border border-cyan-400/15 bg-black/30 p-3"><PlayerAvatar headshot={result.mlbId ? mlbHeadshot(result.mlbId) : null} teamLogo={getTeamLogoUrl(result.team)} teamAbbr={result.team} name={result.name} size={42} /><div className="min-w-0 flex-1"><strong className="text-sm text-white">{result.name}</strong><p className="text-[10px] text-zinc-500">Pregame rank #{result.pregameRank ?? '—'} · {result.homeRuns} HR · {result.rbis} RBI · {result.totalBases} TB</p></div><div className="flex flex-col gap-1 text-right text-[9px] font-black uppercase">{result.firstHr ? <span className="text-lime-300">First HR</span> : null}{result.hrMlWon ? <span className="text-cyan-300">HR/ML</span> : null}</div></div>)}</div> : <p className="mt-4 rounded-xl border border-zinc-800 bg-black/20 p-4 text-sm text-zinc-500">No home runs recorded in the MLB result.</p>}
    </section> : null}

    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/70">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3"><div><p className="text-xs font-black text-white">All 18, ranked together</p><p className="text-[10px] text-zinc-600">Outcome-free score first. Settlement appears only after the game.</p></div><Trophy size={17} className="text-lime-300" /></div>
      {analysis.ranking.map(entry => <RankRow key={entry.player.mlbId} entry={entry} />)}
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

  const selectedGame = slate?.games.find(game => game.gamePk === selectedGamePk) ?? null
  const visiblePlayers = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return (selectedGame?.players ?? []).filter(player => !normalized || `${player.name} ${player.team} ${player.position}`.toLowerCase().includes(normalized))
  }, [query, selectedGame])

  function resetAnalysis() { setPlayerAnalysis(null); setGameAnalysis(null); setError('') }
  function chooseGame(game: MarketDnaGame) { setSelectedGamePk(game.gamePk); setSelectedPlayer(game.players[0] ?? null); setQuery(''); resetAnalysis() }
  function changeDate(value: string) { setLoadingSlate(true); setSlate(null); setSelectedGamePk(null); setSelectedPlayer(null); resetAnalysis(); setDate(value) }

  async function runAnalysis() {
    if (!selectedGame || (mode === 'player' && !selectedPlayer)) return
    setLoadingAnalysis(true); resetAnalysis()
    try {
      const body = mode === 'game'
        ? { mode: 'game', date, gamePk: selectedGame.gamePk }
        : { mode: 'player', date, gamePk: selectedGame.gamePk, mlbId: selectedPlayer!.mlbId }
      const response = await fetch('/api/admin/market-dna', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Market DNA analysis failed.')
      if (mode === 'game') setGameAnalysis(data as MarketDnaGameAnalysis)
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
        <div className="grid grid-cols-2 rounded-xl border border-zinc-800 bg-zinc-950 p-1"><button onClick={() => { setMode('game'); resetAnalysis() }} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-black ${mode === 'game' ? 'bg-lime-400 text-black' : 'text-zinc-500'}`}><BarChart3 size={14} />Game rank</button><button onClick={() => { setMode('player'); resetAnalysis() }} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-black ${mode === 'player' ? 'bg-lime-400 text-black' : 'text-zinc-500'}`}><Fingerprint size={14} />Player DNA</button></div>
        <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/70"><div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3"><div><p className="text-xs font-black text-white">Games</p><p className="text-[10px] text-zinc-600">{slate.games.length} captured</p></div><Database size={16} className="text-lime-300" /></div><div className="max-h-72 space-y-1 overflow-y-auto p-2">{slate.games.map(game => <button key={game.gamePk} onClick={() => chooseGame(game)} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${selectedGamePk === game.gamePk ? 'border-lime-400/40 bg-lime-400/10' : 'border-transparent hover:border-zinc-800 hover:bg-zinc-900'}`}><div className="flex -space-x-1"><TeamLogo logo={getTeamLogoUrl(game.awayAbbr)} name={game.awayAbbr} size={28} /><TeamLogo logo={getTeamLogoUrl(game.homeAbbr)} name={game.homeAbbr} size={28} /></div><div className="min-w-0 flex-1"><p className="text-xs font-black text-white">{game.awayAbbr} at {game.homeAbbr}</p><p className="truncate text-[9px] uppercase tracking-wide text-zinc-600">{game.status} · {game.players.length}/18 profiles</p></div>{game.lineupConfirmed ? <Check size={13} className="text-lime-400" /> : <CircleDot size={13} className="text-amber-400" />}</button>)}</div></section>
        {mode === 'player' ? <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/70"><div className="border-b border-zinc-800 p-3"><label className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-black/30 px-3"><Search size={14} className="text-zinc-600" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a player" className="h-9 min-w-0 flex-1 bg-transparent text-xs text-white outline-none" /></label></div><div className="max-h-[52vh] space-y-2 overflow-y-auto p-2">{visiblePlayers.map(player => <PlayerButton key={`${player.team}-${player.mlbId}`} player={player} selected={selectedPlayer?.mlbId === player.mlbId} onSelect={() => { setSelectedPlayer(player); resetAnalysis() }} />)}</div></section> : <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4"><p className="flex items-center gap-2 text-xs font-black text-white"><Gauge size={15} className="text-lime-300" />Game-first reducer</p><p className="mt-2 text-[11px] leading-5 text-zinc-500">Compares all 18 across headline prices, payoff markets, movement, history, Statcast, lineup traffic and public leverage.</p></div>}
        <button onClick={runAnalysis} disabled={!selectedGame || (mode === 'player' && !selectedPlayer) || loadingAnalysis} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-lime-400 px-4 text-sm font-black text-black shadow-[0_0_28px_rgba(163,230,53,.2)] transition hover:bg-lime-300 disabled:opacity-40">{loadingAnalysis ? <><LoaderCircle size={17} className="animate-spin" />Analyzing the archive</> : mode === 'game' ? <><Sparkles size={17} />Rank all 18 profiles</> : <><Fingerprint size={17} />Run player match</>}</button>
      </aside>
      <main className="min-w-0">{gameAnalysis ? <GameAnalysisPanel analysis={gameAnalysis} /> : playerAnalysis ? <PlayerAnalysisPanel analysis={playerAnalysis} /> : <div className="grid min-h-[620px] place-items-center rounded-3xl border border-dashed border-zinc-800 bg-[radial-gradient(circle_at_center,rgba(163,230,53,.05),transparent_45%)] p-8 text-center"><div className="max-w-md"><span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-lime-400/20 bg-lime-400/10 text-lime-300">{mode === 'game' ? <BarChart3 size={28} /> : <Fingerprint size={28} />}</span><h2 className="mt-5 text-xl font-black text-white">{mode === 'game' ? 'Reveal the complete game hierarchy' : 'Inspect one player profile'}</h2><p className="mt-2 text-sm leading-6 text-zinc-500">{mode === 'game' ? 'Rank every captured player together and see exactly where the strongest complete market profile separates.' : 'Compare one captured profile with previous settled player-games without using this game’s result.'}</p><div className="mt-5 flex flex-wrap justify-center gap-2 text-[10px] font-bold text-zinc-500"><span className="rounded-full border border-zinc-800 px-3 py-1.5"><Activity size={11} className="mr-1 inline" />Pregame only</span><span className="rounded-full border border-zinc-800 px-3 py-1.5"><ShieldCheck size={11} className="mr-1 inline" />Outcome isolated</span><span className="rounded-full border border-zinc-800 px-3 py-1.5"><Gauge size={11} className="mr-1 inline" />Full market</span></div></div></div>}</main>
    </div> : null}
  </div>
}

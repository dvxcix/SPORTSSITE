'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Activity, BarChart3, CalendarDays, Check, ChevronRight, CircleDot, Database,
  Dna, Fingerprint, Flame, Gauge, History, LoaderCircle, Search, Target, X,
} from 'lucide-react'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import { PlayerAvatar, TeamLogo } from '@/components/sports/PlayerAvatar'
import type { HistoricalMatch, MarketDnaAnalysis, MarketDnaGame, MarketDnaPlayer } from '@/lib/marketDna'

type Slate = { date: string; games: MarketDnaGame[] }

const odds = (value: number | null) => value == null ? '—' : `${value > 0 ? '+' : ''}${Math.round(value)}`
const pct = (value: number | null, digits = 0) => value == null ? '—' : `${(value * 100).toFixed(digits)}%`
const signed = (value: number | null, digits = 1) => value == null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`
const todayEt = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

function SummaryMetric({ label, value, detail, tone = 'text-white' }: { label: string; value: string; detail: string; tone?: string }) {
  return <div className="rounded-2xl border border-zinc-800/90 bg-black/30 p-4">
    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600">{label}</p>
    <p className={`mt-1 text-2xl font-black ${tone}`}>{value}</p>
    <p className="mt-1 text-[11px] text-zinc-500">{detail}</p>
  </div>
}

function OutcomeChips({ match }: { match: HistoricalMatch }) {
  return <div className="flex flex-wrap gap-1.5 text-[9px] font-black uppercase tracking-wide">
    {match.didHr ? <span className="rounded-full bg-lime-400 px-2 py-1 text-black">HR</span> : <span className="rounded-full bg-zinc-800 px-2 py-1 text-zinc-400">No HR</span>}
    {match.rbis != null && match.rbis > 0 ? <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-amber-300">{match.rbis} RBI</span> : null}
    {match.totalBases != null ? <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-cyan-300">{match.totalBases} TB</span> : null}
    {match.didDouble ? <span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-2 py-1 text-violet-300">2B</span> : null}
    {match.didTriple ? <span className="rounded-full border border-fuchsia-400/20 bg-fuchsia-400/10 px-2 py-1 text-fuchsia-300">3B</span> : null}
  </div>
}

function MatchRow({ match, rank }: { match: HistoricalMatch; rank: number }) {
  return <div className="grid gap-3 border-b border-zinc-800/70 px-4 py-4 last:border-0 md:grid-cols-[38px_minmax(170px,1fr)_120px_150px] md:items-center">
    <span className="grid h-8 w-8 place-items-center rounded-lg border border-zinc-800 bg-zinc-900 text-[10px] font-black text-zinc-500">{rank}</span>
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-white">{match.playerName}</strong><span className="text-[10px] font-bold text-zinc-600">{match.team ?? 'MLB'} · #{match.battingOrder ?? '—'}</span></div>
      <p className="mt-1 text-[10px] text-zinc-500">{match.gameDate} · HR {odds(match.hrOdds)} · FHR {odds(match.fhrOdds)}</p>
    </div>
    <div><p className="text-lg font-black text-lime-300">{pct(match.similarity)}</p><p className="text-[9px] uppercase tracking-wide text-zinc-600">{pct(match.coverage)} coverage</p></div>
    <OutcomeChips match={match} />
  </div>
}

function MarketStrip({ player }: { player: MarketDnaPlayer }) {
  const visible = player.markets.filter(market => market.current != null).slice(0, 10)
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
    {visible.map(market => <div key={market.key} className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-2.5">
      <p className="truncate text-[9px] font-bold uppercase tracking-wide text-zinc-600">{market.label}</p>
      <div className="mt-1 flex items-end justify-between gap-2"><strong className="text-sm text-white">{odds(market.current)}</strong><span className={market.probabilityMove == null ? 'text-zinc-700' : market.probabilityMove > 0 ? 'text-lime-400' : market.probabilityMove < 0 ? 'text-red-400' : 'text-zinc-500'}>{signed(market.probabilityMove)}</span></div>
    </div>)}
  </div>
}

function PlayerButton({ player, selected, onSelect }: { player: MarketDnaPlayer; selected: boolean; onSelect: () => void }) {
  const hr = player.markets.find(market => market.key === 'hr')
  return <button onClick={onSelect} className={`group flex min-h-16 w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${selected ? 'border-lime-400/70 bg-lime-400/10 shadow-[0_0_24px_rgba(163,230,53,.1)]' : 'border-zinc-800 bg-zinc-950/70 hover:border-zinc-700 hover:bg-zinc-900'}`}>
    <PlayerAvatar headshot={mlbHeadshot(player.mlbId)} teamLogo={getTeamLogoUrl(player.team)} teamAbbr={player.team} name={player.name} size={38} />
    <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-[10px] font-black text-zinc-600">{player.battingOrder}</span><strong className="truncate text-xs text-white">{player.name}</strong></div><p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-zinc-600">{player.position} · {player.team} · HR {odds(hr?.current ?? null)}</p></div>
    <ChevronRight size={14} className={selected ? 'text-lime-300' : 'text-zinc-700 transition group-hover:text-zinc-400'} />
  </button>
}

function AnalysisPanel({ analysis }: { analysis: MarketDnaAnalysis }) {
  const lift = analysis.read.historicalHrLift
  const sameRate = analysis.samePlayer.matchedHrRate
  const analogRate = analysis.leagueAnalogs.top25HrRate
  return <div className="space-y-5">
    <div className="overflow-hidden rounded-3xl border border-lime-400/20 bg-[radial-gradient(circle_at_top_left,rgba(163,230,53,.14),transparent_42%),rgba(9,9,11,.88)]">
      <div className="flex flex-wrap items-center gap-4 border-b border-zinc-800/80 p-5">
        <PlayerAvatar headshot={mlbHeadshot(analysis.player.mlbId)} teamLogo={getTeamLogoUrl(analysis.player.team)} teamAbbr={analysis.player.team} name={analysis.player.name} size={58} />
        <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-300">Captured market fingerprint</p><h2 className="truncate text-2xl font-black text-white">{analysis.player.name}</h2><p className="text-xs text-zinc-500">{analysis.player.team} #{analysis.player.battingOrder} · vs {analysis.player.pitcherName ?? analysis.player.opponent} · {analysis.stage === 'frozen_close' ? 'Frozen at first pitch' : 'Current pregame profile'}</p></div>
        <div className="rounded-2xl border border-lime-400/25 bg-lime-400/10 px-4 py-3 text-right"><p className="text-[9px] font-black uppercase tracking-wider text-lime-300">Nearest profile</p><p className="text-2xl font-black text-white">{pct(analysis.read.nearestSimilarity)}</p></div>
      </div>
      <div className="p-5"><MarketStrip player={analysis.player} /></div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryMetric label="Same-player matches" value={pct(sameRate)} detail={`${analysis.samePlayer.sample} comparable ${analysis.player.name} games`} tone={sameRate != null && sameRate >= .2 ? 'text-lime-300' : 'text-white'} />
      <SummaryMetric label="Nearest 25 analogs" value={pct(analogRate)} detail="Outcome rate among closest MLB profiles" tone={analogRate != null && analogRate >= .2 ? 'text-lime-300' : 'text-white'} />
      <SummaryMetric label="Historical lift" value={lift == null ? '—' : `${lift.toFixed(2)}×`} detail="Nearest analogs versus filtered comparison pool" tone={lift != null && lift >= 1.2 ? 'text-lime-300' : lift != null && lift < .8 ? 'text-red-300' : 'text-white'} />
      <SummaryMetric label="Profile coverage" value={pct(analysis.read.profileCoverage)} detail={`${analysis.sourceRows.toLocaleString()} eligible historical rows scanned`} />
    </div>

    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4"><div className="flex items-start gap-3"><Fingerprint className="mt-0.5 text-lime-300" size={18} /><div><p className="text-xs font-black uppercase tracking-wider text-zinc-400">Profile read</p><p className="mt-1 text-sm leading-6 text-zinc-300">{analysis.read.summary}</p><p className="mt-2 text-[10px] text-zinc-600">This is a similarity result, not a forced pick. Missing historical markets reduce coverage instead of being treated as matches.</p></div></div></div>

    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/60">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3"><div><p className="text-xs font-black text-white">Closest league-wide profiles</p><p className="text-[10px] text-zinc-600">Any player, previous dates only</p></div><Target size={17} className="text-lime-300" /></div>
      {analysis.leagueAnalogs.matches.length ? analysis.leagueAnalogs.matches.map((match, index) => <MatchRow key={`${match.playerName}-${match.gameDate}-${match.gamePk}`} match={match} rank={index + 1} />) : <p className="p-6 text-sm text-zinc-500">No historical profiles met the minimum coverage.</p>}
    </section>

    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/60">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3"><div><p className="text-xs font-black text-white">This player’s closest prior profiles</p><p className="text-[10px] text-zinc-600">How {analysis.player.name} settled from similar market shapes</p></div><History size={17} className="text-cyan-300" /></div>
      {analysis.samePlayer.matches.length ? analysis.samePlayer.matches.map((match, index) => <MatchRow key={`${match.gameDate}-${match.gamePk}`} match={match} rank={index + 1} />) : <p className="p-6 text-sm text-zinc-500">No prior same-player profile has enough comparable captured fields yet.</p>}
    </section>
  </div>
}

export function MarketDnaLab() {
  const [date, setDate] = useState(todayEt)
  const [slate, setSlate] = useState<Slate | null>(null)
  const [selectedGamePk, setSelectedGamePk] = useState<number | null>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<MarketDnaPlayer | null>(null)
  const [analysis, setAnalysis] = useState<MarketDnaAnalysis | null>(null)
  const [loadingSlate, setLoadingSlate] = useState(true)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/admin/market-dna?date=${date}`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Could not load the captured slate.')
        return data as Slate
      })
      .then(data => {
        setSlate(data)
        const firstGame = data.games.find(game => game.players.length)
        if (firstGame) {
          setSelectedGamePk(firstGame.gamePk)
          setSelectedPlayer(firstGame.players[0] ?? null)
        }
      })
      .catch(caught => {
        if (caught instanceof Error && caught.name !== 'AbortError') setError(caught.message)
      })
      .finally(() => setLoadingSlate(false))
    return () => controller.abort()
  }, [date])

  function changeDate(nextDate: string) {
    setLoadingSlate(true)
    setError('')
    setSlate(null)
    setSelectedGamePk(null)
    setSelectedPlayer(null)
    setAnalysis(null)
    setQuery('')
    setDate(nextDate)
  }

  const selectedGame = slate?.games.find(game => game.gamePk === selectedGamePk) ?? null
  const visiblePlayers = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return selectedGame?.players ?? []
    return (selectedGame?.players ?? []).filter(player => `${player.name} ${player.team} ${player.position}`.toLowerCase().includes(normalized))
  }, [query, selectedGame])

  async function runAnalysis(player = selectedPlayer) {
    if (!player) return
    setSelectedPlayer(player)
    setLoadingAnalysis(true)
    setAnalysis(null)
    setError('')
    try {
      const response = await fetch('/api/admin/market-dna', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: player.gameDate, gamePk: player.gamePk, mlbId: player.mlbId }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Historical matching failed.')
      setAnalysis(data)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Historical matching failed.')
    } finally {
      setLoadingAnalysis(false)
    }
  }

  function chooseGame(game: MarketDnaGame) {
    setSelectedGamePk(game.gamePk)
    setSelectedPlayer(game.players[0] ?? null)
    setAnalysis(null)
    setQuery('')
  }

  return <div className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">
    <header className="relative mb-6 overflow-hidden rounded-3xl border border-lime-400/20 bg-[radial-gradient(circle_at_15%_0%,rgba(163,230,53,.18),transparent_34%),linear-gradient(135deg,rgba(24,24,27,.96),rgba(9,9,11,.96))] p-5 sm:p-7">
      <div className="absolute -right-14 -top-14 h-52 w-52 rounded-full border border-lime-400/10 bg-lime-400/5 blur-2xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-3xl"><div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-lime-300"><Dna size={15} /> Historical market intelligence</div><h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Market DNA Lab</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Compare a captured player’s complete pregame price shape, movement, secondary markets, context and Statcast profile with every comparable settled player-game in the archive.</p></div>
        <label className="min-w-52"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-zinc-500">Captured slate</span><div className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-black/40 px-3"><CalendarDays size={15} className="text-lime-300" /><input type="date" value={date} max={todayEt()} onChange={event => changeDate(event.target.value)} className="h-11 min-w-0 flex-1 bg-transparent text-sm font-bold text-white outline-none [color-scheme:dark]" /></div></label>
      </div>
    </header>

    {error ? <div className="mb-5 flex items-center gap-3 rounded-2xl border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-200"><X size={17} />{error}</div> : null}

    {loadingSlate ? <div className="grid min-h-72 place-items-center rounded-3xl border border-zinc-800 bg-zinc-950/50"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-lime-300" /><p className="mt-3 text-xs font-bold text-zinc-500">Reconstructing the captured boards</p></div></div> : null}

    {!loadingSlate && slate ? <div className="grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
      <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/70"><div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3"><div><p className="text-xs font-black text-white">Games</p><p className="text-[10px] text-zinc-600">{slate.games.length} captured</p></div><Database size={16} className="text-lime-300" /></div><div className="max-h-72 space-y-1 overflow-y-auto p-2">{slate.games.map(game => <button key={game.gamePk} onClick={() => chooseGame(game)} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${selectedGamePk === game.gamePk ? 'border-lime-400/40 bg-lime-400/10' : 'border-transparent hover:border-zinc-800 hover:bg-zinc-900'}`}><div className="flex -space-x-1"><TeamLogo logo={getTeamLogoUrl(game.awayAbbr)} name={game.awayAbbr} size={28} /><TeamLogo logo={getTeamLogoUrl(game.homeAbbr)} name={game.homeAbbr} size={28} /></div><div className="min-w-0 flex-1"><p className="text-xs font-black text-white">{game.awayAbbr} at {game.homeAbbr}</p><p className="truncate text-[9px] uppercase tracking-wide text-zinc-600">{game.status} · {game.players.length}/18 profiles</p></div>{game.lineupConfirmed ? <Check size={13} className="text-lime-400" /> : <CircleDot size={13} className="text-amber-400" />}</button>)}</div></section>

        <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/70"><div className="border-b border-zinc-800 p-3"><label className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-black/30 px-3"><Search size={14} className="text-zinc-600" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a player" className="h-9 min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-zinc-700" /></label></div><div className="max-h-[52vh] space-y-2 overflow-y-auto p-2 [content-visibility:auto]">{visiblePlayers.map(player => <PlayerButton key={`${player.team}-${player.mlbId}`} player={player} selected={selectedPlayer?.mlbId === player.mlbId} onSelect={() => { setSelectedPlayer(player); setAnalysis(null) }} />)}</div></section>

        <button onClick={() => runAnalysis()} disabled={!selectedPlayer || loadingAnalysis} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-lime-400 px-4 text-sm font-black text-black shadow-[0_0_28px_rgba(163,230,53,.2)] transition hover:bg-lime-300 disabled:cursor-not-allowed disabled:opacity-40">{loadingAnalysis ? <><LoaderCircle size={17} className="animate-spin" />Matching the archive</> : <><Fingerprint size={17} />Run profile match</>}</button>
      </aside>

      <main className="min-w-0">
        {analysis ? <AnalysisPanel analysis={analysis} /> : <div className="grid min-h-[620px] place-items-center rounded-3xl border border-dashed border-zinc-800 bg-[radial-gradient(circle_at_center,rgba(163,230,53,.05),transparent_45%)] p-8 text-center"><div className="max-w-md"><span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-lime-400/20 bg-lime-400/10 text-lime-300"><Fingerprint size={28} /></span><h2 className="mt-5 text-xl font-black text-white">Select one of the 18 player profiles</h2><p className="mt-2 text-sm leading-6 text-zinc-500">The lab compares the captured board against prior settled profiles without using the selected game’s result. It keeps same-player history separate from league-wide analogs.</p><div className="mt-5 flex flex-wrap justify-center gap-2 text-[10px] font-bold text-zinc-500"><span className="rounded-full border border-zinc-800 px-3 py-1.5"><Activity size={11} className="mr-1 inline" />Open to current</span><span className="rounded-full border border-zinc-800 px-3 py-1.5"><BarChart3 size={11} className="mr-1 inline" />Full ladder</span><span className="rounded-full border border-zinc-800 px-3 py-1.5"><Gauge size={11} className="mr-1 inline" />Statcast context</span><span className="rounded-full border border-zinc-800 px-3 py-1.5"><Flame size={11} className="mr-1 inline" />Settled outcomes</span></div></div></div>}
      </main>
    </div> : null}
  </div>
}

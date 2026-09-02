'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, BrainCircuit,
  CheckCircle2, ChevronLeft, ChevronRight, Clock3, Crosshair, RefreshCw, ShieldAlert, Target, Users,
  type LucideIcon,
} from 'lucide-react'
import type { HrContextualCandidate, HrGameIntelligenceReport, HrGameReport, HrLaneRead } from '@/lib/hrGameIntelligenceReport'
import { cn } from '@/lib/utils'

const todayEt = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())
const pct = (value: number | null | undefined, digits = 0) => value == null ? '—' : `${(value * 100).toFixed(digits)}%`
const decimal = (value: number | null | undefined, digits = 2) => value == null ? '—' : value.toFixed(digits)
const odds = (value: number | null | undefined) => value == null ? '—' : `${value > 0 ? '+' : ''}${value}`
const signed = (value: number | null | undefined, digits = 2) => value == null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`

function shiftDate(date: string, amount: number) {
  const next = new Date(`${date}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate() + amount)
  return next.toISOString().slice(0, 10)
}

function laneTone(status: HrLaneRead['status']) {
  if (status === 'isolated') return 'border-lime-400/35 bg-lime-400/[0.08] text-lime-300'
  if (status === 'clustered') return 'border-amber-400/35 bg-amber-400/[0.08] text-amber-200'
  if (status === 'blocked') return 'border-rose-400/35 bg-rose-400/[0.08] text-rose-200'
  return 'border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--text-2)]'
}

function LaneCard({ label, read, icon: Icon }: { label: string; read: HrLaneRead; icon: LucideIcon }) {
  return (
    <section className={cn('rounded-2xl border p-4', laneTone(read.status))}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em]"><Icon size={15} />{label}</span>
        <span className="rounded-full border border-current/20 px-2 py-1 text-[10px] font-black uppercase tracking-wider">{read.status.replace('_', ' ')}</span>
      </div>
      <p className="mt-3 text-xl font-black text-[var(--text-1)]">{read.names.length ? read.names.join(' · ') : 'No isolated read'}</p>
      <p className="mt-1 text-xs leading-5 opacity-80">{read.explanation}</p>
      <div className="mt-3 flex gap-4 text-[11px] font-bold"><span>Score {pct(read.score)}</span><span>Gap {pct(read.separation)}</span></div>
    </section>
  )
}

function RolePill({ role }: { role: HrContextualCandidate['role'] }) {
  const tone = role === 'hidden_fhr' || role === 'anytime_companion' || role === 'market_residual'
    ? 'border-lime-400/25 bg-lime-400/10 text-lime-300'
    : role === 'public_shell' || role === 'released_candidate'
      ? 'border-rose-400/25 bg-rose-400/10 text-rose-300'
      : role === 'true_anchor' ? 'border-cyan-400/25 bg-cyan-400/10 text-cyan-300' : 'border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-3)]'
  return <span className={cn('rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wider', tone)}>{role.replaceAll('_', ' ')}</span>
}

function Movement({ value }: { value: number | null }) {
  if (value == null) return <span className="text-[var(--text-3)]">—</span>
  const Icon = value > 0.05 ? ArrowUpRight : value < -0.05 ? ArrowDownRight : ArrowRight
  return <span className={cn('inline-flex items-center gap-1 font-bold', value > 0.05 ? 'text-emerald-300' : value < -0.05 ? 'text-rose-300' : 'text-[var(--text-2)]')}><Icon size={12} />{signed(value, 1)}pp</span>
}

function StoryPanel({ game }: { game: HrGameReport }) {
  const items = [
    ['Open FHR favorite', game.story.openingFavorite ?? 'Unavailable'],
    ['Pregame FHR favorite', game.story.pregameFavorite ?? 'Unavailable'],
    ['Public anchor', game.story.publicAnchor ?? 'Unavailable'],
    ['Residual leader', game.story.residualLeader ?? 'Unavailable'],
  ]
  return (
    <div className="grid gap-3 xl:grid-cols-[1.1fr_.9fr]">
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="flex items-center gap-2 text-lime-300"><BrainCircuit size={17} /><span className="text-[11px] font-black uppercase tracking-[0.18em]">Unique game read</span></div>
        <h2 className="mt-3 text-xl font-black text-[var(--text-1)]">{game.story.headline}</h2>
        <div className="mt-4 space-y-2 text-sm leading-6 text-[var(--text-2)]"><p>{game.story.marketStory}</p><p>{game.story.publicStory}</p></div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-[var(--border-2)] bg-[var(--surface-2)] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[var(--text-2)]">Environment · {game.story.eventEnvironment}</span>
          <span className={cn('rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider', game.intelligence.audit.complete ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : 'border-rose-400/25 bg-rose-400/10 text-rose-300')}>{game.intelligence.audit.complete ? '18/18 verified' : 'Board blocked'}</span>
          {game.intelligence.audit.warnings.length ? <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-200">Pitch coverage {game.intelligence.audit.pitchMatchupHitters}/18</span> : null}
        </div>
      </section>
      <section className="grid grid-cols-2 gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
        {items.map(([label, value]) => <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3"><p className="text-[9px] font-black uppercase tracking-[0.14em] text-[var(--text-3)]">{label}</p><p className="mt-2 truncate text-sm font-black text-[var(--text-1)]">{value}</p></div>)}
      </section>
    </div>
  )
}

function Timeline({ selected }: { selected: HrContextualCandidate }) {
  const path = selected.ratioPath
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-300">Market story</p><p className="mt-1 text-sm font-black text-[var(--text-1)]">{selected.name} · open to pregame</p></div><Clock3 size={18} className="text-[var(--text-3)]" /></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        {path.map(point => <div key={`${point.capturedAt}:${point.label}`} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3"><p className="truncate text-[9px] font-black uppercase tracking-wider text-[var(--text-3)]">{point.label}</p><div className="mt-2 flex items-end justify-between gap-2"><div><p className="text-xs font-black text-[var(--text-1)]">FHR {odds(point.fhr)}</p><p className="mt-1 text-[10px] font-bold text-[var(--text-2)]">HR {odds(point.hr)}</p></div><span className="font-mono text-xs font-black text-lime-300">{decimal(point.fhrHr)}</span></div></div>)}
      </div>
    </section>
  )
}

function CandidateTable({ candidates, selected, onSelect }: { candidates: HrContextualCandidate[]; selected: string; onSelect: (name: string) => void }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] px-4 py-3"><p className="text-sm font-black text-[var(--text-1)]">Complete 18-player comparison</p><p className="mt-1 text-[10px] font-semibold text-[var(--text-3)]">Every rank is game-relative. Click a hitter for the full dossier.</p></div>
      <div className="overflow-x-auto">
        <table className="min-w-[1100px] w-full border-collapse text-left">
          <thead><tr className="border-b border-[var(--border)] text-[9px] font-black uppercase tracking-[0.13em] text-[var(--text-3)]">
            {['Hitter', 'Role', 'FD FHR', 'FD HR', 'FHR move', 'HR move', 'Public', 'Visible', 'Market', 'Residual', 'Timeline', 'FHR lane', 'Anytime lane'].map(column => <th key={column} className="px-3 py-3">{column}</th>)}
          </tr></thead>
          <tbody>{candidates.map(candidate => (
            <tr key={`${candidate.team}:${candidate.name}`} onClick={() => onSelect(candidate.name)} className={cn('cursor-pointer border-b border-[var(--border)] transition-colors hover:bg-[var(--surface-3)]', selected === candidate.name && 'bg-lime-400/[0.06]')}>
              <td className="px-3 py-3"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--surface-3)] text-[10px] font-black text-lime-300">{candidate.battingOrder ?? '—'}</span><div><p className="whitespace-nowrap text-xs font-black text-[var(--text-1)]">{candidate.name}</p><p className="mt-0.5 text-[9px] font-bold text-[var(--text-3)]">{candidate.team}</p></div></div></td>
              <td className="px-3 py-3"><RolePill role={candidate.role} /></td>
              <td className="px-3 py-3 font-mono text-xs font-black text-[var(--text-1)]">{odds(candidate.fhr)}</td>
              <td className="px-3 py-3 font-mono text-xs font-black text-[var(--text-1)]">{odds(candidate.anytimeHr)}</td>
              <td className="px-3 py-3 text-xs"><Movement value={candidate.fhrProbabilityMove} /></td>
              <td className="px-3 py-3 text-xs"><Movement value={candidate.anytimeProbabilityMove} /></td>
              <td className="px-3 py-3 font-mono text-xs font-black text-[var(--text-2)]">#{candidate.publicHrRank}<span className="ml-1 text-[9px] text-[var(--text-3)]">{candidate.picks}</span></td>
              <td className="px-3 py-3 font-mono text-xs font-black text-[var(--text-1)]">#{candidate.visibleRank}<span className="ml-1 text-[9px] text-[var(--text-3)]">{pct(candidate.visibleStrength)}</span></td>
              <td className="px-3 py-3 font-mono text-xs font-black text-cyan-300">#{candidate.marketRank}<span className="ml-1 text-[9px] text-[var(--text-3)]">{pct(candidate.marketStrength)}</span></td>
              <td className={cn('px-3 py-3 font-mono text-xs font-black', candidate.marketResidual > 0.08 ? 'text-lime-300' : candidate.marketResidual < -0.08 ? 'text-rose-300' : 'text-[var(--text-2)]')}>#{candidate.residualRank}<span className="ml-1 text-[9px]">{signed(candidate.marketResidual)}</span></td>
              <td className="px-3 py-3 font-mono text-xs font-black text-[var(--text-2)]">{pct(candidate.temporalDistinctiveness)}</td>
              <td className="px-3 py-3 font-mono text-xs font-black text-amber-200">#{candidate.fhrContextRank}<span className="ml-1 text-[9px]">{pct(candidate.fhrContextScore)}</span></td>
              <td className="px-3 py-3 font-mono text-xs font-black text-lime-300">#{candidate.anytimeContextRank}<span className="ml-1 text-[9px]">{pct(candidate.anytimeContextScore)}</span></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  )
}

function CandidateDetail({ candidate }: { candidate: HrContextualCandidate }) {
  const moves = candidate.marketMoves.filter(move => move.current != null || move.open != null)
  return (
    <section className="rounded-2xl border border-lime-400/20 bg-[var(--surface)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><RolePill role={candidate.role} /><span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-3)]">#{candidate.battingOrder} · {candidate.team}</span></div><h3 className="mt-2 text-2xl font-black text-[var(--text-1)]">{candidate.name}</h3></div><div className="flex gap-2"><div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2 text-center"><p className="text-[9px] font-black uppercase text-amber-200">FHR</p><p className="font-mono text-lg font-black text-[var(--text-1)]">#{candidate.fhrContextRank}</p></div><div className="rounded-xl border border-lime-400/20 bg-lime-400/[0.07] px-3 py-2 text-center"><p className="text-[9px] font-black uppercase text-lime-300">Anytime</p><p className="font-mono text-lg font-black text-[var(--text-1)]">#{candidate.anytimeContextRank}</p></div></div></div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4"><p className="text-[10px] font-black uppercase tracking-wider text-lime-300">Why it survives</p><ul className="mt-3 space-y-2">{candidate.survivesBecause.map(reason => <li key={reason} className="flex gap-2 text-xs leading-5 text-[var(--text-2)]"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-lime-300" />{reason}</li>)}</ul></div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4"><p className="text-[10px] font-black uppercase tracking-wider text-rose-300">Direct elimination</p><ul className="mt-3 space-y-2">{candidate.losesBecause.length ? candidate.losesBecause.map(reason => <li key={reason} className="flex gap-2 text-xs leading-5 text-[var(--text-2)]"><ShieldAlert size={14} className="mt-0.5 shrink-0 text-rose-300" />{reason}</li>) : <li className="text-xs text-[var(--text-3)]">This hitter is a lane leader; compare the table below it.</li>}</ul></div>
      </div>

      <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
        <p className="text-[10px] font-black uppercase tracking-wider text-amber-200">Why this player ranks ahead</p>
        <div className="mt-3 grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
          {candidate.beats.map(alternative => <div key={alternative.name} className="rounded-lg border border-[var(--border)] bg-[var(--surface-3)] p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-black text-[var(--text-1)]">vs {alternative.name}</p><RolePill role={alternative.role} /></div><ul className="mt-2 space-y-1">{alternative.reasons.map(reason => <li key={reason} className="text-[10px] leading-4 text-[var(--text-2)]">{reason}</li>)}</ul></div>)}
        </div>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[.7fr_1.3fr]">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4"><p className="text-[10px] font-black uppercase tracking-wider text-cyan-300">Cross-book prices</p><div className="mt-3 space-y-3">{(['fhr', 'hr'] as const).map(market => <div key={market}><p className="mb-1 text-[9px] font-black uppercase text-[var(--text-3)]">{market === 'fhr' ? 'First HR' : 'Anytime HR'}</p><div className="flex flex-wrap gap-2">{Object.entries(candidate.books[market]).map(([book, price]) => <span key={book} className="rounded-lg border border-[var(--border)] bg-[var(--surface-3)] px-2 py-1 font-mono text-[10px] font-bold text-[var(--text-2)]">{book.toUpperCase()} {odds(price)}</span>)}</div></div>)}</div></div>
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]"><div className="overflow-x-auto"><table className="min-w-[820px] w-full text-left"><thead><tr className="border-b border-[var(--border)] text-[9px] font-black uppercase tracking-wider text-[var(--text-3)]">{['Window', 'PP rank', 'MM', 'EV', 'HH%', 'Barrel%', 'Sweet spot%', 'Pull-air%', 'FB%', 'Bat speed', 'Squared', 'Blast', 'Ideal AA'].map(label => <th key={label} className="px-2 py-2">{label}</th>)}</tr></thead><tbody>{Object.entries(candidate.windows).map(([window, row]) => <tr key={window} className="border-b border-[var(--border)] font-mono text-[10px] font-bold text-[var(--text-2)]"><td className="px-2 py-2 font-black text-lime-300">{window.toUpperCase()}</td><td className="px-2 py-2">{row.paperRank ?? '—'}</td><td className="px-2 py-2">{signed(row.marketMismatch, 1)}</td><td className="px-2 py-2">{decimal(row.avgEv, 1)}</td><td className="px-2 py-2">{decimal(row.hardHitPct, 1)}</td><td className="px-2 py-2">{decimal(row.barrelPct, 1)}</td><td className="px-2 py-2">{decimal(row.sweetSpotPct, 1)}</td><td className="px-2 py-2">{decimal(row.pullAirRate, 1)}</td><td className="px-2 py-2">{decimal(row.fbRate, 1)}</td><td className="px-2 py-2">{decimal(row.avgBatSpeed, 1)}</td><td className="px-2 py-2">{decimal(row.squaredUpPct, 1)}</td><td className="px-2 py-2">{decimal(row.blastPct, 1)}</td><td className="px-2 py-2">{decimal(row.idealAttackAngleRate, 1)}</td></tr>)}</tbody></table></div></div>
      </div>

      <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4"><p className="text-[10px] font-black uppercase tracking-wider text-violet-300">Settlement tree · FanDuel open → current</p><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">{moves.map(move => <div key={move.key} className="rounded-lg border border-[var(--border)] bg-[var(--surface-3)] p-2"><p className="text-[9px] font-black text-[var(--text-3)]">{move.label}</p><p className="mt-1 font-mono text-xs font-black text-[var(--text-1)]">{odds(move.open)} <ArrowRight size={11} className="inline" /> {odds(move.current)}</p><p className="mt-1 text-[9px]"><Movement value={move.probabilityMove} /></p></div>)}</div></div>
    </section>
  )
}

export function HrGameIntelligenceWorkbench() {
  const [date, setDate] = useState(todayEt)
  const [report, setReport] = useState<HrGameIntelligenceReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [gameKey, setGameKey] = useState('')
  const [selectedName, setSelectedName] = useState('')

  async function load(targetDate = date) {
    setLoading(true); setError('')
    try {
      const response = await fetch(`/api/admin/hr-intelligence?date=${encodeURIComponent(targetDate)}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to load HR intelligence.')
      setReport(payload)
      const first = payload.games?.[0]
      setGameKey(current => payload.games?.some((game: HrGameReport) => game.gameKey === current) ? current : first?.gameKey ?? '')
      setSelectedName('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(date) }, 0)
    return () => window.clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const game = useMemo(() => report?.games.find(item => item.gameKey === gameKey) ?? report?.games[0] ?? null, [report, gameKey])
  const selected = useMemo(() => game?.candidates.find(candidate => candidate.name === selectedName) ?? game?.candidates[0] ?? null, [game, selectedName])

  function changeDate(next: string) { setDate(next); void load(next) }

  return (
    <div className="mx-auto w-full max-w-[1800px] p-3 sm:p-5 lg:p-7">
      <header className="overflow-hidden rounded-3xl border border-lime-400/20 bg-[radial-gradient(circle_at_top_left,rgba(163,255,58,.13),transparent_38%),var(--surface)] p-5 sm:p-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div><div className="flex items-center gap-2 text-lime-300"><BrainCircuit size={18} /><span className="text-[11px] font-black uppercase tracking-[0.2em]">Admin · Pregame only</span></div><h1 className="mt-3 text-3xl font-black tracking-tight text-[var(--text-1)] sm:text-4xl">HR Game Intelligence</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-2)]">Reconstructs each game independently across all 18 hitters, the full market tree, cross-book prices, public handle, and L1/L3/L5/L10 pitch/contact context. It can return one read, a cluster, or no read.</p></div>
          <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-2"><button aria-label="Previous date" onClick={() => changeDate(shiftDate(date, -1))} className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text-1)]"><ChevronLeft size={18} /></button><input aria-label="Game date" type="date" value={date} onChange={event => changeDate(event.target.value)} className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-black text-[var(--text-1)]" /><button aria-label="Next date" onClick={() => changeDate(shiftDate(date, 1))} className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text-1)]"><ChevronRight size={18} /></button><button onClick={() => void load()} disabled={loading} className="grid h-10 w-10 place-items-center rounded-xl bg-lime-400 text-black disabled:opacity-50"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /></button></div>
        </div>
      </header>

      {error ? <div className="mt-4 flex items-start gap-3 rounded-2xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm text-rose-200"><AlertTriangle size={18} className="shrink-0" /><span>{error}</span></div> : null}
      {report?.error ? <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-xs text-amber-100"><AlertTriangle size={16} className="shrink-0" /><span>{report.error}</span></div> : null}

      {loading && !report ? <div className="grid min-h-72 place-items-center"><div className="text-center"><RefreshCw size={28} className="mx-auto animate-spin text-lime-300" /><p className="mt-3 text-sm font-bold text-[var(--text-2)]">Reconstructing every board…</p></div></div> : null}
      {!loading && report && !report.games.length ? <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center"><p className="text-lg font-black text-[var(--text-1)]">No games available</p><p className="mt-2 text-sm text-[var(--text-3)]">No MLB board was reconstructed for {date}.</p></div> : null}

      {report?.games.length ? <>
        <nav aria-label="Games" className="mt-4 flex gap-2 overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2">
          {report.games.map(item => <button key={item.gameKey} onClick={() => { setGameKey(item.gameKey); setSelectedName('') }} className={cn('min-w-40 rounded-xl border px-4 py-3 text-left transition-colors', item.gameKey === game?.gameKey ? 'border-lime-400/35 bg-lime-400/10' : 'border-transparent bg-[var(--surface-2)] hover:border-[var(--border-2)]')}><p className="text-sm font-black text-[var(--text-1)]">{item.awayAbbr} <span className="text-[var(--text-3)]">@</span> {item.homeAbbr}</p><p className={cn('mt-1 text-[9px] font-black uppercase tracking-wider', item.intelligence.audit.complete ? 'text-emerald-300' : 'text-rose-300')}>{item.intelligence.audit.complete ? '18/18 ready' : `${item.intelligence.audit.receivedHitters}/18 blocked`}</p></button>)}
        </nav>

        {game ? <main className="mt-4 space-y-3">
          <StoryPanel game={game} />
          <div className="grid gap-3 md:grid-cols-2"><LaneCard label="First home run" read={game.story.fhr} icon={Crosshair} /><LaneCard label="Anytime home run" read={game.story.anytime} icon={Target} /></div>
          {game.story.noise.length ? <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-rose-400/15 bg-rose-400/[0.05] p-3"><Users size={15} className="text-rose-300" /><span className="text-[10px] font-black uppercase tracking-wider text-rose-200">Public/noise shell</span>{game.story.noise.map(name => <span key={name} className="rounded-full bg-[var(--surface-3)] px-2 py-1 text-[10px] font-bold text-[var(--text-2)]">{name}</span>)}</div> : null}
          {selected ? <Timeline selected={selected} /> : null}
          <CandidateTable candidates={game.candidates} selected={selected?.name ?? ''} onSelect={setSelectedName} />
          {selected ? <CandidateDetail candidate={selected} /> : null}
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"><p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-3)]">Audit boundary</p><p className="mt-2 text-xs leading-5 text-[var(--text-2)]">{game.story.auditNote}</p>{game.graded ? <p className="mt-2 text-xs font-bold text-amber-200">Postgame audit only: {game.actualHrHitters.length ? game.actualHrHitters.map(hitter => hitter.name).join(', ') : 'No home runs recorded'}{game.actualFirstHr ? ` · First: ${game.actualFirstHr.name}` : ''}. These outcomes were not used to construct the pregame ranks.</p> : null}</section>
        </main> : null}
      </> : null}
    </div>
  )
}

'use client'
import { useState } from 'react'

type WinnerRef = { name: string; team: string }
type MissDetail = WinnerRef & { excludedAtStep: number | null }
type GameResult = {
  gameKey: string; homeAbbr: string; awayAbbr: string; lineupsConfirmed: boolean
  winners: (WinnerRef & { hit: boolean })[]; actualHrHitters: WinnerRef[]
  missDetails: MissDetail[]
}
type DateResult = { date: string; games: GameResult[]; error?: string }
type Aggregate = { precision: number; recall: number; f1: number; totalWinnerFlags: number; totalTruePositives: number; totalRealHrHitters: number }
type Result = { matrix: { name: string; element_code: string; matrix_type: string }; dates: DateResult[]; aggregate: Aggregate }

const inputClass = "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 transition-all"
const pct = (n: number) => `${Math.round(n * 100)}%`

function GameRow({ g }: { g: GameResult }) {
  const [open, setOpen] = useState(false)
  const hasMiss = g.missDetails.length > 0
  const falsePositives = g.winners.filter(w => !w.hit)
  const hasFalsePositive = falsePositives.length > 0
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-zinc-800/50 transition-colors"
      >
        <span className="text-xs font-bold text-zinc-300 w-24 shrink-0">{g.awayAbbr}@{g.homeAbbr}</span>
        {!g.lineupsConfirmed ? (
          <span className="text-[11px] text-zinc-600 italic">no confirmed lineup — skipped</span>
        ) : (
          <>
            <span className="text-[11px] text-zinc-500">
              flagged: {g.winners.length ? g.winners.map(w => w.name).join(', ') : '—'}
            </span>
            <span className="ml-auto flex items-center gap-2 text-[11px]">
              {g.winners.some(w => w.hit) && <span className="text-green-400">{g.winners.filter(w => w.hit).length} hit</span>}
              {hasFalsePositive && <span className="text-red-400">{falsePositives.length} false</span>}
              {hasMiss && <span className="text-amber-400">{g.missDetails.length} missed</span>}
              {!hasMiss && !hasFalsePositive && g.actualHrHitters.length === 0 && <span className="text-zinc-600">no HRs</span>}
            </span>
          </>
        )}
        <span className="text-zinc-600 text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open && g.lineupsConfirmed && (
        <div className="px-3 pb-3 pt-1 border-t border-zinc-800 space-y-2 text-[11px]">
          <div>
            <span className="text-zinc-500 font-bold">Real HR hitters: </span>
            <span className="text-zinc-300">{g.actualHrHitters.length ? g.actualHrHitters.map(h => `${h.name} (${h.team})`).join(', ') : 'none'}</span>
          </div>
          {hasMiss && (
            <div>
              <span className="text-amber-400 font-bold">Missed: </span>
              {g.missDetails.map((m, i) => (
                <span key={i} className="text-zinc-400">
                  {m.name} ({m.team}){m.excludedAtStep != null ? ` — excluded at step ${m.excludedAtStep}` : ' — lost the final rank'}
                  {i < g.missDetails.length - 1 ? ', ' : ''}
                </span>
              ))}
            </div>
          )}
          {hasFalsePositive && (
            <div>
              <span className="text-red-400 font-bold">False positives: </span>
              <span className="text-zinc-400">{falsePositives.map(w => w.name).join(', ')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function MatrixBacktestForm() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const [elementCode, setElementCode] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)

  async function submit() {
    setSubmitting(true); setError(''); setResult(null)
    try {
      const res = await fetch('/api/admin/matrix-backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ element_code: elementCode.trim(), start_date: startDate, end_date: endDate }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Backtest failed')
      setResult(data)
    } catch (e: any) {
      setError(e?.message || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Element Code</label>
          <input type="text" value={elementCode} onChange={e => setElementCode(e.target.value)} placeholder="EL-XXXX-XXXX" className={inputClass + ' uppercase'} />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Start Date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">End Date (max 14 days)</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputClass} />
        </div>
      </div>

      <button
        onClick={submit}
        disabled={submitting || !elementCode.trim() || !startDate || !endDate}
        className="w-full flex items-center justify-center gap-2 font-black py-3 rounded-xl transition-all bg-green-500 hover:bg-green-400 text-black disabled:opacity-40"
      >
        {submitting ? 'Running backtest… (can take a minute per date)' : 'Run Backtest'}
      </button>

      {result && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-sm font-bold text-white mb-1">{result.matrix.name} <span className="text-zinc-500 font-normal">({result.matrix.matrix_type})</span></p>
            <div className="grid grid-cols-3 gap-4 mt-3">
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Precision</p>
                <p className="text-lg font-black text-white">{pct(result.aggregate.precision)}</p>
                <p className="text-[10px] text-zinc-600">{result.aggregate.totalTruePositives} of {result.aggregate.totalWinnerFlags} flags real</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Recall</p>
                <p className="text-lg font-black text-white">{pct(result.aggregate.recall)}</p>
                <p className="text-[10px] text-zinc-600">{result.aggregate.totalTruePositives} of {result.aggregate.totalRealHrHitters} HRs caught</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">F1</p>
                <p className="text-lg font-black text-white">{pct(result.aggregate.f1)}</p>
              </div>
            </div>
          </div>

          {result.dates.map(d => (
            <div key={d.date} className="space-y-1.5">
              <p className="text-xs font-bold text-zinc-400">{d.date}{d.error ? <span className="text-red-400 font-normal"> — {d.error}</span> : ''}</p>
              {!d.error && !d.games.length && <p className="text-[11px] text-zinc-600 italic pl-2">No games found for this date.</p>}
              {d.games.map(g => <GameRow key={g.gameKey} g={g} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

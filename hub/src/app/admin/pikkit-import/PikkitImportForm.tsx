'use client'
import { useState, useEffect, useRef } from 'react'
import { getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import { SafeImage } from '@/components/ui/SafeImage'

type GameOption = {
  gameKey: string
  gameNum: number
  homeAbbr: string
  awayAbbr: string
  homeTeam: string
  awayTeam: string
  gameDate: string
}

function TeamLogoImg({ abbr, size = 18 }: { abbr: string; size?: number }) {
  const [err, setErr] = useState(false)
  const url = getTeamLogoUrl(abbr)
  if (!url || err) return (
    <span className="inline-flex items-center justify-center rounded-full bg-[var(--surface-3)] text-[11px] font-semibold text-[var(--text-2)]" style={{ width: size, height: size }}>
      {abbr.slice(0, 2)}
    </span>
  )
  return <SafeImage src={url} alt={`${abbr} logo`} onError={() => setErr(true)} style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }} />
}

function GamePicker({ games, loading, error, value, onChange }: {
  games: GameOption[]; loading: boolean; error: string
  value: string; onChange: (gameKey: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = games.find(g => g.gameKey === value) ?? null

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const disabled = loading || games.length === 0

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(v => !v)}
        disabled={disabled}
        className="w-full flex items-center gap-2 bg-[var(--surface-2)] border border-[var(--border-2)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-1)] outline-none focus:border-[color-mix(in_srgb,var(--green)_50%,transparent)] transition-all disabled:opacity-50"
      >
        {selected ? (
          <>
            <TeamLogoImg abbr={selected.awayAbbr} />
            <span className="text-[var(--text-3)]">@</span>
            <TeamLogoImg abbr={selected.homeAbbr} />
            <span className="ml-1">{selected.awayAbbr} @ {selected.homeAbbr}{selected.gameNum > 1 ? ` (G${selected.gameNum})` : ''}</span>
          </>
        ) : (
          <span className="text-[var(--text-3)]">
            {loading ? 'Loading today\'s games…' : games.length === 0 ? 'No games found for this date' : 'Select a game…'}
          </span>
        )}
        <span className="ml-auto text-[var(--text-3)] text-xs">▾</span>
      </button>

      {open && !disabled && (
        <div className="absolute z-10 mt-1 w-full max-h-72 overflow-y-auto bg-[var(--surface-2)] border border-[var(--border-2)] rounded-xl shadow-xl py-1">
          {games.map(g => (
            <button
              key={g.gameKey}
              type="button"
              onClick={() => { onChange(g.gameKey); setOpen(false) }}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[var(--text-1)] hover:bg-[var(--surface-3)] transition-colors text-left"
            >
              <TeamLogoImg abbr={g.awayAbbr} />
              <span className="text-[var(--text-3)]">@</span>
              <TeamLogoImg abbr={g.homeAbbr} />
              <span className="ml-1">{g.awayTeam} @ {g.homeTeam}</span>
              {g.gameNum > 1 && <span className="ml-auto text-[12px] font-bold text-[var(--gold)]">GAME {g.gameNum}</span>}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-[var(--red)] mt-1">{error}</p>}
    </div>
  )
}

export function PikkitImportForm() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const [json, setJson] = useState('')
  const [gameDate, setGameDate] = useState(today)
  const [games, setGames] = useState<GameOption[]>([])
  const [loadingGames, setLoadingGames] = useState(false)
  const [gamesError, setGamesError] = useState('')
  const [selectedGameKey, setSelectedGameKey] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ rowsImported: number; marketSummary: Record<string, number> } | null>(null)

  // Pull the same schedule Dugout uses, so the picker can never point at a
  // game that doesn't exist — and doubleheaders show up as two distinct,
  // clearly-labeled options instead of one ambiguous matchup.
  useEffect(() => {
    let cancelled = false
    setLoadingGames(true); setGamesError(''); setSelectedGameKey('')
    fetch(`/api/dugout/data?date=${gameDate}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => {
        if (cancelled) return
        const opts: GameOption[] = (d.games ?? []).map((g: any) => ({
          gameKey: g.gameKey, gameNum: g.gameNum,
          homeAbbr: g.homeAbbr, awayAbbr: g.awayAbbr,
          homeTeam: g.homeTeam, awayTeam: g.awayTeam,
          gameDate: g.gameDate,
        }))
        setGames(opts)
      })
      .catch(() => { if (!cancelled) setGamesError('Could not load today\'s schedule') })
      .finally(() => { if (!cancelled) setLoadingGames(false) })
    return () => { cancelled = true }
  }, [gameDate])

  const selectedGame = games.find(g => g.gameKey === selectedGameKey) ?? null

  async function submit() {
    if (!selectedGame) return
    setSubmitting(true); setError(''); setResult(null)
    try {
      const res = await fetch('/api/admin/pikkit-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          json, gameDate,
          homeTeam: selectedGame.homeAbbr, awayTeam: selectedGame.awayAbbr,
          gameKey: selectedGame.gameKey,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Import failed'); return }
      setResult(data)
      setJson('')
    } catch (e: any) {
      setError(e?.message || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = "w-full bg-[var(--surface-2)] border border-[var(--border-2)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] outline-none focus:border-[color-mix(in_srgb,var(--green)_50%,transparent)] transition-all"

  return (
    <div className="space-y-4">
      {error && <div className="bg-[color-mix(in_srgb,var(--red)_10%,transparent)] border border-[color-mix(in_srgb,var(--red)_20%,transparent)] rounded-xl px-4 py-3 text-sm text-[var(--red)]">{error}</div>}
      {result && (
        <div className="bg-[color-mix(in_srgb,var(--green)_10%,transparent)] border border-[color-mix(in_srgb,var(--green)_20%,transparent)] rounded-xl px-4 py-3 text-sm text-[var(--green)]">
          Imported {result.rowsImported} player picks — {Object.entries(result.marketSummary).map(([m, c]) => `${m}: ${c}`).join(', ')}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">Game Date</label>
          <input type="date" value={gameDate} onChange={e => setGameDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">Game</label>
          <GamePicker games={games} loading={loadingGames} error={gamesError} value={selectedGameKey} onChange={setSelectedGameKey} />
        </div>
      </div>

      {selectedGame && (
        <div className="bg-[color-mix(in_srgb,var(--surface-2)_50%,transparent)] border border-[var(--border-2)] rounded-xl px-4 py-2.5 text-xs text-[var(--text-2)]">
          Importing for <strong className="text-[var(--text-1)]">{selectedGame.awayTeam} @ {selectedGame.homeTeam}</strong>
          {selectedGame.gameNum > 1 && <span className="text-[var(--gold)]"> — Game {selectedGame.gameNum} of a doubleheader</span>}
        </div>
      )}

      <div>
        <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">Pasted JSON from bookmarklet</label>
        <textarea
          value={json}
          onChange={e => setJson(e.target.value)}
          rows={10}
          placeholder='{"url":"...","game":"...","props":{"hr":{"Player Name":123},...}}'
          className={inputClass + ' font-mono text-xs resize-y'}
        />
      </div>

      <button
        onClick={submit}
        disabled={submitting || !json.trim() || !gameDate || !selectedGame}
        className="w-full flex items-center justify-center gap-2 font-semibold py-3 rounded-xl transition-all bg-[var(--accent-fill)] hover:bg-[var(--accent-fill)] text-[var(--accent-fg)] disabled:opacity-40"
      >
        {submitting ? 'Importing…' : !selectedGame ? 'Select a game first' : 'Import Picks'}
      </button>
    </div>
  )
}

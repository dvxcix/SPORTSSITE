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

const MARKET_LABELS: Record<string, string> = {
  fhr_fd: 'FHR',
  sa_fd: 'Anytime HR',
  hr2_fd: '2+ HR',
  sng_fd: 'Single',
  dbl_fd: 'Double',
  tri_fd: 'Triple',
  rbi_fd: 'RBI',
  rbi2_fd: '2+ RBI',
  rbi3_fd: '3+ RBI',
  tb4_fd: '4+ TB',
  tb5_fd: '5+ TB',
  hrr_fd: 'Hits+Runs+RBIs',
  laser105_fd: 'Laser 105+',
  laser110_fd: 'Laser 110+',
  moonshot_fd: 'Moonshot',
  pa1_fd: '1st PA HR',
  hr_ml_fd: 'HR/ML Parlay',
  combo1_min: 'Combine for HR',
  combo2_min: 'Combine for 2+ HR',
}

export function FanduelImportForm() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const [json, setJson] = useState('')
  const [gameDate, setGameDate] = useState(today)
  const [games, setGames] = useState<GameOption[]>([])
  const [loadingGames, setLoadingGames] = useState(false)
  const [gamesError, setGamesError] = useState('')
  const [selectedGameKey, setSelectedGameKey] = useState('')
  const [isOpening, setIsOpening] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ rowsImported: number; marketSummary: Record<string, number>; openingSaved?: boolean; wasOpeningPaste?: boolean; gamesDetected?: string[] } | null>(null)

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

  async function postChunk(chunkJson: string, isOpeningChunk: boolean) {
    if (!selectedGame) throw new Error('No game selected')
    const res = await fetch('/api/admin/fanduel-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        json: chunkJson, gameDate,
        homeTeam: selectedGame.homeAbbr, awayTeam: selectedGame.awayAbbr,
        gameKey: selectedGame.gameKey,
        isOpening: isOpeningChunk,
      }),
    })
    const text = await res.text()
    let data: any
    try { data = JSON.parse(text) } catch {
      // Not JSON at all — almost always the platform's own 413 "Request
      // Entity Too Large" body, which isn't JSON and used to blow up
      // res.json() with a confusing "Unexpected token" error. A single
      // scrape's worth of one game's markets should never actually hit
      // this since we split the array below, but keep the message honest
      // if it somehow still does (e.g. one tab alone is huge).
      throw new Error(res.status === 413 || /entity too large/i.test(text)
        ? 'That single scrape is too large on its own for one request — this shouldn\'t normally happen since we send one tab at a time.'
        : `Server returned a non-JSON response (status ${res.status}): ${text.slice(0, 120)}`)
    }
    if (!res.ok) throw new Error(data.error || 'Import failed')
    return data
  }

  async function submit() {
    if (!selectedGame) return
    setSubmitting(true); setError(''); setResult(null)
    try {
      let parsed: unknown
      try {
        parsed = JSON.parse(json)
      } catch {
        setError('That doesn\'t look like valid JSON — paste the exact console.log output from the FD scraper (a single scrape, or window.__fdAllScrapes)')
        return
      }
      // Send each tab's scrape as its own request instead of one giant
      // payload for the whole __fdAllScrapes array — a game with a lot of
      // prop tabs can push the combined JSON past Vercel's ~4.5MB request
      // body cap, which used to fail with a confusing "not valid JSON"
      // error (the body was actually the platform's own 413 page).
      const chunks = Array.isArray(parsed) ? parsed : [parsed]
      let last: { rowsImported: number; marketSummary: Record<string, number>; openingSaved?: boolean; wasOpeningPaste?: boolean } | null = null
      const mergedSummary: Record<string, number> = {}
      const gamesDetected = new Set<string>()
      let totalRows = 0
      let openingSaved = false
      let anySucceeded = false
      for (let i = 0; i < chunks.length; i++) {
        let data: any
        try {
          data = await postChunk(JSON.stringify(chunks[i]), isOpening)
        } catch (e: any) {
          // Most tabs (Innings, First 5 Innings, Hits & Runs, etc.) genuinely
          // carry none of our target markets — that's expected, not a
          // failure, since __fdAllScrapes includes every tab on the page.
          // Only a tab with zero matches used to abort the whole multi-tab
          // import; skip it and keep going instead.
          if (/found none of the target markets/i.test(e?.message || '')) continue
          throw e
        }
        anySucceeded = true
        totalRows += data.rowsImported ?? 0
        for (const [k, v] of Object.entries(data.marketSummary ?? {})) {
          mergedSummary[k] = (mergedSummary[k] ?? 0) + (v as number)
        }
        if (data.openingSaved) openingSaved = true
        for (const gk of data.gamesDetected ?? []) gamesDetected.add(gk)
        last = data
      }
      if (!anySucceeded) {
        setError('Parsed the JSON but none of the pasted tab(s) contained any target markets (FHR, Laser 105/110, Moonshot, 1st PA HR, HR/ML Parlay, Combine-for-HR) — check you included those tabs in the scrape')
        return
      }
      // Surfaced so a doubleheader (or an accidental multi-game paste) is
      // obvious at a glance — this exact game_key list is what actually got
      // written, which may not match the dropdown selection if the scrape
      // itself belonged to a different game.
      setResult({ rowsImported: totalRows, marketSummary: mergedSummary, openingSaved, wasOpeningPaste: !!isOpening && !!last, gamesDetected: [...gamesDetected] })
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
          Imported {result.rowsImported} players — {Object.entries(result.marketSummary).map(([m, c]) => `${MARKET_LABELS[m] ?? m}: ${c}`).join(', ')}
          {result.gamesDetected && result.gamesDetected.length > 0 && (
            <div className="mt-1 text-[color-mix(in_srgb,var(--green)_80%,transparent)]">
              Saved under: {result.gamesDetected.join(', ')}
              {selectedGame && !result.gamesDetected.includes(selectedGame.gameKey) && (
                <span className="text-[var(--gold)]"> — doesn't match the selected game ({selectedGame.gameKey})!</span>
              )}
            </div>
          )}
          {result.wasOpeningPaste && (
            <div className="mt-1 text-[var(--gold)]">
              {result.openingSaved ? '📸 Saved as this game\'s opening/early baseline.' : 'Opening baseline already exists for this game — this paste only updated current odds.'}
            </div>
          )}
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

      <label className={`flex items-center gap-2 text-xs cursor-pointer select-none rounded-xl border px-4 py-2.5 transition-all ${isOpening ? 'border-[color-mix(in_srgb,var(--gold)_50%,transparent)] bg-[color-mix(in_srgb,var(--gold)_10%,transparent)] text-[var(--gold)]' : 'border-[var(--border-2)] bg-[color-mix(in_srgb,var(--surface-2)_50%,transparent)] text-[var(--text-2)]'}`}>
        <input type="checkbox" checked={isOpening} onChange={e => setIsOpening(e.target.checked)} className="accent-amber-500" />
        📸 This is the opening/early paste for this game — some markets (combos, 1st PA, etc.) test the market hours before lineups. Check this on your first paste of the day; leave unchecked for later updates.
      </label>

      <div>
        <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">Pasted JSON from scraper (one scrape, or the whole window.__fdAllScrapes array)</label>
        <textarea
          value={json}
          onChange={e => setJson(e.target.value)}
          rows={10}
          placeholder='{"sportsbook":"FanDuel","sections":{"To Hit First Home Run":[...]}} or [ {...}, {...} ]'
          className={inputClass + ' font-mono text-xs resize-y'}
        />
      </div>

      <button
        onClick={submit}
        disabled={submitting || !json.trim() || !gameDate || !selectedGame}
        className="w-full flex items-center justify-center gap-2 font-semibold py-3 rounded-xl transition-all bg-[var(--accent-fill)] hover:bg-[var(--accent-fill)] text-[var(--accent-fg)] disabled:opacity-40"
      >
        {submitting ? 'Importing…' : !selectedGame ? 'Select a game first' : 'Import Gap Markets'}
      </button>
    </div>
  )
}

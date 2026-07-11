'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { X } from 'lucide-react'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { BookLogo } from '@/components/BookLogo'
import { getTeamLogoUrl } from '@/lib/mlbTeamColors'
import { mlbHeadshot } from '@/lib/mlb-api'
import { PROP_META } from '@/lib/watchlist'

export type ComposedPick = {
  mlb_id: number | null
  player_name: string
  team: string | null
  headshot_url: string | null
  game_pk: string | null
  game_date: string | null
  prop_key: string
  prop_label: string
  line: string
  book: string | null
  odds: number | null
}

type Game = { gameKey: string; gamePk: string; homeAbbr: string; awayAbbr: string; homeTeam: string; awayTeam: string }
type Player = { mlb_id: number; name: string; name_norm: string; team: string; position: string; props: any }

function TeamLogoImg({ abbr, size = 18 }: { abbr: string; size?: number }) {
  const [err, setErr] = useState(false)
  const url = getTeamLogoUrl(abbr)
  if (!url || err) return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, borderRadius: '50%', background: 'var(--surface-3)', fontSize: size * 0.4, fontWeight: 800, color: 'var(--text-3)' }}>
      {abbr.slice(0, 2)}
    </span>
  )
  return <img src={url} alt={abbr} onError={() => setErr(true)} style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }} />
}

function GamePicker({ games, loading, value, onChange }: {
  games: Game[]; loading: boolean; value: string; onChange: (gameKey: string) => void
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
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(v => !v)}
        disabled={disabled}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 8,
          padding: '8px 10px', color: 'var(--text-1)', fontSize: 13, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1,
        }}
      >
        {selected ? (
          <>
            <TeamLogoImg abbr={selected.awayAbbr} />
            <span style={{ color: 'var(--text-3)', fontSize: 11 }}>@</span>
            <TeamLogoImg abbr={selected.homeAbbr} />
            <span style={{ marginLeft: 2 }}>{selected.awayAbbr} @ {selected.homeAbbr}</span>
          </>
        ) : (
          <span style={{ color: 'var(--text-3)' }}>{loading ? 'Loading games…' : games.length === 0 ? 'No games today' : 'Select a game…'}</span>
        )}
        <span style={{ marginLeft: 'auto', color: 'var(--text-3)', fontSize: 11 }}>▾</span>
      </button>
      {open && !disabled && (
        <div style={{ position: 'absolute', zIndex: 10, marginTop: 4, width: '100%', maxHeight: 260, overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
          {games.map(g => (
            <button
              key={g.gameKey}
              type="button"
              onClick={() => { onChange(g.gameKey); setOpen(false) }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text-1)', fontSize: 13 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <TeamLogoImg abbr={g.awayAbbr} />
              <span style={{ color: 'var(--text-3)', fontSize: 11 }}>@</span>
              <TeamLogoImg abbr={g.homeAbbr} />
              <span>{g.awayAbbr} @ {g.homeAbbr}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function BookPicker({ books, value, onChange }: { books: string[]; value: string; onChange: (b: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '8px 10px', color: 'var(--text-1)', fontSize: 12, cursor: 'pointer' }}
      >
        {value ? <><BookLogo vendor={value} size={16} /><span>{value}</span></> : <span style={{ color: 'var(--text-3)' }}>Book…</span>}
        <span style={{ marginLeft: 'auto', color: 'var(--text-3)', fontSize: 11 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', zIndex: 10, marginTop: 4, width: '100%', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
          {books.map(b => (
            <button
              key={b}
              type="button"
              onClick={() => { onChange(b); setOpen(false) }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: b === value ? 'var(--surface-2)' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text-1)', fontSize: 12 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = b === value ? 'var(--surface-2)' : 'none')}
            >
              <BookLogo vendor={b} size={16} />
              <span>{b}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function PickComposer({ legs, onAddLeg, onRemoveLeg, onClose }: {
  legs: ComposedPick[]
  onAddLeg: (pick: ComposedPick) => void
  onRemoveLeg: (index: number) => void
  onClose: () => void
}) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const [gameDate] = useState(today)
  const [games, setGames] = useState<Game[]>([])
  const [gamesLoading, setGamesLoading] = useState(true)
  const [selectedGameKey, setSelectedGameKey] = useState('')
  const [players, setPlayers] = useState<Player[]>([])
  const [playerQuery, setPlayerQuery] = useState('')
  const [playerDropdownOpen, setPlayerDropdownOpen] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [marketKey, setMarketKey] = useState('')
  const [book, setBook] = useState('')
  const playerBoxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/dugout/data?date=${gameDate}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        if (cancelled) return
        const gs: Game[] = (d.games ?? []).map((g: any) => ({
          gameKey: g.gameKey, gamePk: String(g.gamePk),
          homeAbbr: g.homeAbbr, awayAbbr: g.awayAbbr,
          homeTeam: g.homeTeam, awayTeam: g.awayTeam,
        }))
        setGames(gs)
        // Stash full game payload for player lookups without a second fetch.
        ;(window as any).__pickComposerGames = d.games ?? []
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setGamesLoading(false) })
    return () => { cancelled = true }
  }, [gameDate])

  useEffect(() => {
    if (!selectedGameKey) { setPlayers([]); return }
    const raw = ((window as any).__pickComposerGames ?? []).find((g: any) => g.gameKey === selectedGameKey)
    if (!raw) { setPlayers([]); return }
    const all = [...(raw.homeLineup ?? []), ...(raw.awayLineup ?? [])]
      .filter((p: any) => p.mlb_id)
      .map((p: any) => ({ mlb_id: p.mlb_id, name: p.name, name_norm: p.name_norm, team: p.team, position: p.position, props: p.props }))
    setPlayers(all)
    setSelectedPlayer(null)
    setMarketKey('')
    setBook('')
  }, [selectedGameKey])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (playerBoxRef.current && !playerBoxRef.current.contains(e.target as Node)) setPlayerDropdownOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filteredPlayers = useMemo(() => {
    const q = playerQuery.trim().toLowerCase()
    if (!q) return players
    return players.filter(p => p.name.toLowerCase().includes(q))
  }, [players, playerQuery])

  // Only markets we actually have a real price for, from ANY book — no
  // manual odds entry, so an unpriced market can't be posted at all.
  const pricedMarkets = useMemo(() => {
    if (!selectedPlayer?.props) return []
    return Object.entries(PROP_META).filter(([key]) => {
      const vendors = selectedPlayer.props[key]
      return vendors && Object.values(vendors).some(v => v != null)
    })
  }, [selectedPlayer])

  // Books that actually have a price for the selected market — narrowed to
  // whichever book the parlay's already locked to, if there's an existing leg.
  const lockedBook = legs[0]?.book ?? null
  const availableBooks = useMemo(() => {
    if (!selectedPlayer || !marketKey) return []
    const vendors = selectedPlayer.props?.[marketKey] ?? {}
    const all = Object.entries(vendors).filter(([, v]) => v != null).map(([k]) => k)
    return lockedBook ? all.filter(b => b === lockedBook) : all
  }, [selectedPlayer, marketKey, lockedBook])

  // Auto-select the first available book whenever the market changes.
  useEffect(() => {
    setBook(availableBooks[0] ?? '')
  }, [marketKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedGame = games.find(g => g.gameKey === selectedGameKey) ?? null
  const marketMeta = marketKey ? PROP_META[marketKey] : null
  const odds: number | null = selectedPlayer && marketKey && book
    ? (selectedPlayer.props?.[marketKey]?.[book] ?? null)
    : null

  const canAddLeg = !!(selectedPlayer && marketMeta && book && odds != null)

  function addLeg() {
    if (!canAddLeg || !selectedPlayer || !marketMeta) return
    onAddLeg({
      mlb_id: selectedPlayer.mlb_id,
      player_name: selectedPlayer.name,
      team: selectedPlayer.team,
      headshot_url: mlbHeadshot(selectedPlayer.mlb_id),
      game_pk: selectedGame?.gamePk ?? null,
      game_date: gameDate,
      prop_key: marketKey,
      prop_label: marketMeta.label,
      line: marketMeta.label,
      book,
      odds: odds!,
    })
    setSelectedPlayer(null)
    setPlayerQuery('')
    setMarketKey('')
    setBook('')
  }

  const inputClass = "w-full bg-[var(--surface-2)] border border-[var(--border-2)] rounded-lg px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--accent)]"

  return (
    <div style={{ marginTop: 12, padding: 12, background: 'var(--surface-2)', borderRadius: 10, border: '1px solid rgba(255,184,77,0.2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--gold)' }}>📊 {legs.length > 1 ? `${legs.length}-Leg Parlay` : 'Add Pick'} — {gameDate}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 2 }}>
          <X size={14} />
        </button>
      </div>

      {legs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {legs.map((leg, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border-2)' }}>
              <BookLogo vendor={leg.book ?? ''} size={14} />
              <div style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{leg.player_name}</span>
                <span style={{ color: 'var(--text-3)' }}> — {leg.prop_label}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'monospace' }}>{leg.odds != null ? (leg.odds > 0 ? `+${leg.odds}` : leg.odds) : '—'}</span>
              <button onClick={() => onRemoveLeg(i)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 0 }}>
                <X size={12} />
              </button>
            </div>
          ))}
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
            Add another leg from <strong style={{ color: 'var(--text-2)' }}>{lockedBook}</strong> to build a parlay, or post as-is.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <GamePicker games={games} loading={gamesLoading} value={selectedGameKey} onChange={setSelectedGameKey} />

        {/* Player search */}
        {selectedGameKey && (
          <div ref={playerBoxRef} style={{ position: 'relative' }}>
            {selectedPlayer ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border-2)' }}>
                <PlayerAvatar
                  headshot={mlbHeadshot(selectedPlayer.mlb_id)}
                  teamLogo={getTeamLogoUrl(selectedPlayer.team)}
                  teamAbbr={selectedPlayer.team}
                  name={selectedPlayer.name}
                  size={28}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{selectedPlayer.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{selectedPlayer.team} · {selectedPlayer.position}</div>
                </div>
                <button onClick={() => { setSelectedPlayer(null); setPlayerQuery('') }} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}>
                  <X size={13} />
                </button>
              </div>
            ) : (
              <>
                <input
                  value={playerQuery}
                  onChange={e => { setPlayerQuery(e.target.value); setPlayerDropdownOpen(true) }}
                  onFocus={() => setPlayerDropdownOpen(true)}
                  placeholder="Search a player in this game…"
                  className={inputClass}
                />
                {playerDropdownOpen && filteredPlayers.length > 0 && (
                  <div style={{ position: 'absolute', zIndex: 10, marginTop: 4, width: '100%', maxHeight: 220, overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                    {filteredPlayers.map(p => (
                      <button
                        key={p.mlb_id}
                        onClick={() => { setSelectedPlayer(p); setPlayerDropdownOpen(false) }}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >
                        <PlayerAvatar headshot={mlbHeadshot(p.mlb_id)} teamLogo={getTeamLogoUrl(p.team)} teamAbbr={p.team} name={p.name} size={24} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{p.name}</div>
                          <div style={{ fontSize: 9, color: 'var(--text-3)' }}>{p.team} · {p.position}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Market + book — no odds field. Odds are whatever the books are
            actually pricing (auto/BDL, or our manual FD/MGM importers); you
            can't type a number in here. */}
        {selectedPlayer && (
          pricedMarkets.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-3)', padding: '4px 2px' }}>No priced markets for {selectedPlayer.name} yet.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 8 }}>
              <select value={marketKey} onChange={e => setMarketKey(e.target.value)} className={inputClass} style={{ fontSize: 12 }}>
                <option value="">Market…</option>
                {pricedMarkets.map(([key, meta]) => (
                  <option key={key} value={key}>{meta.label}</option>
                ))}
              </select>
              {marketKey && (availableBooks.length > 0
                ? <BookPicker books={availableBooks} value={book} onChange={setBook} />
                : <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, alignSelf: 'center' }}>Not priced on {lockedBook}</p>)}
            </div>
          )
        )}

        {selectedPlayer && marketKey && book && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-3)', paddingTop: 2 }}>
            <BookLogo vendor={book} size={14} />
            <span>{selectedPlayer.name} — {marketMeta?.label} · <strong style={{ color: 'var(--text-1)' }}>{odds != null ? (odds > 0 ? `+${odds}` : odds) : '—'}</strong></span>
            <button
              type="button"
              onClick={addLeg}
              disabled={!canAddLeg}
              style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 6, background: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', cursor: canAddLeg ? 'pointer' : 'not-allowed', opacity: canAddLeg ? 1 : 0.5 }}
            >
              + Add Leg
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

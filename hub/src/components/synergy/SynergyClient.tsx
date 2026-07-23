'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { AffinityMatchupCards, type Evidence } from '@/components/dugout/AffinityMatchupScore'
import { TeamLogo } from '@/components/sports/PlayerAvatar'
import { getTeamLogoUrl } from '@/lib/mlbTeamColors'

type SynergyMatchup = {
  gameKey: string
  lineupConfirmed: boolean
  batterId: number; batterName: string; batterTeamAbbr: string; batterBats: string | null
  pitcherId: number; pitcherName: string; pitcherTeamAbbr: string; pitcherHand: 'R' | 'L'
  batterScore: number; pitcherScore: number
  evidencePitchers: Evidence[]; evidenceHitters: Evidence[]
}
type SynergyGame = {
  gameKey: string; awayAbbr: string; homeAbbr: string; gameDate: string | null
  abstractStatus: string; awayScore: number | null; homeScore: number | null
}

type SortMode = 'best' | 'batter' | 'pitcher'

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: 'best', label: 'Best of Either' },
  { key: 'batter', label: 'Batter Score' },
  { key: 'pitcher', label: 'Pitcher Score' },
]

const scoreFor = (m: SynergyMatchup, mode: SortMode) =>
  mode === 'batter' ? m.batterScore : mode === 'pitcher' ? m.pitcherScore : Math.max(m.batterScore, m.pitcherScore)

const timeStr = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''

// Same real game-tab convention Dugout itself uses (team logos, live dot +
// running score, final score, or scheduled time) — just as a static header
// per matchup group here instead of a clickable tab.
function GameStatusChip({ game }: { game?: SynergyGame }) {
  if (!game) return null
  const isLive = game.abstractStatus === 'Live'
  const isFinal = game.abstractStatus === 'Final'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <TeamLogo logo={getTeamLogoUrl(game.awayAbbr)} name={game.awayAbbr} size={20} />
      <span style={{ color: 'var(--text-3)', fontSize: 10, fontWeight: 800 }}>@</span>
      <TeamLogo logo={getTeamLogoUrl(game.homeAbbr)} name={game.homeAbbr} size={20} />
      {isLive && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444' }} />}
      {(isLive || isFinal) ? (
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-2)', fontFamily: "'SF Mono',monospace" }}>
          {game.awayScore ?? 0}–{game.homeScore ?? 0}
        </span>
      ) : game.gameDate ? (
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: "'SF Mono',monospace" }}>{timeStr(game.gameDate)}</span>
      ) : null}
    </div>
  )
}

function GameSelector({ games, value, onChange }: { games: SynergyGame[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const selected = games.find(g => g.gameKey === value)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', minWidth: 200,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
          cursor: 'pointer', color: 'var(--text-1)', fontSize: 13, fontWeight: 700,
        }}
      >
        {selected ? <GameStatusChip game={selected} /> : <span>All Games</span>}
        <ChevronDown size={14} style={{ marginLeft: 'auto', color: 'var(--text-3)' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 30, minWidth: '100%', maxHeight: 360, overflowY: 'auto',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <div
            onClick={() => { onChange('all'); setOpen(false) }}
            style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: value === 'all' ? 'var(--accent)' : 'var(--text-1)', cursor: 'pointer', background: value === 'all' ? 'var(--accent-dim)' : 'transparent' }}
          >
            All Games
          </div>
          {games.map(g => (
            <div
              key={g.gameKey}
              onClick={() => { onChange(g.gameKey); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', padding: '8px 14px', cursor: 'pointer',
                background: value === g.gameKey ? 'var(--accent-dim)' : 'transparent',
                borderTop: '1px solid var(--border)',
              }}
            >
              <GameStatusChip game={g} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function SynergyClient() {
  const [matchups, setMatchups] = useState<SynergyMatchup[] | null>(null)
  const [games, setGames] = useState<SynergyGame[]>([])
  const [error, setError] = useState(false)

  // Reported live (same fix as Dugout/Slate Breakdown): refreshing lost
  // whichever game/sort you'd picked, always landing back on "All Games" /
  // "Best of Either". Restored from the URL on mount, kept in sync on every
  // change so a refresh (or a copied link) lands back exactly here.
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [sortMode, setSortModeState] = useState<SortMode>(() => {
    const v = searchParams.get('sort')
    return v === 'batter' || v === 'pitcher' ? v : 'best'
  })
  const [activeGame, setActiveGameState] = useState(() => searchParams.get('game') ?? 'all')

  const updateParams = useCallback((next: { game?: string; sort?: SortMode }) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next.game !== undefined) { if (next.game === 'all') params.delete('game'); else params.set('game', next.game) }
    if (next.sort !== undefined) { if (next.sort === 'best') params.delete('sort'); else params.set('sort', next.sort) }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [pathname, router, searchParams])

  const setActiveGame = useCallback((gameKey: string) => {
    setActiveGameState(gameKey)
    updateParams({ game: gameKey })
  }, [updateParams])

  const setSortMode = useCallback((mode: SortMode) => {
    setSortModeState(mode)
    updateParams({ sort: mode })
  }, [updateParams])

  useEffect(() => {
    let cancelled = false
    fetch('/api/synergy/today')
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        const loadedGames: SynergyGame[] = d.games ?? []
        setMatchups(d.matchups ?? [])
        setGames(loadedGames)
        // A game restored from a stale URL (e.g. yesterday's slate) that no
        // longer exists today would otherwise silently filter every row out.
        setActiveGameState(prev => prev === 'all' || loadedGames.some(g => g.gameKey === prev) ? prev : 'all')
      })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [])

  const gameByKey = useMemo(() => Object.fromEntries(games.map(g => [g.gameKey, g])), [games])

  const sorted = useMemo(() => {
    if (!matchups) return []
    const filtered = activeGame === 'all' ? matchups : matchups.filter(m => m.gameKey === activeGame)
    return [...filtered].sort((a, b) => scoreFor(b, sortMode) - scoreFor(a, sortMode))
  }, [matchups, sortMode, activeGame])

  if (error) return <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '20px 0' }}>Couldn&apos;t load today&apos;s matchups.</div>
  if (matchups === null) return <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '20px 0' }}>Loading…</div>
  if (matchups.length === 0) return <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '20px 0' }}>No games today.</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <GameSelector games={games} value={activeGame} onChange={setActiveGame} />
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em', marginLeft: 8 }}>SORT BY</span>
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => setSortMode(opt.key)}
            style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: '1px solid var(--border)',
              background: sortMode === opt.key ? 'var(--accent)' : 'var(--surface)',
              color: sortMode === opt.key ? 'var(--accent-fg)' : 'var(--text-2)',
            }}
          >
            {opt.label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>{sorted.length} matchups</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sorted.map(m => (
          <div key={`${m.batterId}-${m.pitcherId}-${m.gameKey}`} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <GameStatusChip game={gameByKey[m.gameKey]} />
              {!m.lineupConfirmed && <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--gold)', letterSpacing: '0.04em' }}>PROJECTED LINEUP</span>}
            </div>
            <AffinityMatchupCards
              batterId={m.batterId} batterName={m.batterName} batterTeamAbbr={m.batterTeamAbbr} batterBats={m.batterBats}
              pitcherId={m.pitcherId} pitcherName={m.pitcherName} pitcherTeamAbbr={m.pitcherTeamAbbr} pitcherHand={m.pitcherHand}
              batterScore={m.batterScore} pitcherScore={m.pitcherScore}
              evidencePitchers={m.evidencePitchers} evidenceHitters={m.evidenceHitters}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

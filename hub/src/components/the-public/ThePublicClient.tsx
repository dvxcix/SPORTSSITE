'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { PlayerLink } from '@/components/players/PlayerPageClient'
import { TeamLogo } from '@/components/sports/PlayerAvatar'
import { PickBadge, BookBadges } from '@/components/shared/OddsBadges'
import { normName, resolveNameEntry } from '@/lib/nameNorm'
import { getTeamLogoUrl } from '@/lib/mlbTeamColors'

// Every prop category we track odds AND community Pikkit picks for —
// anything else (walks, strikeouts, runs) has one or the other but not
// both, so it's left out rather than showing a leaderboard with no real
// odds attached to it. `propsKey` indexes into each lineup player's `.props`
// BDLPropMap object (see balldontlie.ts); `pikkitProp` is the exact
// prop_type string api/admin/pikkit-import/route.ts's MARKET_MAP writes.
// `books` mirrors BatterCostClient's own MARKET_BOOKS — fhr/sa are the only
// two markets BDL gives multiple books for, everything else is FanDuel-only.
type CategoryKey = 'hr' | 'hits' | 'singles' | 'doubles' | 'triples' | 'stolen_bases' | 'tb' | 'rbi' | 'hrr'
const CATEGORIES: { key: CategoryKey; label: string; short: string; pikkitProp: string; propsKey: string; books: string[] }[] = [
  { key: 'hr', label: 'Home Run', short: 'HR', pikkitProp: 'home_runs', propsKey: 'sa', books: ['fanduel', 'caesars', 'betmgm', 'betrivers'] },
  { key: 'hits', label: 'To Record a Hit', short: 'Hits', pikkitProp: 'hits', propsKey: 'hits', books: ['fanduel'] },
  { key: 'singles', label: 'Singles', short: '1B', pikkitProp: 'singles', propsKey: 'singles', books: ['fanduel'] },
  { key: 'doubles', label: 'Doubles', short: '2B', pikkitProp: 'doubles', propsKey: 'doubles', books: ['fanduel'] },
  { key: 'triples', label: 'Triples', short: '3B', pikkitProp: 'triples', propsKey: 'triples', books: ['fanduel'] },
  { key: 'stolen_bases', label: 'Stolen Base', short: 'SB', pikkitProp: 'stolen_bases', propsKey: 'stolen_bases', books: ['fanduel'] },
  { key: 'tb', label: 'Total Bases', short: 'TB', pikkitProp: 'bases', propsKey: 'tb', books: ['fanduel'] },
  { key: 'rbi', label: 'RBI', short: 'RBI', pikkitProp: 'rbi', propsKey: 'rbi', books: ['fanduel'] },
  { key: 'hrr', label: 'Hits + Runs + RBIs', short: 'HRR', pikkitProp: 'hits_runs_rbi', propsKey: 'hrr', books: ['fanduel'] },
]

type GameOption = { gameKey: string; awayAbbr: string; homeAbbr: string; gameDate: string | null }
type PublicRow = { mlb_id: number; name: string; team: string; gameKey: string; picks: number; prices: any }

function GameSelector({ games, value, onChange }: { games: GameOption[]; value: string; onChange: (v: string) => void }) {
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
  const timeStr = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', minWidth: 220,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
          cursor: 'pointer', color: 'var(--text-1)', fontSize: 13, fontWeight: 700,
        }}
      >
        {selected ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <TeamLogo logo={getTeamLogoUrl(selected.awayAbbr)} name={selected.awayAbbr} size={22} />
            <span style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 800 }}>@</span>
            <TeamLogo logo={getTeamLogoUrl(selected.homeAbbr)} name={selected.homeAbbr} size={22} />
            <span style={{ marginLeft: 4, color: 'var(--text-3)', fontSize: 11, fontWeight: 700 }}>{timeStr(selected.gameDate)}</span>
          </span>
        ) : (
          <span>All Games</span>
        )}
        <ChevronDown size={14} style={{ marginLeft: 'auto', color: 'var(--text-3)' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 30, minWidth: '100%',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
          overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
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
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', cursor: 'pointer',
                background: value === g.gameKey ? 'var(--accent-dim)' : 'transparent',
                borderTop: '1px solid var(--border)',
              }}
            >
              <TeamLogo logo={getTeamLogoUrl(g.awayAbbr)} name={g.awayAbbr} size={22} />
              <span style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 800 }}>@</span>
              <TeamLogo logo={getTeamLogoUrl(g.homeAbbr)} name={g.homeAbbr} size={22} />
              <span style={{ marginLeft: 4, color: 'var(--text-2)', fontSize: 12, fontWeight: 700 }}>{timeStr(g.gameDate)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ThePublicClient({ date }: { date: string }) {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('hr')
  const [activeGame, setActiveGame] = useState<string>('all')

  useEffect(() => {
    let cancelled = false
    setData(null); setError(null)
    fetch(`/api/dugout/data?date=${date}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setError('Failed to load today\'s picks') })
    return () => { cancelled = true }
  }, [date])

  // Same shape/matching Batter Cost's own pikkitMap uses — keyed by
  // name -> prop_type -> game_key, with an untagged '' game_key as the
  // legacy fallback a real game_key always wins over at lookup time.
  const pikkitMap = useMemo(() => {
    const m: Record<string, Record<string, Record<string, any>>> = {}
    for (const r of (data?.pikkit ?? [])) {
      const nn = normName(r.player_name || '')
      const market = r.prop_type || r.market
      if (!nn || !market) continue
      if (!m[nn]) m[nn] = {}
      if (!m[nn][market]) m[nn][market] = {}
      m[nn][market][r.game_key || ''] = r
    }
    return m
  }, [data?.pikkit])

  const games: GameOption[] = useMemo(() => (data?.games ?? []).map((g: any) => ({
    gameKey: g.gameKey, awayAbbr: g.awayAbbr, homeAbbr: g.homeAbbr, gameDate: g.gameDate ?? null,
  })), [data?.games])

  const rowsByCategory = useMemo(() => {
    const out: Record<CategoryKey, PublicRow[]> = {
      hr: [], hits: [], singles: [], doubles: [], triples: [], stolen_bases: [], tb: [], rbi: [], hrr: [],
    }
    if (!data?.games) return out
    const addSide = (lineup: any[], gameKey: string) => {
      for (const p of lineup ?? []) {
        const nn = p.name_norm || normName(p.name || '')
        const entry = resolveNameEntry(pikkitMap, nn)
        for (const cat of CATEGORIES) {
          const hasOdds = cat.books.some(b => p.props?.[cat.propsKey]?.[b] != null)
          if (!hasOdds) continue
          const byGame = entry?.[cat.pikkitProp]
          const row = byGame?.[gameKey] ?? byGame?.[''] ?? null
          const picks: number | null = row?.picks ?? null
          if (picks == null || picks <= 0) continue
          out[cat.key].push({ mlb_id: p.mlb_id, name: p.name, team: p.team, gameKey, picks, prices: p.props?.[cat.propsKey] })
        }
      }
    }
    for (const g of data.games) {
      addSide(g.homeLineup, g.gameKey)
      addSide(g.awayLineup, g.gameKey)
    }
    for (const cat of CATEGORIES) out[cat.key].sort((a, b) => b.picks - a.picks)
    return out
  }, [data, pikkitMap])

  const activeCat = CATEGORIES.find(c => c.key === activeCategory)!
  const rows = (rowsByCategory[activeCategory] ?? []).filter(r => activeGame === 'all' || r.gameKey === activeGame)

  if (error) return <div style={{ padding: 24, color: 'var(--red)', fontSize: 13 }}>{error}</div>
  if (!data) return <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13 }}>Loading today&apos;s picks…</div>

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <GameSelector games={games} value={activeGame} onChange={setActiveGame} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            onClick={() => setActiveCategory(c.key)}
            style={{
              padding: '8px 14px', borderRadius: 999, fontSize: 12, fontWeight: 800, cursor: 'pointer',
              border: `1px solid ${activeCategory === c.key ? 'var(--accent)' : 'var(--border)'}`,
              background: activeCategory === c.key ? 'var(--accent-dim)' : 'var(--surface)',
              color: activeCategory === c.key ? 'var(--accent)' : 'var(--text-2)',
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r, i) => (
          <div
            key={`${r.mlb_id}_${r.gameKey}`}
            className="ss-card"
            style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderRadius: 12,
            }}
          >
            <div style={{ width: 26, textAlign: 'center', fontSize: 16, fontWeight: 900, color: i < 3 ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0 }}>
              {i + 1}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <PlayerLink mlbId={r.mlb_id} name={r.name} teamAbbr={r.team} size={36} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
              <PickBadge picks={r.picks} label={activeCat.short} />
              <BookBadges prices={r.prices} books={activeCat.books} />
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 13, border: '1px solid var(--border)', borderRadius: 12 }}>
            No {activeCat.label} picks with real book odds yet {activeGame === 'all' ? 'today' : 'for this game'}.
          </div>
        )}
      </div>
    </div>
  )
}

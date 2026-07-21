'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { PlayerLink } from '@/components/players/PlayerPageClient'
import { TeamLogo } from '@/components/sports/PlayerAvatar'
import { PickBadge, BookBadges, oStr } from '@/components/shared/OddsBadges'
import { BookLogo } from '@/components/BookLogo'
import { WatchlistStarButton } from '@/components/shared/WatchlistStarButton'
import { normName, resolveNameEntry } from '@/lib/nameNorm'
import { getTeamLogoUrl } from '@/lib/mlbTeamColors'

// Every book we actually store odds under (see BookLogo.tsx) — every
// category shows whichever of these actually have a real price for that
// specific player/line rather than being artificially capped to FanDuel;
// confirmed live that most markets here (TB, RBI, Hits, etc.) commonly
// carry 4-5 real books, not just one.
const ALL_BOOKS = ['fanduel', 'draftkings', 'betmgm', 'caesars', 'betrivers', 'fanatics']

// Every prop category we track odds AND community Pikkit picks for —
// anything else (walks, strikeouts, runs) has one or the other but not
// both, so it's left out rather than showing a leaderboard with no real
// odds attached to it. `propsKey` indexes into each lineup player's `.props`
// BDLPropMap object (see balldontlie.ts); `pikkitProp` is the exact
// prop_type string api/admin/pikkit-import/route.ts's MARKET_MAP writes.
// `books` mirrors BatterCostClient's own MARKET_BOOKS — fhr/sa are the only
// two markets BDL gives multiple books for, everything else is FanDuel-only.
type CategoryKey = 'hr' | 'hits' | 'singles' | 'doubles' | 'triples' | 'stolen_bases' | 'tb' | 'rbi' | 'hrr'
// A graduated line — TB and RBI each have multiple real pregame lines
// (2+/3+/4+/5+ TB, 1+/2+/3+ RBI, see BDLPropMap in balldontlie.ts) beyond
// the single base propsKey this card's primary badge already shows.
// `threshold` is the real stat count needed to clear it, matched against
// the game's real outcome (fetchBoxscoreOutcomes) — not just whichever one
// line Pikkit happens to track picks for.
type LadderRung = { propsKey: string; threshold: number; label: string }
// outcomeKey indexes into each game's real per-player outcome object (see
// fetchBoxscoreOutcomes in dugout/data/route.ts: h/hr/doubles/triples/
// singles/sb/tb/rbi/hrr). gradeType 'binary' just checks >=1 (did they
// record it at all); 'count' heatmaps the real quantity — rbi/tb/hrr are
// all genuinely accumulative stats, not yes/no. `ladder` is only set for
// TB/RBI (multiple distinct pregame lines); `dynamicLine` is only set for
// HRR, which only ever has ONE real line per player/book — its actual
// numeric threshold lives in props.hrr_line, not a fixed ladder.
type CategoryDef = {
  key: CategoryKey; label: string; short: string; pikkitProp: string; propsKey: string; books: string[]
  outcomeKey: string; gradeType: 'binary' | 'count'; ladder?: LadderRung[]; dynamicLine?: boolean
}
const CATEGORIES: CategoryDef[] = [
  { key: 'hr', label: 'Home Run', short: 'HR', pikkitProp: 'home_runs', propsKey: 'sa', books: ALL_BOOKS, outcomeKey: 'hr', gradeType: 'binary' },
  { key: 'hits', label: 'To Record a Hit', short: 'Hits', pikkitProp: 'hits', propsKey: 'hits', books: ALL_BOOKS, outcomeKey: 'h', gradeType: 'binary' },
  { key: 'singles', label: 'Singles', short: '1B', pikkitProp: 'singles', propsKey: 'singles', books: ALL_BOOKS, outcomeKey: 'singles', gradeType: 'binary' },
  { key: 'doubles', label: 'Doubles', short: '2B', pikkitProp: 'doubles', propsKey: 'doubles', books: ALL_BOOKS, outcomeKey: 'doubles', gradeType: 'binary' },
  { key: 'triples', label: 'Triples', short: '3B', pikkitProp: 'triples', propsKey: 'triples', books: ALL_BOOKS, outcomeKey: 'triples', gradeType: 'binary' },
  { key: 'stolen_bases', label: 'Stolen Base', short: 'SB', pikkitProp: 'stolen_bases', propsKey: 'stolen_bases', books: ALL_BOOKS, outcomeKey: 'sb', gradeType: 'binary' },
  {
    key: 'tb', label: 'Total Bases', short: 'TB', pikkitProp: 'bases', propsKey: 'tb', books: ALL_BOOKS, outcomeKey: 'tb', gradeType: 'count',
    ladder: [
      { propsKey: 'tb', threshold: 2, label: '2+' },
      { propsKey: 'tb3', threshold: 3, label: '3+' },
      { propsKey: 'tb4', threshold: 4, label: '4+' },
      { propsKey: 'tb5', threshold: 5, label: '5+' },
    ],
  },
  {
    key: 'rbi', label: 'RBI', short: 'RBI', pikkitProp: 'rbi', propsKey: 'rbi', books: ALL_BOOKS, outcomeKey: 'rbi', gradeType: 'count',
    ladder: [
      { propsKey: 'rbi', threshold: 1, label: '1+' },
      { propsKey: 'rbi2', threshold: 2, label: '2+' },
      { propsKey: 'rbi3', threshold: 3, label: '3+' },
    ],
  },
  { key: 'hrr', label: 'Hits + Runs + RBIs', short: 'HRR', pikkitProp: 'hits_runs_rbi', propsKey: 'hrr', books: ALL_BOOKS, outcomeKey: 'hrr', gradeType: 'count', dynamicLine: true },
]

// TB/RBI: every offered rung the real outcome actually cleared, each with
// every book's own real odds for that specific rung. HRR: only ever has
// ONE line per book (its numeric threshold varies by player AND by book —
// FanDuel might post "2+" while DraftKings posts "3+" for the same guy),
// so books are grouped by their actual threshold first, and each distinct
// cleared threshold becomes its own line with just the books that posted it.
type HitLine = { label: string; prices: any }
function computeHitLines(cat: CategoryDef, props: any, outcome: any | null): HitLine[] {
  if (!outcome) return []
  const value: number = outcome[cat.outcomeKey] ?? 0
  if (cat.ladder) {
    return cat.ladder
      .filter(rung => value >= rung.threshold && cat.books.some(b => props?.[rung.propsKey]?.[b] != null))
      .map(rung => ({ label: rung.label, prices: props?.[rung.propsKey] }))
  }
  if (cat.dynamicLine) {
    // A real line always sits at X.5 (no pushes) — line=1.5 means "2+",
    // line=2.5 means "3+", so the label the user actually bet on is the
    // next whole number up, and clearing it means the outcome reached that.
    const byThreshold: Record<number, Record<string, number>> = {}
    for (const book of cat.books) {
      const price = props?.[cat.propsKey]?.[book]
      if (price == null) continue
      const line = props?.hrr_line?.[book]
      const threshold = typeof line === 'number' ? Math.ceil(line) : 1
      ;(byThreshold[threshold] ??= {})[book] = price
    }
    return Object.entries(byThreshold)
      .map(([threshold, prices]) => [Number(threshold), prices] as const)
      .filter(([threshold]) => value >= threshold)
      .sort((a, b) => a[0] - b[0])
      .map(([threshold, prices]) => ({ label: `${threshold}+`, prices }))
  }
  return []
}

// Only graded once a game is actually underway — a game still in Preview
// has no real outcome yet, so every card stays neutral rather than red.
// Live games grade exactly like Final ones (the box score just keeps
// updating), which is what makes this update in real time as it happens.
// A postponed/cancelled game reports abstractGameState 'Final' from MLB
// with no distinction from a real completed game (confirmed live) — void
// takes priority over everything else so those players show a neutral
// "did not play" marker instead of red/0 against a game that never happened.
type Grade = { bg: string; border: string; text: string; checkmark: boolean; value: number; isVoid?: boolean }
function gradeRow(cat: CategoryDef, gameStatus: string, outcome: any | null, isVoid?: boolean): Grade | null {
  if (isVoid) return { bg: 'rgba(120,130,140,0.10)', border: 'rgba(120,130,140,0.35)', text: 'var(--text-3)', checkmark: false, value: 0, isVoid: true }
  if (gameStatus !== 'Live' && gameStatus !== 'Final') return null
  if (!outcome) return null
  const value: number = outcome[cat.outcomeKey] ?? 0

  if (cat.gradeType === 'binary') {
    return value >= 1
      ? { bg: 'rgba(180,255,77,0.16)', border: 'rgba(180,255,77,0.55)', text: 'var(--accent)', checkmark: true, value }
      : { bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.35)', text: '#ef4444', checkmark: false, value }
  }
  // Count heatmap: 0 red, 1 yellow, 2+ green — brighter/greener the higher
  // it goes, brightest at 4+.
  if (value <= 0) return { bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.35)', text: '#ef4444', checkmark: false, value }
  if (value === 1) return { bg: 'rgba(234,179,8,0.14)', border: 'rgba(234,179,8,0.45)', text: '#eab308', checkmark: false, value }
  if (value === 2) return { bg: 'rgba(163,230,53,0.14)', border: 'rgba(163,230,53,0.4)', text: '#a3e635', checkmark: false, value }
  if (value === 3) return { bg: 'rgba(180,255,77,0.20)', border: 'rgba(180,255,77,0.5)', text: 'var(--accent)', checkmark: false, value }
  return { bg: 'rgba(180,255,77,0.30)', border: 'var(--accent)', text: 'var(--accent)', checkmark: false, value }
}

type GameOption = { gameKey: string; awayAbbr: string; homeAbbr: string; gameDate: string | null }
type PublicRow = {
  mlb_id: number; name: string; team: string; position: string | null; bats: string | null
  gameKey: string; gamePk: string | null; gameDate: string | null
  picks: number; prices: any; gameStatus: string; isVoid: boolean; outcome: any | null; hitLines: HitLine[]
}

// One cleared threshold's real odds — "2+ +150", "4+ +500", etc. Multiple
// of these render side by side when a player cleared more than one offered
// line (e.g. 6 total bases clears the 2+, 3+, 4+, AND 5+ lines at once).
function HitLineChip({ hl, books }: { hl: HitLine; books: string[] }) {
  const entries = books.map(b => [b, hl.prices?.[b]] as const).filter((e): e is [string, number] => e[1] != null)
  if (!entries.length) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 6,
      background: 'rgba(180,255,77,0.12)', border: '1px solid rgba(180,255,77,0.35)', fontSize: 10, fontWeight: 800,
    }}>
      <span style={{ color: 'var(--accent)' }}>{hl.label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {entries.map(([book, v]) => (
          <span key={book} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--text-2)' }}>
            <BookLogo vendor={book} size={12} />{oStr(v)}
          </span>
        ))}
      </div>
    </div>
  )
}

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

  // Re-poll while any game on this date is actually in progress, so the
  // outcome heatmap updates in real time as hits/runs/RBIs happen — a
  // Preview/Final-only slate never re-fetches at all.
  const anyLive = (data?.games ?? []).some((g: any) => g.status === 'Live')
  useEffect(() => {
    if (!anyLive) return
    const id = setInterval(() => {
      fetch(`/api/dugout/data?date=${date}`, { cache: 'no-store' })
        .then(r => r.json())
        .then(d => setData(d))
        .catch(() => {})
    }, 60_000)
    return () => clearInterval(id)
  }, [anyLive, date])

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
    const addSide = (lineup: any[], gameKey: string, gamePk: string | null, gameDate: string | null, gameStatus: string, isVoid: boolean, outcomes: Record<string, any>) => {
      for (const p of lineup ?? []) {
        const nn = p.name_norm || normName(p.name || '')
        const entry = resolveNameEntry(pikkitMap, nn)
        const outcome = outcomes?.[p.mlb_id] ?? null
        for (const cat of CATEGORIES) {
          const hasOdds = cat.books.some(b => p.props?.[cat.propsKey]?.[b] != null)
          if (!hasOdds) continue
          const byGame = entry?.[cat.pikkitProp]
          const row = byGame?.[gameKey] ?? byGame?.[''] ?? null
          const picks: number | null = row?.picks ?? null
          if (picks == null || picks <= 0) continue
          const graded = (gameStatus === 'Live' || gameStatus === 'Final') && !isVoid
          const hitLines = graded ? computeHitLines(cat, p.props, outcome) : []
          out[cat.key].push({
            mlb_id: p.mlb_id, name: p.name, team: p.team, position: p.position ?? null, bats: p.bats ?? null,
            gameKey, gamePk, gameDate, picks, prices: p.props?.[cat.propsKey], gameStatus, isVoid, outcome, hitLines,
          })
        }
      }
    }
    for (const g of data.games) {
      const gamePk = g.gamePk != null ? String(g.gamePk) : null
      const isVoid = !!g.isVoid
      addSide(g.homeLineup, g.gameKey, gamePk, g.gameDate ?? null, g.status, isVoid, g.outcomes ?? {})
      addSide(g.awayLineup, g.gameKey, gamePk, g.gameDate ?? null, g.status, isVoid, g.outcomes ?? {})
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
        {rows.map((r, i) => {
          const grade = gradeRow(activeCat, r.gameStatus, r.outcome, r.isVoid)
          // Same book-preference order the star already assumes elsewhere
          // (Dugout/Batter Cost) — FanDuel if it's priced, else whichever
          // book actually has this exact line.
          const starBook = r.prices?.fanduel != null ? 'fanduel' : Object.keys(r.prices ?? {})[0]
          const starOdds = starBook ? r.prices?.[starBook] ?? null : null
          return (
          <div
            key={`${r.mlb_id}_${r.gameKey}`}
            className="ss-card"
            style={{
              display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 16px', borderRadius: 12,
              background: grade ? grade.bg : undefined,
              border: grade ? `1px solid ${grade.border}` : undefined,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 26, textAlign: 'center', fontSize: 16, fontWeight: 900, color: i < 3 ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0 }}>
                {i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <PlayerLink mlbId={r.mlb_id} name={r.name} teamAbbr={r.team} size={36} />
              </div>
              {grade && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  minWidth: grade.isVoid ? 'auto' : 30, height: 30, padding: grade.isVoid ? '0 10px' : undefined,
                  borderRadius: 8, fontSize: grade.isVoid ? 11 : 14, fontWeight: 900,
                  color: grade.text, background: 'rgba(0,0,0,0.2)', border: `1px solid ${grade.border}`,
                  whiteSpace: 'nowrap',
                }}>
                  {grade.isVoid ? '⚠️ VOID' : grade.checkmark ? '✅' : grade.value}
                </div>
              )}
              <div style={{ flexShrink: 0 }}>
                <PickBadge picks={r.picks} label={activeCat.short} />
              </div>
              <div style={{ flexShrink: 0 }}>
                <WatchlistStarButton
                  mlbId={r.mlb_id} name={r.name} team={r.team} position={r.position} bats={r.bats}
                  gameInfo={{ sport: 'MLB', game_pk: r.gamePk, game_date: date }}
                  odds={starOdds}
                  oddsByBook={r.prices}
                  propKey={activeCat.propsKey}
                  book={starBook ?? 'fanduel'}
                  size={16}
                />
              </div>
            </div>
            {/* Every book's real price for the base line, plus every
                graduated line the real outcome actually cleared — a
                separate full-width row so a player with several books and/or
                several cleared lines never squeezes the name column above
                (a real bug when this used to share the header row: covering
                5-6 books per line made that column wide enough to overlap
                the name on mobile). */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 40, alignItems: 'center' }}>
              <BookBadges prices={r.prices} books={activeCat.books} />
              {r.hitLines.map(hl => <HitLineChip key={hl.label} hl={hl} books={activeCat.books} />)}
            </div>
          </div>
          )
        })}
        {rows.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 13, border: '1px solid var(--border)', borderRadius: 12 }}>
            No {activeCat.label} picks with real book odds yet {activeGame === 'all' ? 'today' : 'for this game'}.
          </div>
        )}
      </div>
    </div>
  )
}

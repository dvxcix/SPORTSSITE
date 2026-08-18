'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, ExternalLink, SlidersHorizontal, TrendingDown, TrendingUp, X } from 'lucide-react'
import { PlayerLink, HandBadge } from '@/components/players/PlayerPageClient'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import { SortableTH, SortState, toggleSortState, cmpNullsLast, cmpAny } from '@/components/pitcher-report/MatchupTables'
import { Tooltip } from '@/components/ui/tooltip-card'
import { normName, resolveNameEntry } from '@slipsurge/core/nameNorm'
import { WatchlistStarButton } from '@/components/shared/WatchlistStarButton'
import { PickBadge, BookBadges, oStr } from '@/components/shared/OddsBadges'
import { PageState } from '@/components/layout/PageState'

// Every market that carries an opening-line baseline (see dugout/data/
// route.ts's entry.open merge) — current value lives on the vendor-keyed
// BDL/FD field, open lives on the matching open.*Fd key. Every market here
// shares the same sign convention: a NEGATIVE delta means the price got
// shorter since opening (more likely per the book = real conviction), same
// "negative = green/hot" rule DugoutClient's own fhr_pct/sa_pct shading
// uses. Deliberately excludes the parlay/combo/BetMGM/laser/moonshot/PA1/
// HR-ML markets — not wanted on this page.
const MARKETS: { key: string; label: string; current: (p: any) => number | null; open: (p: any) => number | null }[] = [
  { key: 'fhr',      label: 'FHR',    current: p => p?.fhr?.fanduel ?? null,     open: p => p?.open?.fhr ?? null },
  { key: 'sa',       label: 'HR',     current: p => p?.sa?.fanduel ?? null,      open: p => p?.open?.saFd ?? null },
  { key: 'hr2',      label: 'HR 2+',  current: p => p?.hr2?.fanduel ?? null,     open: p => p?.open?.hr2Fd ?? null },
  { key: 'singles',  label: '1B',     current: p => p?.singles?.fanduel ?? null, open: p => p?.open?.sngFd ?? null },
  { key: 'doubles',  label: '2B',     current: p => p?.doubles?.fanduel ?? null, open: p => p?.open?.dblFd ?? null },
  { key: 'triples',  label: '3B',     current: p => p?.triples?.fanduel ?? null, open: p => p?.open?.triFd ?? null },
  { key: 'rbi',      label: 'RBI',    current: p => p?.rbi?.fanduel ?? null,     open: p => p?.open?.rbiFd ?? null },
  { key: 'rbi2',     label: 'RBI 2+', current: p => p?.rbi2?.fanduel ?? null,    open: p => p?.open?.rbi2Fd ?? null },
  { key: 'rbi3',     label: 'RBI 3+', current: p => p?.rbi3?.fanduel ?? null,    open: p => p?.open?.rbi3Fd ?? null },
  { key: 'tb',       label: 'TB 2+',  current: p => p?.tb?.fanduel ?? null,      open: p => p?.open?.tbFd ?? null },
  { key: 'tb3',      label: 'TB 3+',  current: p => p?.tb3?.fanduel ?? null,     open: p => p?.open?.tb3Fd ?? null },
  { key: 'tb4',      label: 'TB 4+',  current: p => p?.tb4?.fanduel ?? null,     open: p => p?.open?.tb4Fd ?? null },
  { key: 'tb5',      label: 'TB 5+',  current: p => p?.tb5?.fanduel ?? null,     open: p => p?.open?.tb5Fd ?? null },
  { key: 'hrr',      label: 'HRR',    current: p => p?.hrr?.fanduel ?? null,     open: p => p?.open?.hrrFd ?? null },
  // Previously untracked anywhere (no opening baseline, no delta) — now
  // captured directly off BDL's own per-minute poll into
  // market_opening_prices, same as every other BDL-priced market above.
  { key: 'hits',          label: '1+ H',  current: p => p?.hits?.fanduel ?? null,          open: p => p?.open?.hits ?? null },
  { key: 'hits2',         label: '2+ H',  current: p => p?.hits2?.fanduel ?? null,         open: p => p?.open?.hits2 ?? null },
  { key: 'runs',          label: '1+ R',  current: p => p?.runs?.fanduel ?? null,          open: p => p?.open?.runs ?? null },
  { key: 'runs2',         label: '2+ R',  current: p => p?.runs2?.fanduel ?? null,         open: p => p?.open?.runs2 ?? null },
  { key: 'stolen_bases',  label: '1+ SB', current: p => p?.stolen_bases?.fanduel ?? null,  open: p => p?.open?.stolenBases ?? null },
  { key: 'stolen_bases2', label: '2+ SB', current: p => p?.stolen_bases2?.fanduel ?? null, open: p => p?.open?.stolenBases2 ?? null },
]

// Which books actually carry a current price for a given market — fhr/sa
// are the only two markets BDL gives us multiple books for (see Dugout's
// own OddsCell usage); every other market here is FanDuel-only, same as
// its `current`/`open` accessors above already assume.
const MARKET_BOOKS: Record<string, string[]> = {
  fhr: ['fanduel', 'caesars', 'fanatics'],
  sa: ['fanduel', 'caesars', 'betmgm', 'betrivers'],
}
const booksFor = (key: string) => MARKET_BOOKS[key] ?? ['fanduel']

// Pikkit only ever tracks one base-line prop per stat category — no alt-line
// thresholds (fhr, hr2, rbi2/3, tb3/4/5 never get a pick count, same as on
// Dugout/Pitcher Report). Maps this page's MARKETS key to Pikkit's own
// prop_type string (see api/admin/pikkit-import/route.ts's MARKET_MAP).
const MARKET_TO_COMMUNITY_PROP: Record<string, string> = {
  sa: 'home_runs', singles: 'singles', doubles: 'doubles', triples: 'triples',
  rbi: 'rbi', tb: 'bases', hrr: 'hits_runs_rbi',
}

type MarketDelta = { current: number | null; open: number | null; delta: number | null }
type FlatBatter = {
  mlb_id: number; gameKey: string; gamePk: number | null; gameDate: string | null
  name: string; team: string; bats: string; position: string
  opponentId: number | null; opponentName: string; opponentHand: string; opponentTeam: string
  fhr_pct: number | null; sa_pct: number | null
  deltas: Record<string, MarketDelta>
  // Raw per-book props for this player (fhr/sa/hr2/... objects + the
  // FanDuel-only `open` baseline) — kept alongside the already-computed
  // `deltas` above so the per-book badge rows below can pull real book
  // prices without re-deriving them from the FanDuel-only delta shape.
  rawProps: any
  // Community pick count per market (only the 7 keys in MARKET_TO_COMMUNITY_PROP
  // are ever populated) — same source/matching Dugout's own pk*/pick-count
  // badges use, just flattened across every game instead of scoped to one
  // active game tab.
  picks: Record<string, number | null>
  // "⚡PWR" — Dugout's own "Power Vehicle" gate (ported from mlb-party
  // Signals), duplicated here rather than imported so this page can never
  // affect Dugout's behavior. See rawRatio/is_pwr below for the math.
  is_pwr: boolean
}

// Ported from DugoutClient.tsx's buildBatterRow (same exact thresholds) —
// a stuffed single + expensive double, both priced consistent with real
// HR/total-bases conviction, flags a real power threat tonight. Uses the
// builder's own simplified (odds+100) ratio on CURRENT FanDuel prices for
// sa/doubles/tb4, not the implied-probability math the delta columns use.
const rawRatio = (a: number | null, b: number | null) =>
  a != null && b != null ? Math.round(((a + 100) / (b + 100)) * 10) / 10 : null
function computeIsPwr(props: any): boolean {
  const saFd = props?.sa?.fanduel ?? null
  const dblFd = props?.doubles?.fanduel ?? null
  const tb4Fd = props?.tb4?.fanduel ?? null
  const pvRatio = rawRatio(saFd, dblFd)
  const saTb4Gate = rawRatio(saFd, tb4Fd)
  return pvRatio != null && pvRatio >= 1.35 && pvRatio <= 1.60 && saTb4Gate != null && saTb4Gate <= 3.8
}
const PWR_TITLE = 'Power Vehicle — this player\'s HR, double, and total-bases pricing all line up with real book conviction on power tonight'

const pctStr = (v: number | null) => v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`

// FHR%/HR% are computed ratios that essentially never land on exactly
// zero, so their "flat" option means something different than the delta
// columns' — it catches rows where the ratio couldn't be computed at all
// (no FanDuel FHR/HR price, or no season-average price to compare against),
// which render as "—" in the table. Reported live: no way to isolate those
// blank rows from real 0%-movers, and there ARE no real 0%-movers for a
// ratio like this anyway. The FHR/HR delta columns are whole odds points
// (current − open) that legitimately land on exactly 0 often (a line that
// hasn't moved since opening at all), so those keep their own "flat" = 0
// meaning, unrelated to this one.
type SignFilter = 'all' | 'pos' | 'neg'
type PctFilter = SignFilter | 'blank'
type DeltaFilter = SignFilter | 'flat'
const matchesSign = (v: number | null, f: SignFilter) => {
  if (f === 'all') return true
  if (v == null) return false
  return f === 'pos' ? v > 0 : v < 0
}
const matchesPct = (v: number | null, f: PctFilter) => {
  if (f === 'blank') return v == null
  return matchesSign(v, f)
}
const matchesDelta = (v: number | null, f: DeltaFilter) => {
  if (f === 'flat') return v === 0
  return matchesSign(v, f)
}

function FilterGroup<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { key: T; label: string }[]; onChange: (v: T) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.03em' }}>{label}</span>
      <div style={{ display: 'flex', gap: 4 }}>
        {options.map(o => (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            style={{
              fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${value === o.key ? 'var(--accent)' : 'var(--border)'}`,
              background: value === o.key ? 'var(--accent-dim)' : 'var(--surface-2)',
              color: value === o.key ? 'var(--accent)' : 'var(--text-3)',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function deltaColor(delta: number | null, maxAbs: number): React.CSSProperties {
  if (delta == null) return { color: 'var(--text-3)' }
  if (Math.abs(delta) < 3) return { color: 'var(--text-2)', fontWeight: 600 }
  const intensity = maxAbs > 0 ? Math.min(Math.abs(delta) / maxAbs, 1) : 0
  const alpha = 0.55 + intensity * 0.45
  return { color: delta < 0 ? `rgba(74,222,128,${alpha})` : `rgba(248,113,113,${alpha})`, fontWeight: 700 }
}

// Same sign convention as deltaColor, just on a 0..1 fraction instead of raw
// odds points — negative (price cheaper than this player's own season
// average = book conviction) is green, matching DugoutClient's fhr_pct/
// sa_pct shading exactly.
function pctColor(pct: number | null, maxAbs: number): React.CSSProperties {
  if (pct == null) return { color: 'var(--text-3)' }
  if (Math.abs(pct) < 0.03) return { color: '#eab308', fontWeight: 700 }
  const intensity = maxAbs > 0 ? Math.min(Math.abs(pct) / maxAbs, 1) : 0
  const alpha = 0.55 + intensity * 0.45
  return { color: pct < 0 ? `rgba(74,222,128,${alpha})` : `rgba(248,113,113,${alpha})`, fontWeight: 700 }
}

type BatterCostClientProps = {
  date: string
  gameKey?: string | null
}

export function BatterCostClient({ date, gameKey }: BatterCostClientProps) {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  // Keyed by mlb_id+gameKey, not mlb_id alone — a doubleheader batter has
  // two distinct rows sharing an mlb_id, and hover should only ever
  // highlight the one actually under the cursor.
  const [hovered, setHovered] = useState<string | null>(null)
  const [expandedPlayerKey, setExpandedPlayerKey] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  // Default: biggest HR% drop vs. this player's own season-average price
  // first — the "who's the biggest opening-day mover" view the page exists
  // for. Click any column to re-sort by it instead.
  const [sort, setSort] = useState<SortState>({ col: 'sa_pct', dir: 'asc' })

  // Filters narrow WHICH rows show up at all; sorting (above) still just
  // reorders whatever's left. Default 'all' on every one — customizing is
  // opt-in, the page behaves exactly as before until a filter is touched.
  // FHR%/HR% are their own two sign-only filters; every MARKETS column
  // (FHR, HR, HR2+, singles...HRR) gets a +/−/0 delta filter, keyed by
  // market key so adding a new market doesn't require new filter state.
  const [fhrPctFilter, setFhrPctFilter] = useState<PctFilter>('all')
  const [saPctFilter, setSaPctFilter] = useState<PctFilter>('all')
  const [deltaFilters, setDeltaFilters] = useState<Record<string, DeltaFilter>>({})
  const getDeltaFilter = (key: string): DeltaFilter => deltaFilters[key] ?? 'all'
  const setDeltaFilter = (key: string, v: DeltaFilter) => setDeltaFilters(prev => ({ ...prev, [key]: v }))
  const [pwrFilter, setPwrFilter] = useState<'all' | 'pwr'>('all')
  const filtersActive = fhrPctFilter !== 'all' || saPctFilter !== 'all' || pwrFilter !== 'all' || Object.values(deltaFilters).some(v => v && v !== 'all')
  const activeFilterCount = Number(fhrPctFilter !== 'all') + Number(saPctFilter !== 'all') + Number(pwrFilter !== 'all')
    + Object.values(deltaFilters).filter(v => v && v !== 'all').length
  const resetFilters = () => { setFhrPctFilter('all'); setSaPctFilter('all'); setDeltaFilters({}); setPwrFilter('all') }

  useEffect(() => {
    let cancelled = false
    setData(null); setError(null)
    fetch(`/api/dugout/data?date=${date}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setError('Failed to load today\'s odds') })
    return () => { cancelled = true }
  }, [date])

  useEffect(() => {
    if (!expandedPlayerKey && !filtersOpen) return
    const mobileQuery = window.matchMedia('(max-width: 640px)')
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setExpandedPlayerKey(null); setFiltersOpen(false) }
    }
    const previousOverflow = document.body.style.overflow
    let locked = false
    const syncScrollLock = () => {
      if (mobileQuery.matches && !locked) {
        document.body.style.overflow = 'hidden'
        locked = true
      } else if (!mobileQuery.matches && locked) {
        document.body.style.overflow = previousOverflow
        locked = false
      }
    }

    syncScrollLock()
    mobileQuery.addEventListener('change', syncScrollLock)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      mobileQuery.removeEventListener('change', syncScrollLock)
      if (locked) document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [expandedPlayerKey, filtersOpen])

  // Same source, same map-building, and the exact same fhr_pct/sa_pct math
  // DugoutClient.tsx's buildBatterRow already uses (today's FanDuel price
  // vs. this player's own season-average price, sourced from mlb-party's
  // get_fhr_history_avg/get_sa_history_avg RPCs, already included in
  // /api/dugout/data's response as data.fhrAvg/data.saAvg) — duplicated
  // here deliberately rather than importing DugoutClient's own private
  // buildBatterRow, so this page can never affect Dugout's behavior.
  const fhrAvgMap = useMemo<Record<string, { fd?: number; cz?: number }>>(() => {
    const m: Record<string, { fd?: number; cz?: number }> = {}
    for (const r of (data?.fhrAvg ?? [])) {
      const nn = normName(r.name_norm || r.player_name || '')
      if (!nn) continue
      if (!m[nn]) m[nn] = {}
      if (r.bookmaker === 'fanduel') m[nn].fd = Number(r.avg_price)
      if (r.bookmaker === 'williamhill_us') m[nn].cz = Number(r.avg_price)
    }
    return m
  }, [data?.fhrAvg])

  const saAvgMap = useMemo<Record<string, { fd?: number; cz?: number }>>(() => {
    const m: Record<string, { fd?: number; cz?: number }> = {}
    for (const r of (data?.saAvg ?? [])) {
      const nn = normName(r.name_norm || r.player_name || '')
      if (!nn) continue
      if (!m[nn]) m[nn] = {}
      if (r.bookmaker === 'fanduel') m[nn].fd = Number(r.avg_price)
      if (r.bookmaker === 'williamhill_us') m[nn].cz = Number(r.avg_price)
    }
    return m
  }, [data?.saAvg])

  // Same raw data.pikkit array + normName/resolveNameEntry fuzzy matching
  // Dugout's own communityPicksMap uses — the one difference is Dugout scopes to a
  // single active game tab (it only ever shows one game at a time), while
  // this page is flat across every game at once, so the map here is keyed
  // by market → game_key too (not just name), and an explicitly-tagged row
  // for a player's real game always wins over an untagged legacy row for
  // that same market at lookup time (same tie-break Dugout applies, just
  // resolved per-row here instead of against one shared active tab).
  const communityPicksMap = useMemo(() => {
    const m: Record<string, Record<string, Record<string, any>>> = {}
    for (const r of (data?.communityPicks ?? [])) {
      const nn = normName(r.player_name || '')
      const market = r.prop_type || r.market
      if (!nn || !market) continue
      if (!m[nn]) m[nn] = {}
      if (!m[nn][market]) m[nn][market] = {}
      m[nn][market][r.game_key || ''] = r
    }
    return m
  }, [data?.communityPicks])

  const picksFor = (nameNorm: string, gameKey: string): Record<string, number | null> => {
    const entry = resolveNameEntry(communityPicksMap, nameNorm)
    const out: Record<string, number | null> = {}
    for (const [mktKey, prop] of Object.entries(MARKET_TO_COMMUNITY_PROP)) {
      const byGame = entry?.[prop]
      const row = byGame?.[gameKey] ?? byGame?.[''] ?? null
      out[mktKey] = row?.picks ?? null
    }
    return out
  }

  const flatBatters: FlatBatter[] = useMemo(() => {
    if (!data?.games) return []
    const out: FlatBatter[] = []
    const addSide = (lineup: any[], opponentPitcher: any, opponentTeam: string, gameKey: string, gamePk: number | null, gameDate: string | null) => {
      for (const p of lineup ?? []) {
        const deltas: Record<string, MarketDelta> = {}
        let hasAny = false
        for (const m of MARKETS) {
          const current = m.current(p.props)
          const open = m.open(p.props)
          const delta = current != null && open != null ? current - open : null
          if (delta != null) hasAny = true
          deltas[m.key] = { current, open, delta }
        }

        const nn = p.name_norm || normName(p.name || '')
        const fhrFd = p.props?.fhr?.fanduel ?? null
        const saFd = p.props?.sa?.fanduel ?? null
        const fhrAvg = fhrAvgMap[nn]?.fd
        const fhr_pct = fhrFd != null && fhrAvg ? (fhrFd - fhrAvg) / fhrAvg : null
        const saAvg = saAvgMap[nn] ?? {}
        const sa_pct = saFd != null && saAvg.fd ? (saFd - saAvg.fd) / saAvg.fd
          : saFd != null && saAvg.cz ? (saFd - saAvg.cz) / saAvg.cz
          : null

        if (!hasAny && fhr_pct == null && sa_pct == null) continue
        out.push({
          mlb_id: p.mlb_id, gameKey, gamePk, gameDate, name: p.name, team: p.team, bats: p.bats, position: p.position,
          opponentId: opponentPitcher?.id ?? null, opponentName: opponentPitcher?.name ?? '',
          opponentHand: opponentPitcher?.hand ?? '', opponentTeam,
          fhr_pct, sa_pct, deltas, rawProps: p.props ?? null, picks: picksFor(nn, gameKey),
          is_pwr: computeIsPwr(p.props),
        })
      }
    }
    // gameKey (not just mlb_id) makes each row's React key unique even on a
    // doubleheader day, where the same batter can legitimately appear twice
    // — once per leg. Sharing a key across two rows was making repeated
    // re-sorts visually "stop working" (React reconciling the duplicate-key
    // rows unpredictably instead of just reordering two distinct nodes).
    for (const g of data.games) {
      if (gameKey && g.gameKey !== gameKey) continue
      const gamePk = g.gamePk != null ? Number(g.gamePk) : null
      // The page's own schedule day, NOT g.gameDate (MLB's raw first-pitch
      // timestamp) — for a late-night West Coast game, slicing that
      // timestamp's UTC calendar day can land on a different date than the
      // real schedule day the games list was fetched for, producing a
      // game_date that doesn't match any gamePk when /api/posts/pick
      // re-validates it server-side (real incident, 2026-07-21).
      addSide(g.homeLineup, g.awayPitcher, g.awayAbbr, g.gameKey, gamePk, date)
      addSide(g.awayLineup, g.homePitcher, g.homeAbbr, g.gameKey, gamePk, date)
    }
    return out
  }, [data, fhrAvgMap, saAvgMap, communityPicksMap, date, gameKey])

  const maxAbsByMarket = useMemo(() => {
    const m: Record<string, number> = {}
    for (const mkt of MARKETS) {
      const vals = flatBatters.map(b => b.deltas[mkt.key]?.delta).filter((x): x is number => x != null).map(Math.abs)
      m[mkt.key] = vals.length ? Math.max(...vals) : 0
    }
    return m
  }, [flatBatters])

  const maxAbsFhrPct = useMemo(() => {
    const vals = flatBatters.map(b => b.fhr_pct).filter((x): x is number => x != null).map(Math.abs)
    return vals.length ? Math.max(...vals) : 0
  }, [flatBatters])
  const maxAbsSaPct = useMemo(() => {
    const vals = flatBatters.map(b => b.sa_pct).filter((x): x is number => x != null).map(Math.abs)
    return vals.length ? Math.max(...vals) : 0
  }, [flatBatters])

  const onSort = (col: string) => setSort(prev => toggleSortState(prev, col))

  // Heat-map intensity (maxAbsByMarket/maxAbsFhrPct/maxAbsSaPct above) stays
  // scaled to the FULL unfiltered pool on purpose — otherwise a player's
  // color would shift every time a filter gets toggled, which reads as the
  // data itself changing rather than just which rows are shown.
  const filtered = useMemo(() => flatBatters.filter(b =>
    matchesPct(b.fhr_pct, fhrPctFilter) &&
    matchesPct(b.sa_pct, saPctFilter) &&
    (pwrFilter === 'all' || b.is_pwr) &&
    MARKETS.every(m => matchesDelta(b.deltas[m.key]?.delta ?? null, getDeltaFilter(m.key)))
  ), [flatBatters, fhrPctFilter, saPctFilter, pwrFilter, deltaFilters])

  const sorted = useMemo(() => {
    if (!sort) return filtered
    return [...filtered].sort((a, b) => {
      if (sort.col === 'name') return cmpAny(a.name, b.name, sort.dir)
      if (sort.col === 'fhr_pct') return cmpNullsLast(a.fhr_pct, b.fhr_pct, sort.dir)
      if (sort.col === 'sa_pct') return cmpNullsLast(a.sa_pct, b.sa_pct, sort.dir)
      return cmpNullsLast(a.deltas[sort.col]?.delta ?? null, b.deltas[sort.col]?.delta ?? null, sort.dir)
    })
  }, [filtered, sort])

  const expandedPlayer = useMemo(
    () => flatBatters.find(b => `${b.mlb_id}_${b.gameKey}` === expandedPlayerKey) ?? null,
    [flatBatters, expandedPlayerKey],
  )

  const renderFilterControls = () => (
    <>
      <FilterGroup label="FHR%" value={fhrPctFilter} onChange={setFhrPctFilter} options={[
        { key: 'all', label: 'All' }, { key: 'pos', label: '+' }, { key: 'neg', label: '−' }, { key: 'blank', label: '0' },
      ]} />
      <FilterGroup label="HR%" value={saPctFilter} onChange={setSaPctFilter} options={[
        { key: 'all', label: 'All' }, { key: 'pos', label: '+' }, { key: 'neg', label: '−' }, { key: 'blank', label: '0' },
      ]} />
      <FilterGroup label="⚡PWR" value={pwrFilter} onChange={setPwrFilter} options={[
        { key: 'all', label: 'All' }, { key: 'pwr', label: 'PWR only' },
      ]} />
      {MARKETS.map(m => (
        <FilterGroup key={m.key} label={`${m.label} Δ`} value={getDeltaFilter(m.key)} onChange={(v: DeltaFilter) => setDeltaFilter(m.key, v)} options={[
          { key: 'all', label: 'All' }, { key: 'pos', label: '+' }, { key: 'neg', label: '−' }, { key: 'flat', label: '0' },
        ]} />
      ))}
    </>
  )

  if (error) return <PageState compact kind="error" title="Batter markets could not load" message={error} />
  if (!data) return <PageState compact kind="loading" title="Loading batter markets" message="Syncing prices and movement across the board." />

  return (
    <div>
      <div className="batter-cost-filter-summary">
        <div>
          <SlidersHorizontal size={16} />
          <span>{activeFilterCount ? `${activeFilterCount} active` : 'All markets'}</span>
          <small>{sorted.length} batters</small>
        </div>
        {filtersActive ? <button type="button" className="batter-cost-filter-clear" onClick={resetFilters}>Clear</button> : null}
        <button type="button" className="batter-cost-filter-open" onClick={() => setFiltersOpen(true)}>
          Filters {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>
      </div>
      <div className="batter-cost-filter-panel" style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16,
        padding: '10px 12px', marginBottom: 12,
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
      }}>
        {renderFilterControls()}
        {filtersActive && (
          <button
            onClick={resetFilters}
            style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}
          >
            Clear filters
          </button>
        )}
      </div>
      <div className="batter-cost-table-scroll" style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
        <table className="batter-cost-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
            <tr>
              <SortableTH label="Batter" colKey="name" sort={sort} onSort={onSort} align="left" />
              <SortableTH label="FHR%" colKey="fhr_pct" sort={sort} onSort={onSort} align="center" />
              <SortableTH label="HR%" colKey="sa_pct" sort={sort} onSort={onSort} align="center" />
              {MARKETS.map(m => <SortableTH key={m.key} label={m.label} colKey={m.key} sort={sort} onSort={onSort} align="center" />)}
            </tr>
          </thead>
          <tbody>
            {sorted.map(b => (
              <tr
                key={`${b.mlb_id}_${b.gameKey}`}
                className="batter-cost-row"
                onMouseEnter={() => setHovered(`${b.mlb_id}_${b.gameKey}`)}
                onMouseLeave={() => setHovered(null)}
              >
                <td
                  className="batter-cost-player-cell w-[172px] min-w-[172px] max-w-[172px] sm:w-[156px] sm:min-w-[156px] sm:max-w-[156px]"
                  onClick={() => {
                    if (window.matchMedia('(max-width: 640px)').matches) {
                      setExpandedPlayerKey(`${b.mlb_id}_${b.gameKey}`)
                    }
                  }}
                  onKeyDown={event => {
                    if ((event.key === 'Enter' || event.key === ' ') && window.matchMedia('(max-width: 640px)').matches) {
                      event.preventDefault()
                      setExpandedPlayerKey(`${b.mlb_id}_${b.gameKey}`)
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-haspopup="dialog"
                  aria-label={`Open ${b.name} market details`}
                  style={{
                    padding: '6px 6px', position: 'sticky', left: 0, zIndex: 2, cursor: 'pointer',
                    backgroundColor: 'var(--bg)',
                    backgroundImage: hovered === `${b.mlb_id}_${b.gameKey}` ? 'linear-gradient(rgba(255,255,255,0.025), rgba(255,255,255,0.025))' : 'none',
                    // inset box-shadow instead of a real border — doesn't
                    // add to the cell's box model, so the fixed 130/156px
                    // width classes above stay exact.
                    ...(b.is_pwr ? { boxShadow: 'inset 0 0 0 2px #f59e0b' } : {}),
                  }}
                >
                  {/* flexWrap on both lines here (not overflow:hidden) —
                      same fix as Dugout's sticky column, applied
                      preventively: a fixed-width sticky column with no
                      wrap risks long names/badges visually overlapping the
                      next column instead of being clipped, since this cell
                      never had overflow:hidden to begin with. Wrapping
                      keeps everything inside the column's own width. */}
                  <div className="batter-cost-player-desktop" style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', rowGap: 2 }} onClick={event => event.stopPropagation()}>
                    <HandBadge hand={b.bats} />
                    <PlayerLink mlbId={b.mlb_id} name={b.name} teamAbbr={b.team} size={22} />
                    {b.is_pwr && (
                      <Tooltip content={PWR_TITLE}>
                        <span style={{
                          fontSize: 9, fontWeight: 900, color: '#f59e0b', background: 'rgba(245,158,11,0.15)',
                          border: '1px solid rgba(245,158,11,0.4)', borderRadius: 4, padding: '1px 4px',
                          cursor: 'help', flexShrink: 0,
                        }}>⚡PWR</span>
                      </Tooltip>
                    )}
                    <WatchlistStarButton
                      mlbId={b.mlb_id} name={b.name} team={b.team} position={b.position} bats={b.bats}
                      gameInfo={{ sport: 'MLB', game_pk: b.gamePk != null ? String(b.gamePk) : null, game_date: b.gameDate }}
                      odds={b.deltas.sa?.current ?? null}
                    />
                  </div>
                  <div className="batter-cost-player-mobile">
                    <HandBadge hand={b.bats} />
                    <Link href={`/players/${b.mlb_id}`} onClick={event => event.stopPropagation()} aria-label={`Open ${b.name} profile`}>
                      <PlayerAvatar headshot={mlbHeadshot(b.mlb_id)} teamLogo={getTeamLogoUrl(b.team)} size={28} teamAbbr={b.team} name={b.name} />
                    </Link>
                    <div className="batter-cost-player-copy">
                      <span>{b.name}</span>
                      <small>{b.position} · {b.team}</small>
                    </div>
                    {b.is_pwr ? <span className="batter-cost-pwr-mobile">PWR</span> : null}
                    <span className="batter-cost-expand-indicator" aria-hidden="true">›</span>
                  </div>
                  {/* Opposing-pitcher info (name/hand/avatar) was dropped
                      from this card — this page is about batters, and that
                      extra content made an already-tall row taller and more
                      variable-height still, worsening the sticky-column
                      row-desync issue on mobile. Pitcher matchup detail
                      still lives on Dugout/Pitcher Report. */}
                  <div className="batter-cost-player-position" style={{ marginTop: 3, marginLeft: 27, fontSize: 9, color: 'var(--text-3)' }}>
                    {b.position}
                  </div>
                </td>
                {/* FHR%/HR% are season-average ratios, not opening-vs-current
                    deltas — the badge row underneath repurposes that space to
                    show the OPENING FanDuel price the ratio doesn't otherwise
                    surface anywhere, so a reader can see the real number
                    behind the percentage. */}
                <td style={{ padding: '8px 8px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: 14, ...pctColor(b.fhr_pct, maxAbsFhrPct) }}>
                  {pctStr(b.fhr_pct)}
                  <BookBadges prices={{ fanduel: b.rawProps?.open?.fhr ?? null }} books={['fanduel']} />
                </td>
                <td style={{ padding: '8px 8px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: 14, ...pctColor(b.sa_pct, maxAbsSaPct) }}>
                  {pctStr(b.sa_pct)}
                  <BookBadges prices={{ fanduel: b.rawProps?.open?.saFd ?? null }} books={['fanduel']} />
                </td>
                {MARKETS.map(m => {
                  const d = b.deltas[m.key]
                  return (
                    <td key={m.key} style={{ padding: '8px 8px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: 14, ...deltaColor(d?.delta ?? null, maxAbsByMarket[m.key]) }}>
                      {d?.delta == null ? '—' : (
                        <Tooltip content={`Opened ${oStr(d.open)} → now ${oStr(d.current)}`}>
                          <span>{oStr(d.delta)}</span>
                        </Tooltip>
                      )}
                      <BookBadges prices={b.rawProps?.[m.key]} books={booksFor(m.key)} />
                      <PickBadge picks={b.picks[m.key]} label={m.label} />
                    </td>
                  )
                })}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={MARKETS.length + 3} style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>
                {filtersActive && flatBatters.length > 0 ? 'No batters match the current filters.' : 'No opening-line movement captured for this date yet.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {expandedPlayer ? (
        <div className="batter-cost-mobile-backdrop" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget) setExpandedPlayerKey(null)
        }}>
          <section className="batter-cost-mobile-sheet" role="dialog" aria-modal="true" aria-label={`${expandedPlayer.name} market details`}>
            <header className="batter-cost-sheet-header">
              <PlayerAvatar headshot={mlbHeadshot(expandedPlayer.mlb_id)} teamLogo={getTeamLogoUrl(expandedPlayer.team)} size={42} teamAbbr={expandedPlayer.team} name={expandedPlayer.name} />
              <div>
                <strong>{expandedPlayer.name}</strong>
                <span>{expandedPlayer.position} · {expandedPlayer.team} vs. {expandedPlayer.opponentName || expandedPlayer.opponentTeam}</span>
              </div>
              <button type="button" onClick={() => setExpandedPlayerKey(null)} aria-label="Close player details"><X size={17} /></button>
            </header>
            <div className="batter-cost-sheet-summary">
              <div><span>FHR vs. average</span><strong style={pctColor(expandedPlayer.fhr_pct, maxAbsFhrPct)}>{pctStr(expandedPlayer.fhr_pct)}</strong></div>
              <div><span>HR vs. average</span><strong style={pctColor(expandedPlayer.sa_pct, maxAbsSaPct)}>{pctStr(expandedPlayer.sa_pct)}</strong></div>
            </div>
            <div className="batter-cost-sheet-markets">
              {MARKETS.map(market => {
                const movement = expandedPlayer.deltas[market.key]
                const delta = movement?.delta ?? null
                return (
                  <div className="batter-cost-sheet-market" key={market.key}>
                    <span>{market.label}</span>
                    <div><small>Open</small><strong>{oStr(movement?.open ?? null)}</strong></div>
                    <div><small>Current</small><strong>{oStr(movement?.current ?? null)}</strong></div>
                    <div className={delta == null ? '' : delta < 0 ? 'is-shorter' : delta > 0 ? 'is-longer' : 'is-flat'}>
                      {delta == null ? null : delta < 0 ? <TrendingDown size={13} /> : delta > 0 ? <TrendingUp size={13} /> : null}
                      <strong>{delta == null ? '—' : oStr(delta)}</strong>
                    </div>
                  </div>
                )
              })}
            </div>
            <Link className="batter-cost-profile-link" href={`/players/${expandedPlayer.mlb_id}`}>
              Open full player profile <ExternalLink size={14} />
            </Link>
          </section>
        </div>
      ) : null}
      {filtersOpen ? (
        <div className="batter-cost-filter-backdrop" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget) setFiltersOpen(false)
        }}>
          <section className="batter-cost-filter-sheet" role="dialog" aria-modal="true" aria-label="Filter batter markets">
            <header className="batter-cost-filter-sheet-header">
              <div>
                <span>Board filters</span>
                <strong>Refine market movement</strong>
              </div>
              <button type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters"><X size={17} /></button>
            </header>
            <div className="batter-cost-filter-sheet-body">{renderFilterControls()}</div>
            <footer className="batter-cost-filter-sheet-footer">
              <button type="button" className="batter-cost-filter-reset" onClick={resetFilters} disabled={!filtersActive}>Clear all</button>
              <button type="button" className="batter-cost-filter-apply" onClick={() => setFiltersOpen(false)}>
                <Check size={15} /> Show {sorted.length} batters
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      <style>{`
        .batter-cost-player-mobile,.batter-cost-mobile-backdrop,.batter-cost-filter-summary,.batter-cost-filter-backdrop{display:none}
        @media(max-width:640px){
          .batter-cost-filter-panel{display:none!important}
          .batter-cost-filter-summary{display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:8px;border:1px solid var(--border);border-radius:12px;background:var(--surface)}
          .batter-cost-filter-summary>div{display:flex;align-items:center;gap:7px;min-width:0;flex:1;color:var(--text-2)}
          .batter-cost-filter-summary>div>svg{color:var(--accent);flex:0 0 auto}
          .batter-cost-filter-summary span{font-size:11px;font-weight:850;white-space:nowrap}
          .batter-cost-filter-summary small{overflow:hidden;color:var(--text-4);font-size:9px;font-weight:700;text-overflow:ellipsis;white-space:nowrap}
          .batter-cost-filter-summary button{min-height:34px;border-radius:9px;font-size:10px;font-weight:850}
          .batter-cost-filter-clear{padding:0 9px;border:1px solid var(--border);background:transparent;color:var(--text-3)}
          .batter-cost-filter-open{display:flex;align-items:center;gap:6px;padding:0 11px;border:1px solid color-mix(in srgb,var(--accent) 45%,var(--border));background:var(--accent-dim);color:var(--accent)}
          .batter-cost-filter-open b{display:grid;width:18px;height:18px;place-items:center;border-radius:99px;background:var(--accent);color:var(--accent-fg);font-size:9px}
          .batter-cost-table-scroll{overscroll-behavior-x:contain;border-radius:8px!important}
          .batter-cost-table{font-size:12px!important;width:max-content!important;min-width:100%}
          .batter-cost-row>td{padding-top:8px!important;padding-bottom:8px!important}
          .batter-cost-player-cell{width:172px!important;min-width:172px!important;max-width:172px!important;background:var(--bg)!important;outline:none}
          .batter-cost-player-cell:focus-visible{box-shadow:inset 0 0 0 2px var(--accent)!important}
          .batter-cost-player-desktop,.batter-cost-player-position{display:none!important}
          .batter-cost-player-mobile{display:flex;align-items:center;gap:7px;min-height:48px;padding:5px 3px}
          .batter-cost-player-mobile>a{display:flex;flex:0 0 auto}
          .batter-cost-player-copy{display:grid;gap:2px;min-width:0;flex:1;text-align:left}
          .batter-cost-player-copy>span{overflow:hidden;color:var(--text-1);font-size:12px;font-weight:800;line-height:1.2;text-overflow:ellipsis;white-space:nowrap}
          .batter-cost-player-copy>small{overflow:hidden;color:var(--text-3);font-size:9px;font-weight:650;text-overflow:ellipsis;white-space:nowrap}
          .batter-cost-pwr-mobile{flex:0 0 auto;padding:2px 4px;border:1px solid rgba(245,158,11,.4);border-radius:4px;background:rgba(245,158,11,.14);color:#f59e0b;font-size:8px;font-weight:900}
          .batter-cost-expand-indicator{display:grid;place-items:center;width:24px;height:24px;flex:0 0 24px;border:1px solid var(--border);border-radius:7px;background:var(--surface-2);color:var(--accent);font-size:17px;font-weight:700}
          .batter-cost-mobile-backdrop{position:fixed;inset:0;z-index:1400;display:flex;align-items:flex-end;background:rgba(0,0,0,.68);backdrop-filter:blur(5px);overscroll-behavior:contain}
          .batter-cost-mobile-sheet{position:relative;display:flex;flex-direction:column;width:100%;max-height:calc(100dvh - 72px);overflow:hidden;border:1px solid color-mix(in srgb,var(--accent) 30%,var(--border));border-bottom:0;border-radius:18px 18px 0 0;background:color-mix(in srgb,var(--surface) 98%,transparent);box-shadow:0 -18px 60px rgba(0,0,0,.62);padding-bottom:max(14px,env(safe-area-inset-bottom));animation:batter-cost-sheet-in 180ms ease-out}
          .batter-cost-mobile-sheet::before{content:"";position:absolute;top:7px;left:50%;z-index:2;width:38px;height:4px;border-radius:99px;background:var(--text-4);transform:translateX(-50%);opacity:.7}
          .batter-cost-sheet-header{display:flex;align-items:center;gap:10px;padding:20px 14px 12px;border-bottom:1px solid var(--border)}
          .batter-cost-sheet-header>div{display:grid;gap:3px;min-width:0;flex:1}
          .batter-cost-sheet-header strong{overflow:hidden;color:var(--text-1);font-size:15px;text-overflow:ellipsis;white-space:nowrap}
          .batter-cost-sheet-header span{overflow:hidden;color:var(--text-3);font-size:10px;text-overflow:ellipsis;white-space:nowrap}
          .batter-cost-sheet-header button{display:grid;place-items:center;width:36px;height:36px;flex:0 0 36px;border:1px solid var(--border);border-radius:10px;background:var(--surface-2);color:var(--text-2)}
          .batter-cost-sheet-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:12px 14px}
          .batter-cost-sheet-summary>div{display:grid;gap:5px;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--surface-2)}
          .batter-cost-sheet-summary span{color:var(--text-3);font-size:9px;font-weight:750;text-transform:uppercase;letter-spacing:.04em}
          .batter-cost-sheet-summary strong{font-size:16px}
          .batter-cost-sheet-markets{min-height:0;overflow-y:auto;padding:0 14px 12px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
          .batter-cost-sheet-market{display:grid;grid-template-columns:minmax(58px,1fr) repeat(3,minmax(55px,.72fr));align-items:center;gap:7px;padding:9px 2px;border-bottom:1px solid var(--border)}
          .batter-cost-sheet-market>span{color:var(--text-1);font-size:11px;font-weight:850}
          .batter-cost-sheet-market>div{display:grid;gap:2px;text-align:right}
          .batter-cost-sheet-market small{color:var(--text-4);font-size:8px;font-weight:700;text-transform:uppercase}
          .batter-cost-sheet-market strong{color:var(--text-2);font-size:11px}
          .batter-cost-sheet-market>div:last-child{display:flex;align-items:center;justify-content:flex-end;gap:3px}
          .batter-cost-sheet-market .is-shorter,.batter-cost-sheet-market .is-shorter strong{color:#4ade80}
          .batter-cost-sheet-market .is-longer,.batter-cost-sheet-market .is-longer strong{color:#f87171}
          .batter-cost-sheet-market .is-flat,.batter-cost-sheet-market .is-flat strong{color:var(--text-3)}
          .batter-cost-profile-link{display:flex;align-items:center;justify-content:center;gap:6px;min-height:42px;margin:0 14px;border:1px solid var(--accent);border-radius:11px;background:var(--accent-dim);color:var(--accent);font-size:11px;font-weight:900;text-decoration:none}
          .batter-cost-filter-backdrop{position:fixed;inset:0;z-index:1500;display:flex;align-items:flex-end;background:rgba(0,0,0,.72);backdrop-filter:blur(6px);overscroll-behavior:contain}
          .batter-cost-filter-sheet{position:relative;display:flex;width:100%;max-height:calc(100dvh - 58px);flex-direction:column;overflow:hidden;border:1px solid color-mix(in srgb,var(--accent) 30%,var(--border));border-bottom:0;border-radius:20px 20px 0 0;background:var(--surface);box-shadow:0 -20px 70px rgba(0,0,0,.65);padding-bottom:max(8px,env(safe-area-inset-bottom));animation:batter-cost-sheet-in 180ms ease-out}
          .batter-cost-filter-sheet::before{content:"";position:absolute;top:7px;left:50%;width:38px;height:4px;border-radius:99px;background:var(--text-4);transform:translateX(-50%);opacity:.7}
          .batter-cost-filter-sheet-header{display:flex;align-items:center;gap:10px;padding:20px 14px 12px;border-bottom:1px solid var(--border)}
          .batter-cost-filter-sheet-header>div{display:grid;gap:2px;min-width:0;flex:1}
          .batter-cost-filter-sheet-header span{color:var(--accent);font-family:var(--font-mono,monospace);font-size:9px;font-weight:850;letter-spacing:.09em;text-transform:uppercase}
          .batter-cost-filter-sheet-header strong{color:var(--text-1);font-size:15px}
          .batter-cost-filter-sheet-header button{display:grid;width:36px;height:36px;place-items:center;border:1px solid var(--border);border-radius:10px;background:var(--surface-2);color:var(--text-2)}
          .batter-cost-filter-sheet-body{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;min-height:0;overflow-y:auto;padding:14px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
          .batter-cost-filter-sheet-body>div{min-width:0;justify-content:space-between;gap:4px!important;padding:9px;border:1px solid var(--border);border-radius:10px;background:var(--surface-2)}
          .batter-cost-filter-sheet-body>div>span{min-width:42px;font-size:9px!important}
          .batter-cost-filter-sheet-body button{min-width:29px!important;min-height:30px;padding:3px 7px!important}
          .batter-cost-filter-sheet-footer{display:grid;grid-template-columns:minmax(92px,.6fr) minmax(0,1.4fr);gap:8px;padding:10px 14px;border-top:1px solid var(--border);background:var(--surface)}
          .batter-cost-filter-sheet-footer button{display:flex;min-height:44px;align-items:center;justify-content:center;gap:6px;border-radius:11px;font-size:11px;font-weight:900}
          .batter-cost-filter-reset{border:1px solid var(--border);background:var(--surface-2);color:var(--text-2)}
          .batter-cost-filter-reset:disabled{opacity:.45}
          .batter-cost-filter-apply{border:1px solid var(--accent);background:var(--accent);color:var(--accent-fg)}
          @keyframes batter-cost-sheet-in{from{opacity:.5;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
        }
        @media(max-width:370px){.batter-cost-filter-sheet-body{grid-template-columns:1fr}}
        @media(prefers-reduced-motion:reduce){.batter-cost-mobile-sheet,.batter-cost-filter-sheet{animation:none}}
      `}</style>
    </div>
  )
}

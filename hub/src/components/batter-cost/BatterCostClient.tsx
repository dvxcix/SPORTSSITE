'use client'
import { useEffect, useMemo, useState } from 'react'
import { PlayerLink, HandBadge } from '@/components/players/PlayerPageClient'
import { SortableTH, SortState, toggleSortState, cmpNullsLast, cmpAny } from '@/components/pitcher-report/MatchupTables'
import { Tooltip } from '@/components/ui/tooltip-card'
import { normName, resolveNameEntry } from '@/lib/nameNorm'
import { WatchlistStarButton } from '@/components/shared/WatchlistStarButton'
import { PickBadge, BookBadges, oStr } from '@/components/shared/OddsBadges'

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
const MARKET_TO_PIKKIT: Record<string, string> = {
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
  // Community pick count per market (only the 7 keys in MARKET_TO_PIKKIT
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

export function BatterCostClient({ date }: { date: string }) {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  // Keyed by mlb_id+gameKey, not mlb_id alone — a doubleheader batter has
  // two distinct rows sharing an mlb_id, and hover should only ever
  // highlight the one actually under the cursor.
  const [hovered, setHovered] = useState<string | null>(null)
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
  // Dugout's own pikkitMap uses — the one difference is Dugout scopes to a
  // single active game tab (it only ever shows one game at a time), while
  // this page is flat across every game at once, so the map here is keyed
  // by market → game_key too (not just name), and an explicitly-tagged row
  // for a player's real game always wins over an untagged legacy row for
  // that same market at lookup time (same tie-break Dugout applies, just
  // resolved per-row here instead of against one shared active tab).
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

  const picksFor = (nameNorm: string, gameKey: string): Record<string, number | null> => {
    const entry = resolveNameEntry(pikkitMap, nameNorm)
    const out: Record<string, number | null> = {}
    for (const [mktKey, prop] of Object.entries(MARKET_TO_PIKKIT)) {
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
  }, [data, fhrAvgMap, saAvgMap, pikkitMap, date])

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

  if (error) return <div style={{ padding: 24, color: 'var(--red)', fontSize: 13 }}>{error}</div>
  if (!data) return <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13 }}>Loading today&apos;s odds…</div>

  return (
    <div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16,
        padding: '10px 12px', marginBottom: 12,
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
      }}>
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
        {filtersActive && (
          <button
            onClick={resetFilters}
            style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}
          >
            Clear filters
          </button>
        )}
      </div>
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
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
                onMouseEnter={() => setHovered(`${b.mlb_id}_${b.gameKey}`)}
                onMouseLeave={() => setHovered(null)}
              >
                <td
                  className="w-[130px] min-w-[130px] max-w-[130px] sm:w-[156px] sm:min-w-[156px] sm:max-w-[156px]"
                  style={{
                    padding: '6px 6px', position: 'sticky', left: 0, zIndex: 2,
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', rowGap: 2 }}>
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
                  {/* Opposing-pitcher info (name/hand/avatar) was dropped
                      from this card — this page is about batters, and that
                      extra content made an already-tall row taller and more
                      variable-height still, worsening the sticky-column
                      row-desync issue on mobile. Pitcher matchup detail
                      still lives on Dugout/Pitcher Report. */}
                  <div style={{ marginTop: 3, marginLeft: 27, fontSize: 9, color: 'var(--text-3)' }}>
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
    </div>
  )
}

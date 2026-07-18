'use client'
import { useEffect, useMemo, useState } from 'react'
import { PlayerLink, HandBadge } from '@/components/players/PlayerPageClient'
import { SortableTH, SortState, toggleSortState, cmpNullsLast, cmpAny } from '@/components/pitcher-report/MatchupTables'
import { Tooltip } from '@/components/ui/tooltip-card'
import { normName } from '@/lib/nameNorm'
import { WatchlistStarButton } from '@/components/shared/WatchlistStarButton'

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

type MarketDelta = { current: number | null; open: number | null; delta: number | null }
type FlatBatter = {
  mlb_id: number; gameKey: string; gamePk: number | null; gameDate: string | null
  name: string; team: string; bats: string; position: string
  opponentId: number | null; opponentName: string; opponentHand: string; opponentTeam: string
  fhr_pct: number | null; sa_pct: number | null
  deltas: Record<string, MarketDelta>
}

const oStr = (v: number | null) => v == null ? '—' : (v > 0 ? `+${v}` : String(v))
const pctStr = (v: number | null) => v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`

// FHR%/HR% are computed ratios that essentially never land on exactly
// zero, so their filter only offers +/−. The FHR/HR delta columns are
// whole odds points (current − open) that legitimately land on exactly 0
// often (a line that hasn't moved since opening at all), so those also
// get a "flat" option.
type SignFilter = 'all' | 'pos' | 'neg'
type DeltaFilter = SignFilter | 'flat'
const matchesSign = (v: number | null, f: SignFilter) => {
  if (f === 'all') return true
  if (v == null) return false
  return f === 'pos' ? v > 0 : v < 0
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
  const [fhrPctFilter, setFhrPctFilter] = useState<SignFilter>('all')
  const [saPctFilter, setSaPctFilter] = useState<SignFilter>('all')
  const [deltaFilters, setDeltaFilters] = useState<Record<string, DeltaFilter>>({})
  const getDeltaFilter = (key: string): DeltaFilter => deltaFilters[key] ?? 'all'
  const setDeltaFilter = (key: string, v: DeltaFilter) => setDeltaFilters(prev => ({ ...prev, [key]: v }))
  const filtersActive = fhrPctFilter !== 'all' || saPctFilter !== 'all' || Object.values(deltaFilters).some(v => v && v !== 'all')
  const resetFilters = () => { setFhrPctFilter('all'); setSaPctFilter('all'); setDeltaFilters({}) }

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
          fhr_pct, sa_pct, deltas,
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
      const gameDate = g.gameDate ? String(g.gameDate).slice(0, 10) : null
      addSide(g.homeLineup, g.awayPitcher, g.awayAbbr, g.gameKey, gamePk, gameDate)
      addSide(g.awayLineup, g.homePitcher, g.homeAbbr, g.gameKey, gamePk, gameDate)
    }
    return out
  }, [data, fhrAvgMap, saAvgMap])

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
    matchesSign(b.fhr_pct, fhrPctFilter) &&
    matchesSign(b.sa_pct, saPctFilter) &&
    MARKETS.every(m => matchesDelta(b.deltas[m.key]?.delta ?? null, getDeltaFilter(m.key)))
  ), [flatBatters, fhrPctFilter, saPctFilter, deltaFilters])

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
          { key: 'all', label: 'All' }, { key: 'pos', label: '+' }, { key: 'neg', label: '−' },
        ]} />
        <FilterGroup label="HR%" value={saPctFilter} onChange={setSaPctFilter} options={[
          { key: 'all', label: 'All' }, { key: 'pos', label: '+' }, { key: 'neg', label: '−' },
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
              <SortableTH label="FHR%" colKey="fhr_pct" sort={sort} onSort={onSort} />
              <SortableTH label="HR%" colKey="sa_pct" sort={sort} onSort={onSort} />
              {MARKETS.map(m => <SortableTH key={m.key} label={m.label} colKey={m.key} sort={sort} onSort={onSort} />)}
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
                  style={{
                    padding: '6px 8px', position: 'sticky', left: 0, zIndex: 2, minWidth: 200,
                    backgroundColor: 'var(--bg)',
                    backgroundImage: hovered === `${b.mlb_id}_${b.gameKey}` ? 'linear-gradient(rgba(255,255,255,0.025), rgba(255,255,255,0.025))' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <HandBadge hand={b.bats} />
                    <PlayerLink mlbId={b.mlb_id} name={b.name} teamAbbr={b.team} size={26} />
                    <WatchlistStarButton
                      mlbId={b.mlb_id} name={b.name} team={b.team} position={b.position} bats={b.bats}
                      gameInfo={{ sport: 'MLB', game_pk: b.gamePk != null ? String(b.gamePk) : null, game_date: b.gameDate }}
                      odds={b.deltas.sa?.current ?? null}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3, marginLeft: 32 }}>
                    <span style={{ fontSize: 9, color: 'var(--text-3)' }}>{b.position} · vs</span>
                    {b.opponentId ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <HandBadge hand={b.opponentHand} />
                        <PlayerLink mlbId={b.opponentId} name={b.opponentName} teamAbbr={b.opponentTeam} size={16} />
                      </span>
                    ) : <span style={{ fontSize: 9, color: 'var(--text-3)' }}>—</span>}
                  </div>
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap', ...pctColor(b.fhr_pct, maxAbsFhrPct) }}>
                  {pctStr(b.fhr_pct)}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap', ...pctColor(b.sa_pct, maxAbsSaPct) }}>
                  {pctStr(b.sa_pct)}
                </td>
                {MARKETS.map(m => {
                  const d = b.deltas[m.key]
                  return (
                    <td key={m.key} style={{ padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap', ...deltaColor(d?.delta ?? null, maxAbsByMarket[m.key]) }}>
                      {d?.delta == null ? '—' : (
                        <Tooltip content={`Opened ${oStr(d.open)} → now ${oStr(d.current)}`}>
                          <span>{oStr(d.delta)}</span>
                        </Tooltip>
                      )}
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

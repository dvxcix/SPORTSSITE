'use client'
import { useEffect, useMemo, useState } from 'react'
import { PlayerLink, HandBadge } from '@/components/players/PlayerPageClient'
import { SortableTH, SortState, toggleSortState, cmpNullsLast, cmpAny } from '@/components/pitcher-report/MatchupTables'
import { Tooltip } from '@/components/ui/tooltip-card'

// Every market that carries an opening-line baseline (see dugout/data/
// route.ts's entry.open merge) — current value lives on the vendor-keyed
// BDL/FD field, open lives on the matching open.*Fd/open.*Mgm key. Every
// market here shares the same sign convention: a NEGATIVE delta means the
// price got shorter since opening (more likely per the book = real
// conviction), same "negative = green/hot" rule DugoutClient's own
// fhr_pct/sa_pct shading uses — including combo1/combo2, where a lower
// price is the same "cheapest pairing = strongest conviction" signal.
const MARKETS: { key: string; label: string; current: (p: any) => number | null; open: (p: any) => number | null }[] = [
  { key: 'fhr',      label: 'FHR',        current: p => p?.fhr?.fanduel ?? null,      open: p => p?.open?.fhr ?? null },
  { key: 'sa',       label: 'HR',         current: p => p?.sa?.fanduel ?? null,       open: p => p?.open?.saFd ?? null },
  { key: 'hr2',      label: 'HR 2+',      current: p => p?.hr2?.fanduel ?? null,      open: p => p?.open?.hr2Fd ?? null },
  { key: 'singles',  label: '1B',         current: p => p?.singles?.fanduel ?? null,  open: p => p?.open?.sngFd ?? null },
  { key: 'doubles',  label: '2B',         current: p => p?.doubles?.fanduel ?? null,  open: p => p?.open?.dblFd ?? null },
  { key: 'triples',  label: '3B',         current: p => p?.triples?.fanduel ?? null,  open: p => p?.open?.triFd ?? null },
  { key: 'rbi',      label: 'RBI',        current: p => p?.rbi?.fanduel ?? null,      open: p => p?.open?.rbiFd ?? null },
  { key: 'rbi2',     label: 'RBI 2+',     current: p => p?.rbi2?.fanduel ?? null,     open: p => p?.open?.rbi2Fd ?? null },
  { key: 'rbi3',     label: 'RBI 3+',     current: p => p?.rbi3?.fanduel ?? null,     open: p => p?.open?.rbi3Fd ?? null },
  { key: 'tb',       label: 'TB 2+',      current: p => p?.tb?.fanduel ?? null,       open: p => p?.open?.tbFd ?? null },
  { key: 'tb3',      label: 'TB 3+',      current: p => p?.tb3?.fanduel ?? null,      open: p => p?.open?.tb3Fd ?? null },
  { key: 'tb4',      label: 'TB 4+',      current: p => p?.tb4?.fanduel ?? null,      open: p => p?.open?.tb4Fd ?? null },
  { key: 'tb5',      label: 'TB 5+',      current: p => p?.tb5?.fanduel ?? null,      open: p => p?.open?.tb5Fd ?? null },
  { key: 'hrr',      label: 'HRR',        current: p => p?.hrr?.fanduel ?? null,      open: p => p?.open?.hrrFd ?? null },
  { key: 'laser105', label: 'LSR 105',    current: p => p?.laser105?.fanduel ?? null, open: p => p?.open?.laser105 ?? null },
  { key: 'laser110', label: 'LSR 110',    current: p => p?.laser110?.fanduel ?? null, open: p => p?.open?.laser110 ?? null },
  { key: 'moonshot', label: 'MOON',       current: p => p?.moonshot?.fanduel ?? null, open: p => p?.open?.moonshot ?? null },
  { key: 'pa1',      label: 'PA1',        current: p => p?.pa1?.fanduel ?? null,      open: p => p?.open?.pa1 ?? null },
  { key: 'hrMl',     label: 'HR/ML',      current: p => p?.hrMl?.fanduel ?? null,     open: p => p?.open?.hrMl ?? null },
  { key: 'combo1',   label: 'COMBO 1',    current: p => p?.combo1Min ?? null,         open: p => p?.open?.combo1Min ?? null },
  { key: 'combo2',   label: 'COMBO 2',    current: p => p?.combo2Min ?? null,         open: p => p?.open?.combo2Min ?? null },
  { key: 'saMgm',    label: 'HR (MGM)',   current: p => p?.sa?.betmgm ?? null,        open: p => p?.open?.saMgm ?? null },
  { key: 'hr2Mgm',   label: 'HR 2+ (MGM)', current: p => p?.hr2?.betmgm ?? null,      open: p => p?.open?.hr2Mgm ?? null },
]

type MarketDelta = { current: number | null; open: number | null; delta: number | null }
type FlatBatter = {
  mlb_id: number; name: string; team: string; bats: string; position: string
  opponentName: string; opponentHand: string
  deltas: Record<string, MarketDelta>
}

const oStr = (v: number | null) => v == null ? '—' : (v > 0 ? `+${v}` : String(v))

function deltaColor(delta: number | null, maxAbs: number): React.CSSProperties {
  if (delta == null) return { color: 'var(--text-3)' }
  if (Math.abs(delta) < 3) return { color: 'var(--text-2)', fontWeight: 600 }
  const intensity = maxAbs > 0 ? Math.min(Math.abs(delta) / maxAbs, 1) : 0
  const alpha = 0.55 + intensity * 0.45
  return { color: delta < 0 ? `rgba(74,222,128,${alpha})` : `rgba(248,113,113,${alpha})`, fontWeight: 700 }
}

export function BatterCostClient({ date }: { date: string }) {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const [sort, setSort] = useState<SortState>({ col: 'fhr', dir: 'asc' })

  useEffect(() => {
    let cancelled = false
    setData(null); setError(null)
    fetch(`/api/dugout/data?date=${date}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setError('Failed to load today\'s odds') })
    return () => { cancelled = true }
  }, [date])

  const flatBatters: FlatBatter[] = useMemo(() => {
    if (!data?.games) return []
    const out: FlatBatter[] = []
    const addSide = (lineup: any[], opponentPitcher: any) => {
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
        if (!hasAny) continue
        out.push({
          mlb_id: p.mlb_id, name: p.name, team: p.team, bats: p.bats, position: p.position,
          opponentName: opponentPitcher?.name ?? '', opponentHand: opponentPitcher?.hand ?? '',
          deltas,
        })
      }
    }
    for (const g of data.games) {
      addSide(g.homeLineup, g.awayPitcher)
      addSide(g.awayLineup, g.homePitcher)
    }
    return out
  }, [data])

  const maxAbsByMarket = useMemo(() => {
    const m: Record<string, number> = {}
    for (const mkt of MARKETS) {
      const vals = flatBatters.map(b => b.deltas[mkt.key]?.delta).filter((x): x is number => x != null).map(Math.abs)
      m[mkt.key] = vals.length ? Math.max(...vals) : 0
    }
    return m
  }, [flatBatters])

  const onSort = (col: string) => setSort(prev => toggleSortState(prev, col))

  const sorted = useMemo(() => {
    if (!sort) return flatBatters
    return [...flatBatters].sort((a, b) => {
      if (sort.col === 'name') return cmpAny(a.name, b.name, sort.dir)
      return cmpNullsLast(a.deltas[sort.col]?.delta ?? null, b.deltas[sort.col]?.delta ?? null, sort.dir)
    })
  }, [flatBatters, sort])

  if (error) return <div style={{ padding: 24, color: 'var(--red)', fontSize: 13 }}>{error}</div>
  if (!data) return <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13 }}>Loading today&apos;s odds…</div>

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10 }}>
        {sorted.length} batter{sorted.length === 1 ? '' : 's'} with at least one market that has moved since opening.
        Negative (green) = price shortened since opening — book conviction. Click any column to sort by it.
      </div>
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
            <tr>
              <SortableTH label="Batter" colKey="name" sort={sort} onSort={onSort} align="left" />
              {MARKETS.map(m => <SortableTH key={m.key} label={m.label} colKey={m.key} sort={sort} onSort={onSort} />)}
            </tr>
          </thead>
          <tbody>
            {sorted.map(b => (
              <tr
                key={b.mlb_id}
                onMouseEnter={() => setHovered(b.mlb_id)}
                onMouseLeave={() => setHovered(null)}
              >
                <td
                  style={{
                    padding: '6px 8px', position: 'sticky', left: 0, zIndex: 2, minWidth: 200,
                    backgroundColor: 'var(--bg)',
                    backgroundImage: hovered === b.mlb_id ? 'linear-gradient(rgba(255,255,255,0.025), rgba(255,255,255,0.025))' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <HandBadge hand={b.bats} />
                    <PlayerLink mlbId={b.mlb_id} name={b.name} teamAbbr={b.team} size={26} />
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2, marginLeft: 32 }}>
                    {b.position} · vs {b.opponentHand ? `${b.opponentHand}HP ` : ''}{b.opponentName || '—'}
                  </div>
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
              <tr><td colSpan={MARKETS.length + 1} style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>No opening-line movement captured for this date yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

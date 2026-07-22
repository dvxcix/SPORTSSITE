'use client'

import { useEffect, useState } from 'react'
import { heat } from '@/components/pitcher-report/MatchupTables'
import { computeStatLine, lastNGameDates, type PitchLogRow } from '@/lib/batterStatsEngine'
import { fetchPitchLogCached } from '@/components/dugout/MatchupPitchBreakdown'

const r3 = (v: number | null) => (v == null ? '—' : v.toFixed(3).replace(/^0\./, '.').replace(/^-0\./, '-.'))

// Real last-N-games-played form (any pitcher, any pitch type) + a real
// season platoon split vs whichever hand tonight's pitcher throws — computed
// live off the batter's own full pitch log (same fetch/cache
// MatchupPitchBreakdown already uses for this batter, so this never costs a
// second network request), not a separate pre-aggregated table.
export function RecentFormSplits({ batterId, pitcherHand }: { batterId: number; pitcherHand: 'R' | 'L' }) {
  const [batterRows, setBatterRows] = useState<PitchLogRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setBatterRows(null)
    fetchPitchLogCached(batterId).then(d => { if (!cancelled) setBatterRows(d.batterRows ?? []) })
    return () => { cancelled = true }
  }, [batterId])

  if (!batterRows || batterRows.length === 0) return null

  const windowRows = (n: number) => {
    const dates = lastNGameDates(batterRows, n)
    return batterRows.filter(r => dates.has(r.game_date))
  }

  const l5 = computeStatLine(windowRows(5))
  const l10 = computeStatLine(windowRows(10))
  const platoon = computeStatLine(batterRows.filter(r => r.p_throws === pitcherHand))

  const rows = [
    l5.games > 0 && { label: `L5 (${l5.games}g)`, avg: l5.avg, ops: (l5.obp ?? 0) + (l5.slg ?? 0), hr: l5.hr, bb: l5.bb, so: l5.k },
    l10.games > 0 && { label: `L10 (${l10.games}g)`, avg: l10.avg, ops: (l10.obp ?? 0) + (l10.slg ?? 0), hr: l10.hr, bb: l10.bb, so: l10.k },
    platoon.games > 0 && { label: `vs ${pitcherHand}HP (szn)`, avg: platoon.avg, ops: (platoon.obp ?? 0) + (platoon.slg ?? 0), hr: platoon.hr, bb: platoon.bb, so: platoon.k },
  ].filter(Boolean) as { label: string; avg: number | null; ops: number; hr: number; bb: number; so: number }[]

  if (rows.length === 0) return null

  const avgPool = rows.map(r => r.avg)
  const opsPool = rows.map(r => r.ops)
  const hrPool = rows.map(r => r.hr)
  const bbPool = rows.map(r => r.bb)
  const soPool = rows.map(r => r.so)

  return (
    <div style={{ minWidth: 260, marginTop: 14 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 6 }}>
        RECENT FORM &amp; SPLITS
      </div>
      <div style={{ overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-3)', fontWeight: 700, whiteSpace: 'nowrap' }}>WINDOW</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-3)', fontWeight: 700 }}>AVG</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-3)', fontWeight: 700 }}>OPS</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-3)', fontWeight: 700 }}>HR</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-3)', fontWeight: 700 }}>BB</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-3)', fontWeight: 700 }}>SO</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 8px', fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{r.label}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', ...heat(r.avg, avgPool, 'hi') }}>{r3(r.avg)}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', ...heat(r.ops, opsPool, 'hi') }}>{r3(r.ops)}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', ...heat(r.hr, hrPool, 'hi') }}>{r.hr}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', ...heat(r.bb, bbPool, 'hi') }}>{r.bb}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', ...heat(r.so, soPool, 'lo') }}>{r.so}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

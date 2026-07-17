'use client'

import { useState } from 'react'
import { pitchColor, pitchLabel } from '@/lib/mlb-api'
import { SortableTH, SortState, toggleSortState, cmpNullsLast, cmpAny } from '@/components/pitcher-report/MatchupTables'
import type { PitchLogRow } from '@/lib/batterStatsEngine'

function resultColor(row: PitchLogRow): string {
  const key = row.events || ''
  if (key === 'home_run') return 'var(--green)'
  if (key === 'double' || key === 'triple') return '#60a5fa'
  if (key === 'single') return 'var(--accent)'
  if (key === 'walk' || key === 'intent_walk' || key === 'hit_by_pitch') return 'var(--gold)'
  if (key.includes('strikeout')) return 'var(--red)'
  if (row.is_whiff) return 'var(--red)'
  if (row.is_in_play) return 'var(--text-1)'
  return 'var(--text-3)'
}
function describeRow(row: PitchLogRow): string {
  const s = row.events || row.description || '—'
  return s.replace(/_/g, ' ')
}

// The actual underlying pitches behind whatever aggregate stat line/zone
// grid is currently showing — same filtered row set, just unaggregated, so
// "why is this cell green" always has a real answer one click away.
export function PitchList({ rows, maxHeight = 280 }: { rows: PitchLogRow[]; maxHeight?: number }) {
  const [sort, setSort] = useState<SortState>({ col: 'game_date', dir: 'desc' })
  const onSort = (col: string) => setSort(prev => toggleSortState(prev, col))
  const activeSort = sort ?? { col: 'game_date', dir: 'desc' as const }

  if (!rows.length) return <div style={{ fontSize: 12, color: 'var(--text-3)' }}>No individual pitches match the current filters.</div>

  const sorted = [...rows].sort((a, b) => {
    if (activeSort.col === 'game_date') {
      const cmp = cmpAny(a.game_date, b.game_date, activeSort.dir)
      return cmp !== 0 ? cmp : cmpNullsLast(a.inning, b.inning, activeSort.dir)
    }
    if (activeSort.col === 'pitch_type') return cmpAny(pitchLabel(a.pitch_type || ''), pitchLabel(b.pitch_type || ''), activeSort.dir)
    if (activeSort.col === 'result') return cmpAny(describeRow(a), describeRow(b), activeSort.dir)
    return cmpNullsLast((a as any)[activeSort.col], (b as any)[activeSort.col], activeSort.dir)
  })

  return (
    <div style={{ maxHeight, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
          <tr>
            <SortableTH label="Date" colKey="game_date" sort={sort} onSort={onSort} align="left" />
            <SortableTH label="Pitch" colKey="pitch_type" sort={sort} onSort={onSort} align="left" />
            <SortableTH label="Velo" colKey="velocity" sort={sort} onSort={onSort} />
            <SortableTH label="Inn" colKey="inning" sort={sort} onSort={onSort} />
            <th style={{ padding: '5px 8px', color: 'var(--text-3)', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap' }}>Count</th>
            <SortableTH label="Zone" colKey="zone" sort={sort} onSort={onSort} />
            <SortableTH label="Result" colKey="result" sort={sort} onSort={onSort} align="left" />
            <SortableTH label="EV" colKey="launch_speed" sort={sort} onSort={onSort} />
            <SortableTH label="RV" colKey="run_value" sort={sort} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '4px 8px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{r.game_date}</td>
              <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: pitchColor(r.pitch_type || ''), flexShrink: 0 }} />
                  {r.pitch_type ? pitchLabel(r.pitch_type) : '—'}
                </span>
              </td>
              <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-1)' }}>{r.velocity != null ? r.velocity.toFixed(1) : '—'}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-2)' }}>{r.inning ?? '—'}</td>
              <td style={{ padding: '4px 8px', textAlign: 'center', color: 'var(--text-2)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{r.balls ?? '?'}-{r.strikes ?? '?'}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-2)' }}>{r.zone ?? '—'}</td>
              <td style={{ padding: '4px 8px', textTransform: 'capitalize', color: resultColor(r), fontWeight: 600, whiteSpace: 'nowrap' }}>{describeRow(r)}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-1)' }}>{r.launch_speed != null ? r.launch_speed.toFixed(1) : '—'}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', color: (r.run_value ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>{r.run_value != null ? r.run_value.toFixed(2) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

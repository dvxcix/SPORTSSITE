'use client'

import { useState } from 'react'
import { pitchColor, pitchLabel } from '@/lib/mlb-api'
import { SortableTH, SortState, toggleSortState, cmpNullsLast, cmpAny } from '@/components/pitcher-report/MatchupTables'
import { PlayerLink, ToggleBtn } from '@/components/players/PlayerPageClient'
import type { PitchLogRow } from '@/lib/batterStatsEngine'

const OUT_EVENTS = new Set(['field_out', 'force_out', 'fielders_choice_out', 'grounded_into_double_play', 'double_play', 'triple_play'])

// One row can legitimately match several of these at once (a double is
// both "In Play" and "Double") — checkboxes are OR'd together, not
// mutually-exclusive buckets, same as a tag filter. Only the ones that
// actually have a match get offered as a checkbox (built fresh per call
// against whatever rows/scope is currently in view).
const RESULT_FILTERS: { key: string; label: string; test: (r: PitchLogRow) => boolean }[] = [
  { key: 'in_play', label: 'In Play', test: r => r.is_in_play },
  { key: 'home_run', label: 'Home Run', test: r => r.events === 'home_run' },
  { key: 'triple', label: 'Triple', test: r => r.events === 'triple' },
  { key: 'double', label: 'Double', test: r => r.events === 'double' },
  { key: 'single', label: 'Single', test: r => r.events === 'single' },
  { key: 'walk', label: 'Walk', test: r => r.events === 'walk' || r.events === 'intent_walk' },
  { key: 'hbp', label: 'Hit By Pitch', test: r => r.events === 'hit_by_pitch' },
  { key: 'strikeout', label: 'Strikeout', test: r => !!r.events?.includes('strikeout') },
  { key: 'flyout', label: 'Flyout', test: r => !!r.events && OUT_EVENTS.has(r.events) && r.bb_type === 'fly_ball' },
  { key: 'groundout', label: 'Groundout', test: r => !!r.events && OUT_EVENTS.has(r.events) && r.bb_type === 'ground_ball' },
  { key: 'lineout', label: 'Lineout', test: r => !!r.events && OUT_EVENTS.has(r.events) && r.bb_type === 'line_drive' },
  { key: 'popout', label: 'Popout', test: r => !!r.events && OUT_EVENTS.has(r.events) && r.bb_type === 'popup' },
  { key: 'sac_fly', label: 'Sac Fly', test: r => r.events === 'sac_fly' || r.events === 'sac_fly_double_play' },
  { key: 'fielders_choice', label: "Fielder's Choice", test: r => !!r.events?.startsWith('fielders_choice') },
  { key: 'error', label: 'Error', test: r => r.events === 'field_error' },
  { key: 'foul', label: 'Foul', test: r => r.description === 'foul' },
  { key: 'swinging_strike', label: 'Swinging Strike', test: r => r.is_whiff && !r.is_in_play },
  { key: 'called_strike', label: 'Called Strike', test: r => r.description === 'called_strike' },
  { key: 'ball', label: 'Ball', test: r => r.description === 'ball' || r.description === 'blocked_ball' },
]

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
const n2 = (v: number | null | undefined, digits = 1) => (v == null ? '—' : v.toFixed(digits))

// The actual underlying pitches behind whatever aggregate stat line/zone
// grid is currently showing — same filtered row set, just unaggregated, so
// "why is this cell green" always has a real answer one click away.
export function PitchList({ rows, maxHeight = 280 }: { rows: PitchLogRow[]; maxHeight?: number }) {
  const [sort, setSort] = useState<SortState>({ col: 'game_date', dir: 'desc' })
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set())
  const onSort = (col: string) => setSort(prev => toggleSortState(prev, col))
  const activeSort = sort ?? { col: 'game_date', dir: 'desc' as const }

  if (!rows.length) return <div style={{ fontSize: 12, color: 'var(--text-3)' }}>No individual pitches match the current filters.</div>

  // "Pitcher" vs "Batter" — whichever role these rows AREN'T (opponent_id
  // always carries the guy on the other side of the matchup; a batter's own
  // rows have opponent_id === pitcher_id, a pitcher's own rows have
  // opponent_id === batter_id), so the same component/column works for
  // either without needing a prop to say which page it's on.
  const opponentLabel = rows[0].opponent_id === rows[0].pitcher_id ? 'Pitcher' : 'Batter'

  const availableFilters = RESULT_FILTERS.map(f => ({ ...f, count: rows.filter(f.test).length })).filter(f => f.count > 0)
  function toggleFilter(key: string) {
    setActiveFilters(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }
  const filtered = activeFilters.size === 0
    ? rows
    : rows.filter(r => availableFilters.some(f => activeFilters.has(f.key) && f.test(r)))

  const sorted = [...filtered].sort((a, b) => {
    if (activeSort.col === 'game_date') {
      const cmp = cmpAny(a.game_date, b.game_date, activeSort.dir)
      return cmp !== 0 ? cmp : cmpNullsLast(a.inning, b.inning, activeSort.dir)
    }
    if (activeSort.col === 'pitch_type') return cmpAny(pitchLabel(a.pitch_type || ''), pitchLabel(b.pitch_type || ''), activeSort.dir)
    if (activeSort.col === 'result') return cmpAny(describeRow(a), describeRow(b), activeSort.dir)
    if (activeSort.col === 'opponent_name') return cmpAny(a.opponent_name, b.opponent_name, activeSort.dir)
    return cmpNullsLast((a as any)[activeSort.col], (b as any)[activeSort.col], activeSort.dir)
  })

  return (
    <div>
      {availableFilters.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
          {availableFilters.map(f => (
            <ToggleBtn key={f.key} active={activeFilters.has(f.key)} onClick={() => toggleFilter(f.key)}>
              {f.label} <span style={{ opacity: 0.65 }}>{f.count}</span>
            </ToggleBtn>
          ))}
          {activeFilters.size > 0 && (
            <button
              onClick={() => setActiveFilters(new Set())}
              style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}
            >
              Clear
            </button>
          )}
        </div>
      )}
      <div style={{ maxHeight, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
            <tr>
              <SortableTH label="Date" colKey="game_date" sort={sort} onSort={onSort} align="left" />
              <SortableTH label={opponentLabel} colKey="opponent_name" sort={sort} onSort={onSort} align="left" />
              <SortableTH label="Pitch" colKey="pitch_type" sort={sort} onSort={onSort} align="left" />
              <SortableTH label="Velo" colKey="velocity" sort={sort} onSort={onSort} />
              <SortableTH label="Spin" colKey="spin_rate" sort={sort} onSort={onSort} />
              <SortableTH label="Inn" colKey="inning" sort={sort} onSort={onSort} />
              <th style={{ padding: '5px 8px', color: 'var(--text-3)', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap' }}>Count</th>
              <SortableTH label="Zone" colKey="zone" sort={sort} onSort={onSort} />
              <SortableTH label="Result" colKey="result" sort={sort} onSort={onSort} align="left" />
              <SortableTH label="EV" colKey="launch_speed" sort={sort} onSort={onSort} />
              <SortableTH label="LA" colKey="launch_angle" sort={sort} onSort={onSort} />
              <SortableTH label="Dist" colKey="hit_distance" sort={sort} onSort={onSort} />
              <SortableTH label="xwOBA" colKey="xwoba" sort={sort} onSort={onSort} />
              <SortableTH label="Bat Speed" colKey="bat_speed" sort={sort} onSort={onSort} />
              <SortableTH label="RV" colKey="run_value" sort={sort} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '4px 8px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{r.game_date}</td>
                <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                  <PlayerLink mlbId={r.opponent_id} name={r.opponent_name} teamAbbr={r.opponent_team} size={18} />
                </td>
                <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: pitchColor(r.pitch_type || ''), flexShrink: 0 }} />
                    {r.pitch_type ? pitchLabel(r.pitch_type) : '—'}
                  </span>
                </td>
                <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-1)' }}>{r.velocity != null ? r.velocity.toFixed(1) : '—'}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-2)' }}>{r.spin_rate != null ? Math.round(r.spin_rate) : '—'}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-2)' }}>{r.inning ?? '—'}</td>
                <td style={{ padding: '4px 8px', textAlign: 'center', color: 'var(--text-2)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{r.balls ?? '?'}-{r.strikes ?? '?'}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-2)' }}>{r.zone ?? '—'}</td>
                <td style={{ padding: '4px 8px', textTransform: 'capitalize', color: resultColor(r), fontWeight: 600, whiteSpace: 'nowrap' }}>{describeRow(r)}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-1)' }}>{r.launch_speed != null ? r.launch_speed.toFixed(1) : '—'}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-2)' }}>{r.launch_angle != null ? Math.round(r.launch_angle) : '—'}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-2)' }}>{r.hit_distance != null ? Math.round(r.hit_distance) : '—'}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-2)' }}>{n2(r.xwoba, 3)}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-2)' }}>{r.bat_speed != null ? r.bat_speed.toFixed(1) : '—'}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', color: (r.run_value ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>{r.run_value != null ? r.run_value.toFixed(2) : '—'}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={14} style={{ padding: '12px 8px', color: 'var(--text-3)', textAlign: 'center' }}>No pitches match the selected filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

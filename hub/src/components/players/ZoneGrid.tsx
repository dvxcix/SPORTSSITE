'use client'

import { heat } from '@/components/pitcher-report/MatchupTables'
import type { PitchLogRow } from '@/lib/batterStatsEngine'

// Savant's own 1-9 zone codes, laid out as the standard broadcast strike-
// zone-plot grid (catcher's-eye view of the plate): row-major top-left to
// bottom-right. 11-14 are the four outside "chase" corners. Shared by every
// zone-grid consumer (player page's PitchZoneHeatmap, Slate Breakdown) so
// the layout convention never drifts between them.
export const CORE_ZONES = [1, 2, 3, 4, 5, 6, 7, 8, 9]
export const CHASE_ZONES = [11, 12, 13, 14]

export type ZoneMetricKey = 'run_value' | 'whiff_pct' | 'hard_hit_pct'
// dir here is always from the PITCHER's perspective (a very negative run
// value, a high whiff%, or a low hard-hit% are all good for the pitcher) —
// callers rendering a batter's own zone grid pass the inverted `dir` at the
// call site (ZoneGrid itself just colors whatever dir it's given).
export const ZONE_METRICS: { key: ZoneMetricKey; label: string; dir: 'hi' | 'lo' }[] = [
  { key: 'run_value', label: 'Run Value', dir: 'lo' },
  { key: 'whiff_pct', label: 'Whiff %', dir: 'hi' },
  { key: 'hard_hit_pct', label: 'Hard-Hit %', dir: 'lo' },
]

export function zoneCellStats(rows: PitchLogRow[]) {
  const count = rows.length
  const rv = rows.map(r => r.run_value).filter((v): v is number => v != null)
  const swings = rows.filter(r => r.is_swing)
  const whiffs = rows.filter(r => r.is_whiff)
  const inPlay = rows.filter(r => r.is_in_play && r.launch_speed != null)
  const hardHit = inPlay.filter(r => (r.launch_speed as number) >= 95)
  return {
    count,
    run_value: rv.length ? rv.reduce((a, b) => a + b, 0) / rv.length : null,
    whiff_pct: swings.length ? (whiffs.length / swings.length) * 100 : null,
    hard_hit_pct: inPlay.length ? (hardHit.length / inPlay.length) * 100 : null,
  } as Record<ZoneMetricKey | 'count', number | null>
}

export function binByZone(rows: PitchLogRow[]): Map<number, PitchLogRow[]> {
  const m = new Map<number, PitchLogRow[]>()
  for (const r of rows) {
    if (r.zone == null) continue
    const list = m.get(r.zone)
    if (list) list.push(r); else m.set(r.zone, [r])
  }
  return m
}

function fmt(v: number | null, key: ZoneMetricKey): string {
  if (v == null) return '—'
  return key === 'run_value' ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}` : `${v.toFixed(1)}%`
}

// The 3x3 zone grid itself — pure presentation, takes already-filtered rows
// and a metric/dir to color by. Reused by the player page's zone card and
// Slate Breakdown's pitcher/batter panels so the grid never has to be
// rebuilt per surface.
export function ZoneGrid({ rows, metric, dir, cellSize = 68 }: {
  rows: PitchLogRow[]; metric: ZoneMetricKey; dir: 'hi' | 'lo'; cellSize?: number
}) {
  const byZone = binByZone(rows)
  const cellByZone = new Map<number, ReturnType<typeof zoneCellStats>>()
  for (const z of CORE_ZONES) cellByZone.set(z, zoneCellStats(byZone.get(z) ?? []))
  const coreValues = CORE_ZONES.map(z => cellByZone.get(z)![metric])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(3, ${cellSize}px)`, gridTemplateRows: `repeat(3, ${cellSize}px)`, gap: 3 }}>
      {CORE_ZONES.map(z => {
        const c = cellByZone.get(z)!
        const v = c[metric]
        return (
          <div
            key={z}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)',
              ...heat(v, coreValues, dir),
            }}
          >
            <span style={{ fontSize: cellSize < 50 ? 11 : 13, fontWeight: 800, color: 'var(--text-1)' }}>{fmt(v, metric)}</span>
            <span style={{ fontSize: cellSize < 50 ? 8 : 9, color: 'var(--text-3)', marginTop: 2 }}>{c.count}p</span>
          </div>
        )
      })}
    </div>
  )
}

export function ChaseZoneStats({ rows }: { rows: PitchLogRow[] }) {
  const byZone = binByZone(rows)
  const chaseRows = CHASE_ZONES.flatMap(z => byZone.get(z) ?? [])
  const chaseStats = zoneCellStats(chaseRows)
  const chaseSwingPct = chaseRows.length ? (chaseRows.filter(r => r.is_swing).length / chaseRows.length) * 100 : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.04em' }}>CHASE ZONE (OUT OF ZONE)</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          ['Pitches', String(chaseStats.count)],
          ['Chase Swing%', chaseSwingPct == null ? '—' : `${chaseSwingPct.toFixed(1)}%`],
          ['Whiff%', chaseStats.whiff_pct == null ? '—' : `${chaseStats.whiff_pct.toFixed(1)}%`],
        ].map(([label, value]) => (
          <div key={label} style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, minWidth: 84 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>{value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

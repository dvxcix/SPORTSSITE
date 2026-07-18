'use client'
import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { getTeamLogoUrl } from '@/lib/mlbTeamColors'
import { mlbHeadshot, pitchColor, pitchLabel } from '@/lib/mlb-api'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { BookLogo } from '@/components/BookLogo'
import { Tooltip } from '@/components/ui/tooltip-card'
import { normName, resolveNameEntry } from '@/lib/nameNorm'

// Pulled out of PitcherReportClient.tsx so Dugout's per-batter drilldown can
// render the exact same matchup tables — headers, heat-mapping, sort, the
// per-batter Statcast/HR-odds expand — instead of a lookalike rebuild. Both
// pages now import from here; PitcherReportClient.tsx no longer defines its
// own copies.

export interface LineupPlayer {
  mlb_id: number; name: string; name_norm: string
  batting_order: number; position: string; bats: string
  team: string; team_name: string; projected: boolean
  props?: any
}

export const pct = (v: any) => v != null ? `${Number(v).toFixed(1)}%` : '—'
export const num = (v: any, dp = 1) => v != null ? Number(v).toFixed(dp) : '—'
export const int = (v: any) => v != null ? String(v) : '—'
export const nv = (v: any): number | null => { const x = parseFloat(v); return isNaN(x) ? null : x }
export const f1 = (v: number | null | undefined) => v != null ? v.toFixed(1) : '—'
export const pp = (v: number | null | undefined) => v != null ? `${(v * 100).toFixed(1)}%` : '—'
export const ppRaw = (v: number | null | undefined) => v != null ? `${v.toFixed(1)}%` : '—'
export const dlt = (v: number | null | undefined, scale = 1) => v != null ? (v >= 0 ? '+' : '') + (v * scale).toFixed(scale === 100 ? 1 : 2) : '—'
export const oStr = (v: number | null | undefined) => v != null ? (v > 0 ? `+${v}` : String(v)) : '—'

// route.ts defaults an unresolvable batSide to the literal string '?' — only
// 'L' and 'S' get special-cased, everything else defaults to 'R' (matches
// this app's convention elsewhere for unknown-hand grouping).
export function effectiveBatSide(bats: string | null | undefined, pitcherHand: string): 'R' | 'L' {
  if (bats === 'S') return pitcherHand === 'L' ? 'R' : 'L'
  return bats === 'L' ? 'L' : 'R'
}

export function heat(v: number | null | undefined, all: (number | null | undefined)[], dir: 'hi' | 'lo' = 'hi'): React.CSSProperties {
  if (v == null) return {}
  const vals = all.filter((x): x is number => x != null)
  if (vals.length < 3) return {}
  const mn = Math.min(...vals), mx = Math.max(...vals)
  if (mx === mn) return {}
  let t = (Number(v) - mn) / (mx - mn)
  if (dir === 'lo') t = 1 - t
  if (t < 0.33) return { background: `rgba(239,68,68,${0.05 + (0.33 - t) * 0.55})` }
  if (t > 0.66) return { background: `rgba(74,222,128,${0.05 + (t - 0.66) * 0.65})` }
  return {}
}

export type SortState = { col: string; dir: 'desc' | 'asc' } | null
export function toggleSortState(prev: SortState, col: string): SortState {
  return prev?.col === col ? { col, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { col, dir: 'desc' }
}
export function cmpNullsLast(a: number | null | undefined, b: number | null | undefined, dir: 'desc' | 'asc'): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return dir === 'desc' ? b - a : a - b
}

// Same null-handling as cmpNullsLast, but for tables where the sortable
// columns are a mix of numbers and dimension/label strings (e.g. a "Pitch
// Type" or "Contact Type" column next to numeric metric columns) — added
// once group-by dimension columns needed to be sortable too, not just the
// metric columns next to them.
export function cmpAny(a: unknown, b: unknown, dir: 'desc' | 'asc'): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return dir === 'desc' ? b - a : a - b
  const cmp = String(a).localeCompare(String(b))
  return dir === 'desc' ? -cmp : cmp
}

export function SortableTH({ label, colKey, sort, onSort, align = 'right' }: {
  label: string; colKey: string; sort: SortState; onSort: (key: string) => void; align?: 'left' | 'right'
}) {
  const active = sort?.col === colKey
  return (
    <th
      onClick={() => onSort(colKey)}
      style={{ textAlign: align, padding: '6px 8px', color: active ? 'var(--accent)' : 'var(--text-3)', fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
    >
      {label}{active ? (sort!.dir === 'desc' ? ' ▼' : ' ▲') : ''}
    </th>
  )
}

export const COLS: { key: string; label: string; dir?: 'hi' | 'lo' }[] = [
  { key: 'pitches', label: 'PITCHES' },
  { key: 'in_play', label: 'BBE' },
  { key: 'whiff_pct', label: 'WHIFF%', dir: 'lo' },
  { key: 'hard_hit_pct', label: 'HARD-HIT%', dir: 'hi' },
  { key: 'barrel_pct', label: 'BARREL%', dir: 'hi' },
  { key: 'home_runs', label: 'HR', dir: 'hi' },
  { key: 'avg_exit_velo', label: 'EV', dir: 'hi' },
  { key: 'avg_launch_angle', label: 'LA' },
  { key: 'gb_pct', label: 'GB%', dir: 'lo' },
  { key: 'fb_pct', label: 'FB%', dir: 'hi' },
  { key: 'ld_pct', label: 'LD%' },
  { key: 'pu_pct', label: 'PU%', dir: 'lo' },
]

export function TeamLogoImg({ abbr, size = 20 }: { abbr: string; size?: number }) {
  const [err, setErr] = useState(false)
  const url = getTeamLogoUrl(abbr)
  if (!url || err) return <span style={{ fontSize: size * 0.5, fontWeight: 800, color: 'var(--text-3)' }}>{abbr}</span>
  return <img src={url} alt={abbr} onError={() => setErr(true)} style={{ width: size, height: size, objectFit: 'contain' }} />
}

export function pickPitcherRow(pitcherMap: Record<string, Record<string, { season?: any; recent?: any }>>, pitcherId: string | number | null | undefined, batterHand: string | null | undefined) {
  if (!pitcherId) return null
  const byHand = pitcherMap[String(pitcherId)]
  if (!byHand) return null
  const hand = (batterHand || 'R') as string
  const row = byHand[hand] ?? byHand['R'] ?? Object.values(byHand)[0]
  return row ? (row.season ?? row.recent) : null
}

function computeTiming(batterId: string, batterName: string, pitcherHand: string, pitcherRow: any, timingMap: { byId: any; byName: any }) {
  if (!pitcherRow) return { s_timing: null as number | null, r_timing: null as number | null, s_miss: null as number | null, r_miss: null as number | null }
  const mix = ([
    ['FF', pitcherRow.pct_fastball || 0],
    ['SI', pitcherRow.pct_sinker || 0],
    ['FC', pitcherRow.pct_cutter || 0],
    ['SL', pitcherRow.pct_slider || 0],
    ['ST', pitcherRow.pct_slider || 0],
    ['CU', pitcherRow.pct_curveball || 0],
    ['CH', pitcherRow.pct_changeup || 0],
    ['FS', pitcherRow.pct_splitter || 0],
  ] as [string, number][]).filter(([, p]) => p > 0.08)
  if (!mix.length) return { s_timing: null, r_timing: null, s_miss: null, r_miss: null }
  // Fuzzy fallback resolved once, not per pitch-type in the loop below —
  // same nickname/suffix-tolerant matching as everywhere else (see
  // src/lib/nameNorm.ts), since timingMap.byName is keyed by whatever name
  // string the timing source used, which doesn't always match the roster's
  // own MLB-fullName-derived name.
  const byNameEntry = timingMap.byName[batterName] ?? resolveNameEntry(timingMap.byName, batterName)
  let st = 0, rt = 0, sm = 0, rm = 0, sw = 0, rw = 0, smw = 0, rmw = 0
  for (const [pt, w] of mix) {
    const tRows = timingMap.byId[batterId]?.[pitcherHand]?.[pt] || byNameEntry?.[pitcherHand]?.[pt]
    if (!tRows) continue
    const { season: tse, recent: tre } = tRows as { season?: any; recent?: any }
    if (tse?.on_time_percent != null) { st += w * tse.on_time_percent; sw += w }
    if (tre?.on_time_percent != null) { rt += w * tre.on_time_percent; rw += w }
    if (tse?.miss_distance != null) { sm += w * tse.miss_distance; smw += w }
    if (tre?.miss_distance != null) { rm += w * tre.miss_distance; rmw += w }
  }
  return {
    s_timing: sw > 0 ? st / sw : null,
    r_timing: rw > 0 ? rt / rw : null,
    s_miss: smw > 0 ? sm / smw : null,
    r_miss: rmw > 0 ? rm / rmw : null,
  }
}

export function computeBatterStatcastStats(
  player: LineupPlayer, pitcherId: number, pitcherHand: string,
  splitMap: { byId: any; byName: any }, timingMap: { byId: any; byName: any },
  pitcherMap: Record<string, Record<string, { season?: any; recent?: any }>>
) {
  const idKey = String(player.mlb_id || '')
  const nn = player.name_norm || ''
  const playerSplits = splitMap.byId[idKey] ?? splitMap.byName[nn] ?? resolveNameEntry(splitMap.byName, nn)
  const handSplits = playerSplits?.[pitcherHand] ?? playerSplits?.['R'] ?? (playerSplits ? Object.values(playerSplits)[0] : null)
  const se = (handSplits as any)?.season ?? null
  const re = (handSplits as any)?.recent ?? null

  const s_spd = nv(se?.avg_bat_speed), r_spd = nv(re?.avg_bat_speed)
  const s_hrd = nv(se?.hard_swing_rate)
  const s_sq = nv(se?.squared_up_per_swing), r_sq = nv(re?.squared_up_per_swing)
  const s_bla = nv(se?.blast_per_swing), r_bla = nv(re?.blast_per_swing)
  const s_len = nv(se?.swing_length)
  const s_atk = nv(se?.attack_angle), r_atk = nv(re?.attack_angle)
  const s_iaa = nv(se?.ideal_attack_angle_rate)
  const s_tlt = nv(se?.swing_tilt)
  const s_ev = nv(se?.exit_velocity_avg)
  const s_la = nv(se?.launch_angle_avg)
  const s_brl = nv(se?.barrel_batted_rate)
  const s_hh = nv(se?.hard_hit_pct)
  const s_pa = nv(se?.pull_air_rate)
  const s_fb = nv(se?.fb_rate)
  const s_xhr = nv(se?.xhr)
  const s_hr = nv(se?.hr_total)

  const pitRow = pickPitcherRow(pitcherMap, pitcherId, effectiveBatSide(player.bats, pitcherHand))
  const { s_timing, r_timing, s_miss, r_miss } = computeTiming(idKey, nn, pitcherHand, pitRow, timingMap)

  return {
    s_spd, r_spd, d_spd: r_spd != null && s_spd != null ? r_spd - s_spd : null,
    s_hrd, s_sq, r_sq, d_sq: r_sq != null && s_sq != null ? r_sq - s_sq : null,
    s_bla, r_bla, s_len, s_atk, r_atk, s_iaa, s_tlt,
    s_ev, s_la, s_brl, s_hh, s_pa, s_fb, s_xhr, s_hr,
    s_timing, r_timing, s_miss, r_miss,
  }
}
export type BatterStatcastStats = ReturnType<typeof computeBatterStatcastStats>

export function StatTile({ label, value, title, heatStyle }: { label: string; value: string; title?: string; heatStyle?: React.CSSProperties }) {
  return (
    <Tooltip content={title ?? ''}>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 46, padding: '4px 6px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'help', ...heatStyle }}>
        <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.03em' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{value}</span>
      </div>
    </Tooltip>
  )
}

export function PlayerStatcastDetail({ player, stats, pool }: {
  player: LineupPlayer
  stats: BatterStatcastStats
  pool: BatterStatcastStats[]
}) {
  const g = (k: keyof BatterStatcastStats) => pool.map(p => p[k])
  const s = stats

  const sa = player.props?.sa
  const hasOdds = sa && (sa.fanduel != null || sa.caesars != null || sa.betmgm != null)
  const noSplits = s.s_spd == null && s.s_brl == null

  return (
    <tr>
      <td colSpan={13} style={{ padding: '10px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
        {noSplits ? (
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>No Statcast/bat-tracking data available for {player.name}.</div>
        ) : (
          <>
            <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.05em', marginBottom: 5 }}>BAT TRACKING <span style={{ fontWeight: 400, textTransform: 'none' }}>· heat-mapped vs the rest of this lineup</span></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
              <StatTile label="BSPD" value={f1(s.s_spd)} title="Season bat speed" heatStyle={heat(s.s_spd, g('s_spd'))} />
              <StatTile label="R·SPD" value={f1(s.r_spd)} title="Recent bat speed" heatStyle={heat(s.r_spd, g('r_spd'))} />
              <StatTile label="ΔSPD" value={dlt(s.d_spd)} title="Recent − season bat speed" heatStyle={heat(s.d_spd, g('d_spd'))} />
              <StatTile label="TIMING" value={pp(s.s_timing)} title="Season on-time % (pitch-mix weighted vs this pitcher)" heatStyle={heat(s.s_timing, g('s_timing'))} />
              <StatTile label="R·TIMING" value={pp(s.r_timing)} title="Recent timing" heatStyle={heat(s.r_timing, g('r_timing'))} />
              <StatTile label="MISS" value={f1(s.s_miss)} title="Season miss distance" heatStyle={heat(s.s_miss, g('s_miss'), 'lo')} />
              <StatTile label="R·MISS" value={f1(s.r_miss)} title="Recent miss distance" heatStyle={heat(s.r_miss, g('r_miss'), 'lo')} />
              <StatTile label="HARDSW" value={pp(s.s_hrd)} title="Hard swing rate" heatStyle={heat(s.s_hrd, g('s_hrd'))} />
              <StatTile label="SQ" value={pp(s.s_sq)} title="Squared-up per swing" heatStyle={heat(s.s_sq, g('s_sq'))} />
              <StatTile label="R·SQ" value={pp(s.r_sq)} title="Recent squared-up" heatStyle={heat(s.r_sq, g('r_sq'))} />
              <StatTile label="ΔSQ" value={dlt(s.d_sq, 100)} title="Squared-up delta ×100" heatStyle={heat(s.d_sq, g('d_sq'))} />
              <StatTile label="BLAST" value={pp(s.s_bla)} title="Blast per swing" heatStyle={heat(s.s_bla, g('s_bla'))} />
              <StatTile label="R·BLA" value={pp(s.r_bla)} title="Recent blast per swing" heatStyle={heat(s.r_bla, g('r_bla'))} />
              <StatTile label="SWLEN" value={f1(s.s_len)} title="Swing length" heatStyle={heat(s.s_len, g('s_len'), 'lo')} />
              <StatTile label="ATK°" value={f1(s.s_atk)} title="Attack angle" heatStyle={heat(s.s_atk, g('s_atk'))} />
              <StatTile label="R·ATK" value={f1(s.r_atk)} title="Recent attack angle" heatStyle={heat(s.r_atk, g('r_atk'))} />
              <StatTile label="IDLAA" value={pp(s.s_iaa)} title="Ideal attack angle rate" heatStyle={heat(s.s_iaa, g('s_iaa'))} />
              <StatTile label="TILT" value={f1(s.s_tlt)} title="Swing tilt" />
            </div>
            <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.05em', marginBottom: 5 }}>BATTED BALL</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: hasOdds ? 10 : 0 }}>
              <StatTile label="BRL%" value={ppRaw(s.s_brl)} title="Barrel batted rate" heatStyle={heat(s.s_brl, g('s_brl'))} />
              <StatTile label="HH%" value={ppRaw(s.s_hh)} title="Hard hit rate" heatStyle={heat(s.s_hh, g('s_hh'))} />
              <StatTile label="PULLAIR" value={pp(s.s_pa)} title="Pull air rate" heatStyle={heat(s.s_pa, g('s_pa'))} />
              <StatTile label="FB%" value={pp(s.s_fb)} title="Flyball rate" heatStyle={heat(s.s_fb, g('s_fb'))} />
              <StatTile label="EV" value={f1(s.s_ev)} title="Exit velocity" heatStyle={heat(s.s_ev, g('s_ev'))} />
              <StatTile label="LA" value={f1(s.s_la)} title="Launch angle" />
              <StatTile label="XHR" value={f1(s.s_xhr)} title="Expected HR (season)" heatStyle={heat(s.s_xhr, g('s_xhr'))} />
              <StatTile label="HR" value={s.s_hr != null ? String(Math.round(s.s_hr)) : '—'} title="Season HR total" heatStyle={heat(s.s_hr, g('s_hr'))} />
            </div>
          </>
        )}
        {hasOdds && (
          <>
            <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.05em', marginBottom: 5 }}>ANYTIME HR ODDS</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {(['fanduel', 'caesars', 'betmgm'] as const).map(book => (
                sa[book] != null && (
                  <div key={book} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6 }}>
                    <BookLogo vendor={book} size={13} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{oStr(sa[book])}</span>
                  </div>
                )
              ))}
            </div>
          </>
        )}
      </td>
    </tr>
  )
}

// Rows are clickable — pins that exact pitch/hand combo into the caller's
// cross-reference section, on top of whatever curation the caller applies
// itself (Pitcher Report's top-2-by-damage auto-pick; Dugout doesn't pin).
export function PitchMixTable({ title, rows, hand, pinned, onTogglePin }: {
  title: string; rows: any[]; hand: 'R' | 'L'
  pinned: Set<string>; onTogglePin: (hand: 'R' | 'L', pitchType: string) => void
}) {
  const [sort, setSort] = useState<SortState>(null)
  const onSort = (col: string) => setSort(prev => toggleSortState(prev, col))

  if (!rows.length) {
    return (
      <div style={{ flex: 1, minWidth: 'min(280px, 100%)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-2)', marginBottom: 6, letterSpacing: '0.04em' }}>{title}</div>
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-3)', fontSize: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>No pitches tracked against this side in the window.</div>
      </div>
    )
  }
  const activeSort = sort ?? { col: 'usage_pct', dir: 'desc' as const }
  const sorted = [...rows].sort((a, b) => {
    if (activeSort.col === 'pitch_type') {
      const cmp = pitchLabel(a.pitch_type).localeCompare(pitchLabel(b.pitch_type))
      return activeSort.dir === 'desc' ? -cmp : cmp
    }
    return cmpNullsLast(a[activeSort.col], b[activeSort.col], activeSort.dir)
  })
  return (
    <div style={{ flex: 1, minWidth: 'min(320px, 100%)' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-2)', marginBottom: 6, letterSpacing: '0.04em' }}>{title}</div>
      <div style={{ fontSize: 9, color: 'var(--text-3)', marginBottom: 4 }}>Click a pitch to pin its opposing-batter breakdown below</div>
      <div style={{ overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <SortableTH label="TYPE" colKey="pitch_type" sort={activeSort} onSort={onSort} align="left" />
              <SortableTH label="USAGE%" colKey="usage_pct" sort={activeSort} onSort={onSort} />
              {COLS.map(c => <SortableTH key={c.key} label={c.label} colKey={c.key} sort={activeSort} onSort={onSort} />)}
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => {
              const isPinned = pinned.has(r.pitch_type)
              return (
                <tr
                  key={r.pitch_type}
                  onClick={() => onTogglePin(hand, r.pitch_type)}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isPinned ? 'var(--accent-dim)' : undefined }}
                >
                  <td style={{ padding: '6px 8px', fontWeight: 700, color: isPinned ? 'var(--accent)' : 'var(--text-1)', whiteSpace: 'nowrap' }}>
                    <Tooltip content={isPinned ? 'Click to unpin' : 'Click to pin this pitch\'s batter breakdown below'}>
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: pitchColor(r.pitch_type), marginRight: 6 }} />
                        {pitchLabel(r.pitch_type)}{isPinned ? ' 📌' : ''}
                      </span>
                    </Tooltip>
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', fontWeight: 700 }}>{pct(r.usage_pct)}</td>
                  {COLS.map(c => (
                    <td key={c.key} style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', ...(c.dir ? heat(r[c.key], sorted.map(x => x[c.key]), c.dir) : {}) }}>
                      {c.key === 'home_runs' ? int(r[c.key]) : c.key === 'avg_exit_velo' || c.key === 'avg_launch_angle' ? num(r[c.key]) : pct(r[c.key])}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Batter cross-reference table for one hot pitch type. `getRow` is
// source-agnostic — the caller decides whether it's reading the 14-day
// pre-aggregated table or a live-computed map, and `batters` can be the
// whole opposing lineup (Pitcher Report) or a single player (Dugout,
// scoped to just the batter whose row is expanded).
export function BatterVsPitchTable({ batters, getRow, date, pitcherId, pitcherHand, splitMap, timingMap, pitcherMap, pikkitMap }: {
  pitchType: string
  batters: LineupPlayer[]
  getRow: (batter: LineupPlayer) => any | null
  date: string
  pitcherId: number
  pitcherHand: string
  splitMap: { byId: any; byName: any }
  timingMap: { byId: any; byName: any }
  pitcherMap: Record<string, Record<string, { season?: any; recent?: any }>>
  pikkitMap: Record<string, any>
}) {
  const [sort, setSort] = useState<SortState>(null)
  const onSort = (col: string) => setSort(prev => toggleSortState(prev, col))
  const activeSort = sort ?? { col: 'hard_hit_pct', dir: 'desc' as const }
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const statsById = useMemo(() => {
    const m: Record<number, BatterStatcastStats> = {}
    for (const b of batters) m[b.mlb_id] = computeBatterStatcastStats(b, pitcherId, pitcherHand, splitMap, timingMap, pitcherMap)
    return m
  }, [batters, pitcherId, pitcherHand, splitMap, timingMap, pitcherMap])
  const statsPool = Object.values(statsById)

  const withRows = batters.map(b => ({ batter: b, row: getRow(b) }))
  withRows.sort((a, b) => {
    if (a.row && !b.row) return -1
    if (!a.row && b.row) return 1
    if (!a.row || !b.row) return 0
    if (activeSort.col === 'name') {
      const cmp = a.batter.name.localeCompare(b.batter.name)
      return activeSort.dir === 'desc' ? -cmp : cmp
    }
    return cmpNullsLast(a.row[activeSort.col], b.row[activeSort.col], activeSort.dir)
  })
  const withData = withRows.filter(x => x.row).map(x => x.row)

  return (
    <div style={{ overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <SortableTH label="BATTER" colKey="name" sort={activeSort} onSort={onSort} align="left" />
            {COLS.filter(c => c.key !== 'in_play').map(c => <SortableTH key={c.key} label={c.label} colKey={c.key} sort={activeSort} onSort={onSort} />)}
            <SortableTH label="BBE" colKey="in_play" sort={activeSort} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {withRows.map(({ batter, row }) => {
            const isExpanded = expandedId === batter.mlb_id
            const sa = batter.props?.sa
            const picks = resolveNameEntry(pikkitMap, batter.name_norm)?.picks as number | undefined
            return (
              <Fragment key={batter.mlb_id}>
                <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border)', opacity: row ? 1 : 0.45 }}>
                  <td style={{ padding: '5px 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                      <Tooltip content={isExpanded ? 'Hide Statcast/HR odds' : 'Show Statcast/bat-tracking + HR odds'}>
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : batter.mlb_id)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 20, flexShrink: 0, border: 'none', background: 'none', color: isExpanded ? 'var(--accent)' : 'var(--text-3)', cursor: 'pointer', fontSize: 9, padding: 0 }}
                        >
                          {isExpanded ? '▾' : '▸'}
                        </button>
                      </Tooltip>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Tooltip content={`Open ${batter.name}'s player profile`}>
                        <Link
                          href={`/players/${batter.mlb_id}`}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none', color: 'inherit' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'none' }}
                        >
                          <PlayerAvatar headshot={mlbHeadshot(batter.mlb_id)} teamLogo={getTeamLogoUrl(batter.team)} teamAbbr={batter.team} name={batter.name} size={20} />
                          <span style={{ fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{batter.name}</span>
                        </Link>
                        </Tooltip>
                        <Tooltip content={batter.bats === 'S' ? 'Switch hitter' : batter.bats === 'L' ? 'Bats left' : 'Bats right'}>
                          <span
                            style={{
                              flexShrink: 0, width: 14, height: 14, borderRadius: '50%', fontSize: 8, fontWeight: 900,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'help',
                              color: batter.bats === 'L' ? '#60a5fa' : batter.bats === 'S' ? '#c084fc' : '#fb923c',
                              border: `1px solid ${batter.bats === 'L' ? '#60a5fa' : batter.bats === 'S' ? '#c084fc' : '#fb923c'}`,
                              background: `${batter.bats === 'L' ? '#60a5fa' : batter.bats === 'S' ? '#c084fc' : '#fb923c'}18`,
                            }}
                          >{batter.bats || '?'}</span>
                        </Tooltip>
                        </div>
                        {(sa?.fanduel != null || sa?.caesars != null || sa?.betmgm != null || picks != null) && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2, marginLeft: 26 }}>
                            {(['fanduel', 'caesars', 'betmgm'] as const).map(book => sa?.[book] != null && (
                              <Tooltip key={book} content={`Anytime HR — ${book}`}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 9, fontWeight: 700, color: 'var(--text-2)' }}>
                                  <BookLogo vendor={book} size={10} />{oStr(sa[book])}
                                </span>
                              </Tooltip>
                            ))}
                            {picks != null && (
                              <Tooltip content={`${picks.toLocaleString()} community Anytime HR picks`}>
                                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)' }}>
                                  📊{picks >= 1000 ? `${(picks / 1000).toFixed(1)}k` : picks}
                                </span>
                              </Tooltip>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  {COLS.filter(c => c.key !== 'in_play').map(c => (
                    <td key={c.key} style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text-1)', ...(row && c.dir ? heat(row[c.key], withData.map(x => x[c.key]), c.dir) : {}) }}>
                      {!row ? '—' : c.key === 'home_runs' ? int(row[c.key]) : c.key === 'avg_exit_velo' || c.key === 'avg_launch_angle' ? num(row[c.key]) : pct(row[c.key])}
                    </td>
                  ))}
                  <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text-1)' }}>{row ? int(row.in_play) : '—'}</td>
                </tr>
                {isExpanded && statsById[batter.mlb_id] && (
                  <PlayerStatcastDetail
                    key={`${batter.mlb_id}-detail`}
                    player={batter}
                    stats={statsById[batter.mlb_id]}
                    pool={statsPool}
                  />
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

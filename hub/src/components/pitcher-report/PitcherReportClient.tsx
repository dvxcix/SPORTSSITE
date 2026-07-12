'use client'
import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getTeamLogoUrl } from '@/lib/mlbTeamColors'
import { mlbHeadshot, pitchColor, pitchLabel } from '@/lib/mlb-api'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { BookLogo } from '@/components/BookLogo'
import { Tooltip } from '@/components/ui/tooltip-card'

// ─── shapes from /api/dugout/data ──────────────────────────────────────────
interface PitcherInfo { id: number; name: string; hand: string }
interface LineupPlayer {
  mlb_id: number; name: string; name_norm: string
  batting_order: number; position: string; bats: string
  team: string; team_name: string; projected: boolean
  props?: any
}
interface Game {
  gamePk: number; gameKey: string; gameNum: number
  homeTeam: string; awayTeam: string; homeAbbr: string; awayAbbr: string
  gameDate: string; status: string
  homePitcher: PitcherInfo | null; awayPitcher: PitcherInfo | null
  homeLineupConfirmed: boolean; awayLineupConfirmed: boolean
  homeLineup: LineupPlayer[]; awayLineup: LineupPlayer[]
}
interface DugoutData {
  date: string; games: Game[]; pitcherPitchRecent: any[]; batterPitchRecent: any[]
  statSplits: any[]; timingSplits: any[]; pitcherSplits: any[]; pikkit: any[]
}

interface StarterOption {
  key: string
  pitcher: PitcherInfo
  teamAbbr: string; teamName: string
  oppAbbr: string; oppName: string
  oppLineup: LineupPlayer[]
  oppLineupConfirmed: boolean
}

// ─── pitch-type lookup maps — same shape/builders as DugoutClient's, kept
// local here rather than shared since neither is currently exported and this
// page's only dependency on them is the raw batterPitchRecent/pitcherPitchRecent
// arrays already in the /api/dugout/data response. ──────────────────────────
function buildPitcherPitchMap(rows: any[]) {
  const map: Record<string, Record<string, Record<string, any>>> = {}
  for (const r of rows) {
    const id = String(r.mlb_id || '')
    const pt = r.pitch_type || ''
    const hand = r.bat_hand || 'R'
    if (!id || !pt) continue
    if (!map[id]) map[id] = {}
    if (!map[id][pt]) map[id][pt] = {}
    map[id][pt][hand] = r
  }
  return map
}
function buildBatterPitchMap(rows: any[]) {
  const map: Record<string, Record<string, Record<string, any>>> = {}
  for (const r of rows) {
    const nn = r.name_norm || ''
    const pt = r.pitch_type || ''
    const hand = r.pitcher_hand || 'R'
    if (!nn || !pt) continue
    if (!map[nn]) map[nn] = {}
    if (!map[nn][pt]) map[nn][pt] = {}
    map[nn][pt][hand] = r
  }
  return map
}

// ─── full Statcast/bat-tracking builders — same shape/logic as DugoutClient's
// (not exported there either), needed to power the same BSpd/R·Spd/Timing/
// Sq/Blast/SwLen/Atk/Brl%/HH%/PullAir/FB%/EV/LA/xHR/HR section on player
// expand here. ────────────────────────────────────────────────────────────
function buildSplitMap(rows: any[]) {
  const byId: Record<string, Record<string, { season?: any; recent?: any }>> = {}
  const byName: Record<string, Record<string, { season?: any; recent?: any }>> = {}
  for (const r of rows) {
    const id = String(r.mlb_id || '')
    const hand = r.pitch_hand || 'R'
    const win = r.win || 'season'
    if (id) {
      if (!byId[id]) byId[id] = {}
      if (!byId[id][hand]) byId[id][hand] = {}
      ;(byId[id][hand] as any)[win] = r
    }
    const nn = r.name_norm || ''
    if (nn) {
      if (!byName[nn]) byName[nn] = {}
      if (!byName[nn][hand]) byName[nn][hand] = {}
      ;(byName[nn][hand] as any)[win] = r
    }
  }
  return { byId, byName }
}

function buildTimingMap(rows: any[]) {
  const byId: Record<string, Record<string, Record<string, { season?: any; recent?: any }>>> = {}
  const byName: Record<string, Record<string, Record<string, { season?: any; recent?: any }>>> = {}
  for (const r of rows) {
    const id = String(r.mlb_id || '')
    const hand = r.pitch_hand || 'R'
    const pt = r.pitch_type || ''
    const win = r.win || 'season'
    if (id && pt) {
      if (!byId[id]) byId[id] = {}
      if (!byId[id][hand]) byId[id][hand] = {}
      if (!byId[id][hand][pt]) byId[id][hand][pt] = {}
      ;(byId[id][hand][pt] as any)[win] = r
    }
    const nn = r.name_norm || ''
    if (nn && pt) {
      if (!byName[nn]) byName[nn] = {}
      if (!byName[nn][hand]) byName[nn][hand] = {}
      if (!byName[nn][hand][pt]) byName[nn][hand][pt] = {}
      ;(byName[nn][hand][pt] as any)[win] = r
    }
  }
  return { byId, byName }
}

function buildPitcherMap(rows: any[]) {
  const map: Record<string, Record<string, { season?: any; recent?: any }>> = {}
  for (const r of rows) {
    const id = String(r.mlb_id || '')
    if (!id) continue
    const hand = r.bat_hand || 'R'
    const win = r.win || 'season'
    if (!map[id]) map[id] = {}
    if (!map[id][hand]) map[id][hand] = {}
    ;(map[id][hand] as any)[win] = r
  }
  return map
}

function pickPitcherRow(pitcherMap: ReturnType<typeof buildPitcherMap>, pitcherId: string | number | null | undefined, batterHand: string | null | undefined) {
  if (!pitcherId) return null
  const byHand = pitcherMap[String(pitcherId)]
  if (!byHand) return null
  const hand = (batterHand || 'R') as string
  const row = byHand[hand] ?? byHand['R'] ?? Object.values(byHand)[0]
  return row ? (row.season ?? row.recent) : null
}

function computeTiming(batterId: string, batterName: string, pitcherHand: string, pitcherRow: any, timingMap: ReturnType<typeof buildTimingMap>) {
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
  let st = 0, rt = 0, sm = 0, rm = 0, sw = 0, rw = 0, smw = 0, rmw = 0
  for (const [pt, w] of mix) {
    const tRows = timingMap.byId[batterId]?.[pitcherHand]?.[pt] || timingMap.byName[batterName]?.[pitcherHand]?.[pt]
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

// ─── formatting / heat ──────────────────────────────────────────────────────
// Every rate field on batter_pitch_type_recent/pitcher_pitch_type_recent
// already comes out of mlb-party on a 0-100 scale (41.3 meaning 41.3%), not
// a 0-1 fraction — confirmed against real rows, not assumed.
const normName = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim()
const pct = (v: any) => v != null ? `${Number(v).toFixed(1)}%` : '—'
const num = (v: any, dp = 1) => v != null ? Number(v).toFixed(dp) : '—'
const int = (v: any) => v != null ? String(v) : '—'
// batter_statcast_splits' rate fields are 0-1 FRACTIONS (unlike
// pitch_type_recent's already-0-100-scaled ones above) — matches
// DugoutClient's own nv/f1/pp/ppRaw distinction exactly.
const nv = (v: any): number | null => { const x = parseFloat(v); return isNaN(x) ? null : x }
const f1 = (v: number | null | undefined) => v != null ? v.toFixed(1) : '—'
const pp = (v: number | null | undefined) => v != null ? `${(v * 100).toFixed(1)}%` : '—'
const ppRaw = (v: number | null | undefined) => v != null ? `${v.toFixed(1)}%` : '—'
const dlt = (v: number | null | undefined, scale = 1) => v != null ? (v >= 0 ? '+' : '') + (v * scale).toFixed(scale === 100 ? 1 : 2) : '—'
const oStr = (v: number | null | undefined) => v != null ? (v > 0 ? `+${v}` : String(v)) : '—'

// route.ts defaults an unresolvable batSide to the literal string '?' (both
// for confirmed AND projected/roster-fallback lineups) — `bats || 'R'` treats
// that as truthy and never falls back, so any batter with unknown hand was
// silently vanishing from BOTH the RHB and LHB cross-reference buckets
// entirely (not just mis-bucketed). Explicit allowlist instead: only 'L' and
// 'S' get special-cased, everything else (including '?', '', undefined)
// defaults to 'R' — matches this app's convention elsewhere of treating
// unknown hand as right-handed for grouping purposes, and keeps the batter
// visible either way instead of dropping him.
function effectiveBatSide(bats: string | null | undefined, pitcherHand: string): 'R' | 'L' {
  if (bats === 'S') return pitcherHand === 'L' ? 'R' : 'L'
  return bats === 'L' ? 'L' : 'R'
}

function heat(v: number | null | undefined, all: (number | null | undefined)[], dir: 'hi' | 'lo' = 'hi'): React.CSSProperties {
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

function windowLabel(rows: any[]): string {
  const r = rows.find(x => x.window_start && x.window_end)
  if (!r) return ''
  const start = new Date(r.window_start + 'T12:00:00Z')
  const end = new Date(r.window_end + 'T12:00:00Z')
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `Last ${days} days (${fmt(start)} – ${fmt(end)})`
}

// ─── sortable headers — same click-to-sort / arrow-indicator convention as
// Dugout's TH component (not exported there, so replicated here). ──────────
type SortState = { col: string; dir: 'desc' | 'asc' } | null

function toggleSortState(prev: SortState, col: string): SortState {
  return prev?.col === col ? { col, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { col, dir: 'desc' }
}

function cmpNullsLast(a: number | null | undefined, b: number | null | undefined, dir: 'desc' | 'asc'): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return dir === 'desc' ? b - a : a - b
}

function SortableTH({ label, colKey, sort, onSort, align = 'right' }: {
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

// dir is the batter/HR-favorable direction — heat() colors toward green as
// the value moves that way, red the other way. Omitted dir (PITCHES/BBE,
// pure sample-size counts; LA/LD%, no monotonic good/bad — LA has a sweet
// spot, LD% is a contact-quality signal but not an HR one) skips coloring
// entirely rather than asserting a direction that isn't real.
const COLS: { key: string; label: string; dir?: 'hi' | 'lo' }[] = [
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

// ─── date strip — same offset-anchored-at-UTC-noon pattern as Weather Lab's,
// duplicated rather than imported since neither page exports it yet. ────────
function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}
function localToday(): string {
  return new Date().toLocaleDateString('en-CA')
}
function DateStrip({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const today = localToday()
  const days = [-2, -1, 0, 1, 2].map(offset => {
    const d = offsetDate(date, offset)
    const dt = new Date(d + 'T12:00:00Z')
    return {
      date: d, isSelected: d === date, isToday: d === today,
      dayName: dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      dayNum: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
    }
  })
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
      <button onClick={() => onChange(offsetDate(date, -1))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, flexShrink: 0, border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--text-3)', fontSize: 18, fontWeight: 700, borderRight: '1px solid var(--border)' }}>‹</button>
      {days.map(({ date: d, isSelected, isToday, dayName, dayNum }) => (
        <button key={d} onClick={() => onChange(d)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 4px', gap: 3, border: 'none', cursor: 'pointer', background: isSelected ? 'var(--accent)' : 'transparent', borderRight: '1px solid var(--border)' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: isSelected ? 'var(--accent-fg)' : isToday ? 'var(--accent)' : 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{dayName}</span>
          <span style={{ fontSize: 12, fontWeight: isSelected || isToday ? 900 : 600, color: isSelected ? 'var(--accent-fg)' : 'var(--text-1)', whiteSpace: 'nowrap' }}>{dayNum}</span>
        </button>
      ))}
      <button onClick={() => onChange(offsetDate(date, 1))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, flexShrink: 0, border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--text-3)', fontSize: 18, fontWeight: 700 }}>›</button>
    </div>
  )
}

function TeamLogoImg({ abbr, size = 20 }: { abbr: string; size?: number }) {
  const [err, setErr] = useState(false)
  const url = getTeamLogoUrl(abbr)
  if (!url || err) return <span style={{ fontSize: size * 0.5, fontWeight: 800, color: 'var(--text-3)' }}>{abbr}</span>
  return <img src={url} alt={abbr} onError={() => setErr(true)} style={{ width: size, height: size, objectFit: 'contain' }} />
}

// ─── pitch-mix table (one pitcher, one batter-hand bucket) ─────────────────
// Rows are clickable — pins that exact pitch/hand combo into the cross-
// reference section below, on top of whatever the top-2-by-damage auto-pick
// already surfaced. The auto-pick is a curation shortcut, not a claim that
// nothing else matters — a real HR off a pitch that didn't crack the top 2
// (small sample, edged out by a worse-looking but higher-scored pitch) is
// exactly the case a human needs to be able to override, not just trust.
function PitchMixTable({ title, rows, hand, pinned, onTogglePin }: {
  title: string; rows: any[]; hand: 'R' | 'L'
  pinned: Set<string>; onTogglePin: (hand: 'R' | 'L', pitchType: string) => void
}) {
  const [sort, setSort] = useState<SortState>(null)
  const onSort = (col: string) => setSort(prev => toggleSortState(prev, col))

  if (!rows.length) {
    return (
      <div style={{ flex: 1, minWidth: 280 }}>
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
    <div style={{ flex: 1, minWidth: 320 }}>
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

// ─── Statcast/bat-tracking stats — same computation as Dugout's buildBatterRow,
// pulled out as a pure function so BatterVsPitchTable can compute it for every
// batter in its pool (needed for heat-mapping each stat against the pool,
// same as Dugout does) rather than just the one being expanded.
function computeBatterStatcastStats(player: LineupPlayer, pitcherId: number, pitcherHand: string, splitMap: ReturnType<typeof buildSplitMap>, timingMap: ReturnType<typeof buildTimingMap>, pitcherMap: ReturnType<typeof buildPitcherMap>) {
  const idKey = String(player.mlb_id || '')
  const nn = player.name_norm || ''
  const playerSplits = splitMap.byId[idKey] ?? splitMap.byName[nn]
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
type BatterStatcastStats = ReturnType<typeof computeBatterStatcastStats>

// ─── inline expand panel — same Statcast/bat-tracking section (and HR odds)
// as Dugout's own batter row, computed the same way and heat-mapped against
// the same batter pool shown in the table (matches Dugout's own per-column
// heat-map, just laid out as tiles instead of a full-width spreadsheet row).
function StatTile({ label, value, title, heatStyle }: { label: string; value: string; title?: string; heatStyle?: React.CSSProperties }) {
  return (
    <Tooltip content={title ?? ''}>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 46, padding: '4px 6px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'help', ...heatStyle }}>
        <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.03em' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{value}</span>
      </div>
    </Tooltip>
  )
}

function PlayerStatcastDetail({ player, stats, pool }: {
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

// ─── batter cross-reference table for one hot pitch type ───────────────────
// `getRow` is source-agnostic — the caller decides whether it's reading the
// 14-day pre-aggregated batterPitchMap or the live N-games-computed map.
function BatterVsPitchTable({ batters, getRow, date, pitcherId, pitcherHand, splitMap, timingMap, pitcherMap, pikkitMap }: {
  pitchType: string
  batters: LineupPlayer[]
  getRow: (batter: LineupPlayer) => any | null
  date: string
  pitcherId: number
  pitcherHand: string
  splitMap: ReturnType<typeof buildSplitMap>
  timingMap: ReturnType<typeof buildTimingMap>
  pitcherMap: ReturnType<typeof buildPitcherMap>
  pikkitMap: Record<string, any>
}) {
  const [sort, setSort] = useState<SortState>(null)
  const onSort = (col: string) => setSort(prev => toggleSortState(prev, col))
  const activeSort = sort ?? { col: 'hard_hit_pct', dir: 'desc' as const }
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // Computed for the WHOLE pool (not just whichever row is expanded) so the
  // expand panel can heat-map each stat against the other batters shown
  // here, same as Dugout does across its own visible pool.
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
            const picks = pikkitMap[batter.name_norm]?.picks as number | undefined
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
                        <Tooltip content={`Open ${batter.name} in The Dugout`}>
                        <Link
                          href={`/dugout?date=${date}&highlight=${batter.mlb_id}`}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none', color: 'inherit' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'none' }}
                        >
                          <PlayerAvatar headshot={mlbHeadshot(batter.mlb_id)} teamLogo={getTeamLogoUrl(batter.team)} teamAbbr={batter.team} name={batter.name} size={20} />
                          <span style={{ fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{batter.name}</span>
                        </Link>
                        </Tooltip>
                        {/* Hand badge — same L/S/R color convention as Dugout's
                            player cell, just missing here before. Previously
                            impossible to tell LHB/RHB/switch apart at a glance
                            in this table at all. */}
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
                              <Tooltip content={`${picks.toLocaleString()} community Anytime HR picks (Pikkit)`}>
                                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)' }}>
                                  🎟{picks >= 1000 ? `${(picks / 1000).toFixed(1)}k` : picks}
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

// ─── page ────────────────────────────────────────────────────────────────
export function PitcherReportClient() {
  const [date, setDate] = useState<string>(() => localToday())
  const [data, setData] = useState<DugoutData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setData(null); setSelectedKey(null)
    fetch(`/api/dugout/data?date=${date}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [date])

  const starters: StarterOption[] = useMemo(() => {
    if (!data) return []
    const out: StarterOption[] = []
    for (const g of data.games) {
      if (g.awayPitcher) {
        out.push({
          key: `${g.gameKey}-away`, pitcher: g.awayPitcher,
          teamAbbr: g.awayAbbr, teamName: g.awayTeam,
          oppAbbr: g.homeAbbr, oppName: g.homeTeam,
          oppLineup: g.homeLineup, oppLineupConfirmed: g.homeLineupConfirmed,
        })
      }
      if (g.homePitcher) {
        out.push({
          key: `${g.gameKey}-home`, pitcher: g.homePitcher,
          teamAbbr: g.homeAbbr, teamName: g.homeTeam,
          oppAbbr: g.awayAbbr, oppName: g.awayTeam,
          oppLineup: g.awayLineup, oppLineupConfirmed: g.awayLineupConfirmed,
        })
      }
    }
    return out
  }, [data])

  useEffect(() => {
    if (!selectedKey && starters.length) setSelectedKey(starters[0].key)
  }, [starters, selectedKey])

  const selected = starters.find(s => s.key === selectedKey) ?? null

  const pitcherPitchMap = useMemo(() => buildPitcherPitchMap(data?.pitcherPitchRecent ?? []), [data?.pitcherPitchRecent])
  const batterPitchMap = useMemo(() => buildBatterPitchMap(data?.batterPitchRecent ?? []), [data?.batterPitchRecent])
  const splitMap = useMemo(() => buildSplitMap(data?.statSplits ?? []), [data?.statSplits])
  const timingMap = useMemo(() => buildTimingMap(data?.timingSplits ?? []), [data?.timingSplits])
  const statcastPitcherMap = useMemo(() => buildPitcherMap(data?.pitcherSplits ?? []), [data?.pitcherSplits])
  // A player can have one row per market (home_runs, singles, doubles...) —
  // prefer the home_runs row specifically, same as Dugout's own pikkitMap.
  const pikkitMap = useMemo(() => {
    const m: Record<string, any> = {}
    for (const r of (data?.pikkit ?? [])) {
      const nn = normName(r.player_name || '')
      if (!nn) continue
      const isHrRow = r.prop_type === 'home_runs' || r.market === 'home_runs'
      if (!m[nn] || isHrRow) m[nn] = r
    }
    return m
  }, [data?.pikkit])

  // 14-day pre-aggregated window (mlb-party) — the default, cheap source.
  const dayWindowRows = useMemo(() => {
    if (!selected) return { R: [] as any[], L: [] as any[] }
    const byType = pitcherPitchMap[String(selected.pitcher.id)] ?? {}
    const R: any[] = [], L: any[] = []
    for (const pt of Object.keys(byType)) {
      if (byType[pt].R) R.push(byType[pt].R)
      if (byType[pt].L) L.push(byType[pt].L)
    }
    return { R, L }
  }, [pitcherPitchMap, selected])

  // True "last N starts" / "last N games" window — computed live from MLB's
  // free Gumbo feed (src/lib/pitchLog.ts) rather than read from a
  // pre-aggregated table, since only a single fixed 14-day window exists
  // there. Heavier (fetches game feeds), so it's opt-in via the toggle below
  // rather than the default.
  const [windowMode, setWindowMode] = useState<'14day' | 'live'>('14day')
  const [liveN, setLiveN] = useState(3)
  const [liveData, setLiveData] = useState<{ window: { games: number; dateFrom: string | null; dateTo: string | null }; pitcherRows: { R: any[]; L: any[] }; batters: Record<string, Record<string, { R?: any; L?: any }>> } | null>(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError] = useState('')

  useEffect(() => {
    if (windowMode !== 'live' || !selected) { setLiveData(null); return }
    let cancelled = false
    setLiveLoading(true); setLiveError(''); setLiveData(null)
    const batterIds = selected.oppLineup.map(p => p.mlb_id).join(',')
    const season = new Date(date + 'T12:00:00Z').getUTCFullYear()
    fetch(`/api/pitcher-report/live-window?pitcherId=${selected.pitcher.id}&batterIds=${batterIds}&games=${liveN}&season=${season}`, { cache: 'no-store' })
      .then(async r => {
        const body = await r.json()
        if (!r.ok) throw new Error(body?.error || 'Failed to compute live window')
        return body
      })
      .then(d => { if (!cancelled) setLiveData(d) })
      .catch(e => { if (!cancelled) setLiveError(e?.message || 'Failed to compute live window') })
      .finally(() => { if (!cancelled) setLiveLoading(false) })
    return () => { cancelled = true }
  }, [windowMode, liveN, selected, date])

  const activeRows = windowMode === 'live'
    ? (liveData ? { R: liveData.pitcherRows.R, L: liveData.pitcherRows.L } : { R: [] as any[], L: [] as any[] })
    : dayWindowRows

  const allRows = [...activeRows.R, ...activeRows.L]
  const winLabel = windowMode === 'live'
    ? (liveData ? `Last ${liveData.window.games} starts (${liveData.window.dateFrom} – ${liveData.window.dateTo})` : '')
    : windowLabel(allRows)

  // "Getting hit lately" — for each hand bucket, the pitcher's own pitches
  // with a real sample (>=10 tracked) ranked by how hard they're being hit,
  // not by how often he throws them. This is the whole point of the page:
  // surface what to attack, not just what he throws most.
  const hotPitches = useMemo(() => {
    if (!selected) return [] as { hand: 'R' | 'L'; pitchType: string; row: any }[]
    const out: { hand: 'R' | 'L'; pitchType: string; row: any }[] = []
    for (const hand of ['R', 'L'] as const) {
      const rows = activeRows[hand].filter(r => (r.pitches ?? 0) >= 10)
      const ranked = [...rows].sort((a, b) => {
        const sa = (a.barrel_pct ?? 0) * 1.5 + (a.hard_hit_pct ?? 0)
        const sb = (b.barrel_pct ?? 0) * 1.5 + (b.hard_hit_pct ?? 0)
        return sb - sa
      })
      for (const r of ranked.slice(0, 2)) out.push({ hand, pitchType: r.pitch_type, row: r })
    }
    return out
  }, [activeRows, selected])

  // Manual overrides — a pitch that didn't crack the auto top-2 (e.g. a
  // real HR on a small sample that scored lower than two higher-volume
  // pitches) shouldn't be unreachable just because the auto-ranker didn't
  // pick it. Click any pitch-mix row to pin/unpin its breakdown here too.
  const [pinned, setPinned] = useState<{ hand: 'R' | 'L'; pitchType: string }[]>([])
  useEffect(() => { setPinned([]) }, [selected?.key, windowMode, liveN])
  const onTogglePin = (hand: 'R' | 'L', pitchType: string) => {
    setPinned(prev => prev.some(p => p.hand === hand && p.pitchType === pitchType)
      ? prev.filter(p => !(p.hand === hand && p.pitchType === pitchType))
      : [...prev, { hand, pitchType }])
  }
  const pinnedByHand = {
    R: new Set(pinned.filter(p => p.hand === 'R').map(p => p.pitchType)),
    L: new Set(pinned.filter(p => p.hand === 'L').map(p => p.pitchType)),
  }
  // "Show all" bypasses curation entirely — every pitch/hand combo the
  // pitcher has thrown at all, full stop. What "we should be able to see
  // all" actually means: don't make me discover pitches one click at a
  // time, give me the option to just see everything.
  const [showAll, setShowAll] = useState(false)
  useEffect(() => { setShowAll(false) }, [selected?.key, windowMode, liveN])
  const shownPitches = useMemo(() => {
    if (showAll) {
      const out: { hand: 'R' | 'L'; pitchType: string; row: any }[] = []
      for (const hand of ['R', 'L'] as const) for (const row of activeRows[hand]) out.push({ hand, pitchType: row.pitch_type, row })
      return out
    }
    const out = [...hotPitches]
    for (const p of pinned) {
      if (out.some(h => h.hand === p.hand && h.pitchType === p.pitchType)) continue
      const row = activeRows[p.hand].find(r => r.pitch_type === p.pitchType)
      if (row) out.push({ hand: p.hand, pitchType: p.pitchType, row })
    }
    return out
  }, [hotPitches, pinned, activeRows, showAll])

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
      <div className="fade-in" style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', margin: 0 }}>
          Pitcher <span style={{ color: 'var(--accent)' }}>Report</span>
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 0' }}>
          Pick today's starter, see his pitch mix and who he's been getting hit by lately, then see which of tonight's opposing batters are hot against those exact pitches.
        </p>
      </div>

      <DateStrip date={date} onChange={setDate} />

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Loading…</div>
      ) : starters.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No probable starters announced yet for {date}.</div>
      ) : (
        <>
          {/* starter picker */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {starters.map(s => {
              const isSel = s.key === selectedKey
              return (
                <button
                  key={s.key}
                  onClick={() => setSelectedKey(s.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 12px', borderRadius: 10,
                    border: `1px solid ${isSel ? 'var(--accent)' : 'var(--border)'}`,
                    background: isSel ? 'var(--accent-dim)' : 'var(--surface)',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <TeamLogoImg abbr={s.teamAbbr} size={18} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: isSel ? 'var(--accent)' : 'var(--text-1)' }}>{s.pitcher.name}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-3)' }}>{s.pitcher.hand}HP · {s.teamAbbr} vs {s.oppAbbr}</div>
                  </div>
                </button>
              )
            })}
          </div>

          {selected && (
            <>
              {/* selected pitcher header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                <PlayerAvatar headshot={mlbHeadshot(selected.pitcher.id)} teamLogo={getTeamLogoUrl(selected.teamAbbr)} teamAbbr={selected.teamAbbr} name={selected.pitcher.name} size={44} />
                <div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-1)' }}>
                    {selected.pitcher.name} <span style={{ color: 'var(--accent)' }}>{selected.pitcher.hand}HP</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    {selected.teamName} · facing {selected.oppName} · {selected.oppLineupConfirmed ? 'Confirmed lineup' : 'Projected lineup (roster, not confirmed batting order)'}
                  </div>
                </div>
              </div>
              {/* window mode toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <button onClick={() => setWindowMode('14day')} style={{ padding: '5px 10px', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer', background: windowMode === '14day' ? 'var(--accent)' : 'var(--surface)', color: windowMode === '14day' ? 'var(--accent-fg)' : 'var(--text-2)' }}>14-Day Window</button>
                  <button onClick={() => setWindowMode('live')} style={{ padding: '5px 10px', fontSize: 11, fontWeight: 700, border: 'none', borderLeft: '1px solid var(--border)', cursor: 'pointer', background: windowMode === 'live' ? 'var(--accent)' : 'var(--surface)', color: windowMode === 'live' ? 'var(--accent-fg)' : 'var(--text-2)' }}>Last N Starts/Games</button>
                </div>
                {windowMode === 'live' && (
                  <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    {[3, 5, 10].map(n => (
                      <button key={n} onClick={() => setLiveN(n)} style={{ padding: '5px 10px', fontSize: 11, fontWeight: 700, border: 'none', borderLeft: n !== 3 ? '1px solid var(--border)' : 'none', cursor: 'pointer', background: liveN === n ? 'var(--accent-dim)' : 'var(--surface)', color: liveN === n ? 'var(--accent)' : 'var(--text-2)' }}>N={n}</button>
                    ))}
                  </div>
                )}
                {windowMode === 'live' && liveLoading && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Computing from MLB play-by-play…</span>}
              </div>

              <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 16 }}>
                {windowMode === 'live' && liveError ? (
                  <span style={{ color: '#f87171' }}>{liveError}</span>
                ) : allRows.length === 0 ? (
                  liveLoading ? 'Computing…' : 'No recent pitch-type data for this pitcher yet.'
                ) : windowMode === 'live' ? (
                  `Sample: ${winLabel} — real starts, computed live from MLB play-by-play (not a rolling calendar window)`
                ) : (
                  `Sample: ${winLabel} · rolling window, not a start count`
                )}
              </div>

              {/* pitch mix */}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
                <PitchMixTable title="VS RHB" rows={activeRows.R} hand="R" pinned={pinnedByHand.R} onTogglePin={onTogglePin} />
                <PitchMixTable title="VS LHB" rows={activeRows.L} hand="L" pinned={pinnedByHand.L} onTogglePin={onTogglePin} />
              </div>

              {/* getting-hit-on-lately cross reference — gated on there being
                  any pitch data at all, not on shownPitches specifically, so
                  the "Show all pitches" toggle stays reachable even when no
                  single pitch clears the auto top-2's 10-pitch threshold. */}
              {allRows.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-1)' }}>
                      {showAll ? 'Every pitch vs every batter' : 'Getting hit on these pitches lately'}
                    </div>
                    <button
                      onClick={() => setShowAll(v => !v)}
                      style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99, cursor: 'pointer', border: `1px solid ${showAll ? 'var(--accent)' : 'var(--border)'}`, background: showAll ? 'var(--accent)' : 'var(--surface)', color: showAll ? 'var(--accent-fg)' : 'var(--text-2)' }}
                    >
                      {showAll ? '✓ Showing all pitches' : 'Show all pitches'}
                    </button>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 12 }}>
                    {showAll
                      ? 'Every pitch this pitcher has thrown vs each hand, matched against the opposing lineup\'s own recent numbers for that exact combo — no curation.'
                      : 'Auto-picked: ranked by barrel% + hard-hit% in the window above (min. 10 tracked pitches), top 2 per hand — plus anything you\'ve pinned yourself from the tables above (📌). Opposing lineup\'s own recent numbers shown against that exact pitch/hand combo, hardest-hit first.'}
                  </div>
                  {shownPitches.length === 0 && (
                    <div style={{ padding: 12, color: 'var(--text-3)', fontSize: 11, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 12 }}>
                      No pitch cleared the 10-pitch auto-pick threshold and nothing's pinned yet — click "Show all pitches" above, or click any row in the tables above to pin it.
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {shownPitches.map(({ hand, pitchType, row }) => {
                      const batters = selected.oppLineup.filter(p => effectiveBatSide(p.bats, selected.pitcher.hand) === hand)
                      const isManual = pinnedByHand[hand].has(pitchType)
                      return (
                        <div key={`${hand}-${pitchType}`}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: pitchColor(pitchType) }} />
                            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-1)' }}>{pitchLabel(pitchType)} vs {hand}HB</span>
                            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                              ({pct(row.hard_hit_pct)} hard-hit · {pct(row.barrel_pct)} barrel · {row.pitches} pitches)
                            </span>
                            {isManual && (
                              <Tooltip content="Unpin">
                                <button
                                  onClick={() => onTogglePin(hand, pitchType)}
                                  style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-dim)', border: 'none', borderRadius: 99, padding: '2px 7px', cursor: 'pointer' }}
                                >
                                  📌 pinned ✕
                                </button>
                              </Tooltip>
                            )}
                          </div>
                          {batters.length === 0 ? (
                            <div style={{ padding: 12, color: 'var(--text-3)', fontSize: 11, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
                              No {hand}HB batters in {selected.oppLineupConfirmed ? 'the confirmed lineup' : 'the projected lineup'}.
                            </div>
                          ) : (
                            <BatterVsPitchTable
                              pitchType={pitchType}
                              batters={batters}
                              date={date}
                              pitcherId={selected.pitcher.id}
                              pitcherHand={selected.pitcher.hand}
                              splitMap={splitMap}
                              timingMap={timingMap}
                              pitcherMap={statcastPitcherMap}
                              pikkitMap={pikkitMap}
                              getRow={b => windowMode === 'live'
                                ? liveData?.batters[String(b.mlb_id)]?.[pitchType]?.[selected.pitcher.hand as 'R' | 'L'] ?? null
                                : batterPitchMap[b.name_norm]?.[pitchType]?.[selected.pitcher.hand] ?? null}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

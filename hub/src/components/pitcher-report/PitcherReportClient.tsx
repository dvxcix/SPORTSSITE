'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getTeamLogoUrl } from '@/lib/mlbTeamColors'
import { mlbHeadshot, pitchColor, pitchLabel } from '@/lib/mlb-api'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'

// ─── shapes from /api/dugout/data ──────────────────────────────────────────
interface PitcherInfo { id: number; name: string; hand: string }
interface LineupPlayer {
  mlb_id: number; name: string; name_norm: string
  batting_order: number; position: string; bats: string
  team: string; team_name: string; projected: boolean
}
interface Game {
  gamePk: number; gameKey: string; gameNum: number
  homeTeam: string; awayTeam: string; homeAbbr: string; awayAbbr: string
  gameDate: string; status: string
  homePitcher: PitcherInfo | null; awayPitcher: PitcherInfo | null
  homeLineupConfirmed: boolean; awayLineupConfirmed: boolean
  homeLineup: LineupPlayer[]; awayLineup: LineupPlayer[]
}
interface DugoutData { date: string; games: Game[]; pitcherPitchRecent: any[]; batterPitchRecent: any[] }

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

// ─── formatting / heat ──────────────────────────────────────────────────────
// Every rate field on batter_pitch_type_recent/pitcher_pitch_type_recent
// already comes out of mlb-party on a 0-100 scale (41.3 meaning 41.3%), not
// a 0-1 fraction — confirmed against real rows, not assumed.
const pct = (v: any) => v != null ? `${Number(v).toFixed(1)}%` : '—'
const num = (v: any, dp = 1) => v != null ? Number(v).toFixed(dp) : '—'
const int = (v: any) => v != null ? String(v) : '—'

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

const COLS: { key: string; label: string; dir?: 'hi' | 'lo' }[] = [
  { key: 'pitches', label: 'PITCHES' },
  { key: 'in_play', label: 'BBE' },
  { key: 'whiff_pct', label: 'WHIFF%' },
  { key: 'hard_hit_pct', label: 'HARD-HIT%' },
  { key: 'barrel_pct', label: 'BARREL%' },
  { key: 'home_runs', label: 'HR' },
  { key: 'avg_exit_velo', label: 'EV' },
  { key: 'avg_launch_angle', label: 'LA' },
  { key: 'gb_pct', label: 'GB%' },
  { key: 'fb_pct', label: 'FB%' },
  { key: 'ld_pct', label: 'LD%' },
  { key: 'pu_pct', label: 'PU%' },
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
                  title={isPinned ? 'Click to unpin' : 'Click to pin this pitch\'s batter breakdown below'}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isPinned ? 'var(--accent-dim)' : undefined }}
                >
                  <td style={{ padding: '6px 8px', fontWeight: 700, color: isPinned ? 'var(--accent)' : 'var(--text-1)', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: pitchColor(r.pitch_type), marginRight: 6 }} />
                    {pitchLabel(r.pitch_type)}{isPinned ? ' 📌' : ''}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', fontWeight: 700 }}>{pct(r.usage_pct)}</td>
                  {COLS.map(c => (
                    <td key={c.key} style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', ...heat(r[c.key], sorted.map(x => x[c.key]), c.dir ?? 'hi') }}>
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

// ─── batter cross-reference table for one hot pitch type ───────────────────
// `getRow` is source-agnostic — the caller decides whether it's reading the
// 14-day pre-aggregated batterPitchMap or the live N-games-computed map.
function BatterVsPitchTable({ batters, getRow, date }: {
  pitchType: string
  batters: LineupPlayer[]
  getRow: (batter: LineupPlayer) => any | null
  date: string
}) {
  const [sort, setSort] = useState<SortState>(null)
  const onSort = (col: string) => setSort(prev => toggleSortState(prev, col))
  const activeSort = sort ?? { col: 'hard_hit_pct', dir: 'desc' as const }

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
          {withRows.map(({ batter, row }) => (
            <tr key={batter.mlb_id} style={{ borderBottom: '1px solid var(--border)', opacity: row ? 1 : 0.45 }}>
              <td style={{ padding: '5px 8px' }}>
                <Link
                  href={`/dugout?date=${date}&highlight=${batter.mlb_id}`}
                  title={`Open ${batter.name} in The Dugout`}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none', color: 'inherit' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'none' }}
                >
                  <PlayerAvatar headshot={mlbHeadshot(batter.mlb_id)} teamLogo={getTeamLogoUrl(batter.team)} teamAbbr={batter.team} name={batter.name} size={20} />
                  <span style={{ fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{batter.name}</span>
                </Link>
              </td>
              {COLS.filter(c => c.key !== 'in_play').map(c => (
                <td key={c.key} style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text-1)', ...(row ? heat(row[c.key], withData.map(x => x[c.key]), c.dir ?? 'hi') : {}) }}>
                  {!row ? '—' : c.key === 'home_runs' ? int(row[c.key]) : c.key === 'avg_exit_velo' || c.key === 'avg_launch_angle' ? num(row[c.key]) : pct(row[c.key])}
                </td>
              ))}
              <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text-1)' }}>{row ? int(row.in_play) : '—'}</td>
            </tr>
          ))}
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
  const shownPitches = useMemo(() => {
    const out = [...hotPitches]
    for (const p of pinned) {
      if (out.some(h => h.hand === p.hand && h.pitchType === p.pitchType)) continue
      const row = activeRows[p.hand].find(r => r.pitch_type === p.pitchType)
      if (row) out.push({ hand: p.hand, pitchType: p.pitchType, row })
    }
    return out
  }, [hotPitches, pinned, activeRows])

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
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

              {/* getting-hit-on-lately cross reference */}
              {shownPitches.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-1)', marginBottom: 4 }}>Getting hit on these pitches lately</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 12 }}>
                    Auto-picked: ranked by barrel% + hard-hit% in the window above (min. 10 tracked pitches), top 2 per hand — plus anything you've pinned yourself from the tables above (📌). Opposing lineup's own recent numbers shown against that exact pitch/hand combo, hardest-hit first.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {shownPitches.map(({ hand, pitchType, row }) => {
                      const batters = selected.oppLineup.filter(p => {
                        const effective = p.bats === 'S' ? (selected.pitcher.hand === 'L' ? 'R' : 'L') : (p.bats || 'R')
                        return effective === hand
                      })
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
                              <button
                                onClick={() => onTogglePin(hand, pitchType)}
                                title="Unpin"
                                style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-dim)', border: 'none', borderRadius: 99, padding: '2px 7px', cursor: 'pointer' }}
                              >
                                📌 pinned ✕
                              </button>
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

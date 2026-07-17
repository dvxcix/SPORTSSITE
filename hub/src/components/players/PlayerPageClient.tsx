'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { mlbHeadshot, mlbTeamLogo, pitchColor, pitchLabel } from '@/lib/mlb-api'
import { getTeamLogoUrl, getTeamName } from '@/lib/mlbTeamColors'
import { heat, SortableTH, SortState, toggleSortState, cmpNullsLast } from '@/components/pitcher-report/MatchupTables'
import { PitchZoneHeatmap, type PitcherPitchRow } from './PitchZoneHeatmap'
import { BatterMatchupExplorer, type BatterPitchRow } from './BatterMatchupExplorer'

type SplitRow = { dims: Record<string, any>; metrics: Record<string, any> }
type SplitWindow = { season: SplitRow[]; recency: SplitRow[] }

type PlayerData = {
  season: number
  player: {
    mlb_id: number
    full_name: string | null
    primary_position: string | null
    current_team_id: number | null
    current_team_abbr: string | null
    bat_side: string | null
    pitch_hand: string | null
    height: string | null
    weight: number | null
    birth_date: string | null
    mlb_debut: string | null
  }
  isBatter: boolean
  isPitcher: boolean
  seasonStats: { batting: Record<string, any> | null; pitching: Record<string, any> | null }
  careerStats: { batting: Record<string, any> | null; pitching: Record<string, any> | null }
  statcastSeason: { hitting: Record<string, any>; pitching: Record<string, any> }
  pitchArsenal: { batter: Record<string, any>[]; pitcher: Record<string, any>[] }
  form: Record<string, { season: Record<string, number | null>; recency: Record<string, number | null> }>
  splits: Record<string, Record<string, SplitWindow>>
  swingTake: Record<string, SplitRow[]>
  battingStance: SplitWindow | null
  homeRuns: { hit: Record<string, any>[]; allowed: Record<string, any>[] }
}

// ── formatting — each stat family gets the precision it actually reads
// naturally at (rate stats like AVG stay 3 decimals; velocity/distance/%
// stats are 1 decimal, never the padded-to-3 look) ─────────────────────
const r3 = (v: unknown) => (typeof v === 'number' ? v.toFixed(3) : '—')
const d1 = (v: unknown) => (typeof v === 'number' ? v.toFixed(1) : '—')
const p1 = (v: unknown) => (typeof v === 'number' ? `${v.toFixed(1)}%` : '—')
const frac1 = (v: unknown) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '—')
const i0 = (v: unknown) => (typeof v === 'number' ? String(Math.round(v)) : '—')

export const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: 16,
  background: 'var(--surface)',
}
export const sectionTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: 'var(--text-2)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: 12,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
}
export const windowTag: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--text-3)',
  textTransform: 'none',
  letterSpacing: 0,
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '2px 6px',
}

export function StatGrid({ pairs }: { pairs: [string, string][] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 12 }}>
      {pairs.map(([label, value]) => (
        <div key={label}>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-1)' }}>{value}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{label}</div>
        </div>
      ))}
    </div>
  )
}

// Same L/R/Switch color convention already used on Dugout/Pitcher Report's
// matchup tables (#60a5fa blue / #c084fc purple / #fb923c orange) — a
// colored circle instead of plain text.
const HAND_COLORS: Record<string, string> = { L: '#60a5fa', S: '#c084fc', R: '#fb923c' }
function HandBadge({ hand }: { hand: string | null }) {
  if (!hand) return null
  const color = HAND_COLORS[hand] ?? HAND_COLORS.R
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 18, height: 18, borderRadius: '50%', fontSize: 10, fontWeight: 900,
        color, border: `1px solid ${color}`, background: `${color}18`, flexShrink: 0,
      }}
    >
      {hand}
    </span>
  )
}

function PlayerLink({ mlbId, name, teamAbbr, size = 22 }: { mlbId: number; name: string; teamAbbr?: string | null; size?: number }) {
  return (
    <Link
      href={`/players/${mlbId}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', color: 'inherit' }}
    >
      <PlayerAvatar headshot={mlbHeadshot(mlbId)} teamLogo={teamAbbr ? getTeamLogoUrl(teamAbbr) : undefined} teamAbbr={teamAbbr} name={name} size={size} />
      <span style={{ fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{name}</span>
    </Link>
  )
}

// Play-outcome color coding, so a scanning eye reads the log without
// having to read every cell — reusing the app's existing green/red vars
// plus the same blue/purple hex pair the hand badges use, for one
// consistent palette instead of inventing new colors per feature.
function resultColor(result: string | null | undefined): string {
  const key = (result || '').toLowerCase()
  if (key === 'home_run') return 'var(--green)'
  if (key === 'double') return '#60a5fa'
  if (key === 'triple') return '#c084fc'
  if (key === 'single') return 'var(--accent)'
  if (key === 'walk' || key === 'hit_by_pitch') return 'var(--gold)'
  if (key.includes('out') || key.includes('strikeout') || key.includes('double_play')) return 'var(--red)'
  return 'var(--text-3)'
}
const HR_CAT_COLORS: Record<string, string> = {
  'No Doubter': 'var(--green)',
  'Mostly Gone': 'var(--gold)',
  'Doubter': 'var(--red)',
}
const CONTACT_CODE_LABELS: Record<string, string> = { '2': 'In Play', '4': 'Foul', '9': 'Whiff' }

function PitchBadge({ code }: { code: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: pitchColor(code), flexShrink: 0 }} />
      {pitchLabel(code)}
    </span>
  )
}

function DimCell({ dimKey, value }: { dimKey: string; value: string }) {
  if (dimKey === 'api_pitch_type') return <PitchBadge code={value} />
  if (dimKey === 'pitch_hand' || dimKey === 'bat_side') return <HandBadge hand={value} />
  if (dimKey === 'bat_contact_code') return <span>{CONTACT_CODE_LABELS[value] ?? value}</span>
  return <span>{value}</span>
}

export function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? 'var(--accent-dim)' : 'var(--surface-2)',
        color: active ? 'var(--accent)' : 'var(--text-3)',
      }}
    >
      {children}
    </button>
  )
}
export function DimChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? 'var(--accent-dim)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-3)',
      }}
    >
      {label}
    </button>
  )
}

// Season vs. rolling-recency comparison — the actual competitive-edge
// question ("is this player hot or cold right now"), not just season
// aggregates. Direction of "better" flips per metric (lower whiff% is
// good, higher bat speed is good).
const FORM_METRICS: { key: string; label: string; dir: 'hi' | 'lo'; fmt: (v: number | null) => string }[] = [
  { key: 'avg_bat_speed', label: 'Avg Bat Speed', dir: 'hi', fmt: v => (v == null ? '—' : `${v.toFixed(1)} mph`) },
  { key: 'hard_swing_rate', label: 'Hard Swing %', dir: 'hi', fmt: v => frac1(v) },
  { key: 'squared_up_per_swing', label: 'Squared-Up %', dir: 'hi', fmt: v => frac1(v) },
  { key: 'blast_per_swing', label: 'Blast %', dir: 'hi', fmt: v => frac1(v) },
  { key: 'whiff_per_swing', label: 'Whiff %', dir: 'lo', fmt: v => frac1(v) },
]

function FormComparisonCard({ role, form }: { role: string; form: { season: Record<string, number | null>; recency: Record<string, number | null> } }) {
  return (
    <div style={cardStyle}>
      <div style={sectionTitleStyle}>
        Current Form {role === 'pitcher' ? '(Pitching)' : ''}
        <span style={windowTag}>Last 6 Days vs. Season</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: 'var(--text-3)', textAlign: 'left' }}>
              <th style={{ padding: '6px 10px' }}></th>
              <th style={{ padding: '6px 10px', textAlign: 'right' }}>Season</th>
              <th style={{ padding: '6px 10px', textAlign: 'right' }}>Last 6 Days</th>
              <th style={{ padding: '6px 10px', textAlign: 'right' }}>Trend</th>
            </tr>
          </thead>
          <tbody>
            {FORM_METRICS.map(m => {
              const s = form.season[m.key]
              const r = form.recency[m.key]
              const diff = s != null && r != null ? r - s : null
              const better = diff != null && (m.dir === 'hi' ? diff > 0 : diff < 0)
              const worse = diff != null && (m.dir === 'hi' ? diff < 0 : diff > 0)
              return (
                <tr key={m.key} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 10px', color: 'var(--text-1)', fontWeight: 700 }}>{m.label}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-2)' }}>{m.fmt(s)}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-1)', fontWeight: 700 }}>{m.fmt(r)}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: better ? 'var(--green)' : worse ? 'var(--red)' : 'var(--text-3)' }}>
                    {diff == null ? '—' : `${diff > 0 ? '▲' : diff < 0 ? '▼' : '—'} ${Math.abs(diff).toFixed(2)}`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Fully customizable split explorer ───────────────────────────────
// Users pick the window (season/recency) and which dims to group rows
// by — everything else gets aggregated across, weighted by the category's
// own count field rather than naively averaged.
type ColConfig = { key: string; label: string; dir: 'hi' | 'lo'; isFrac?: boolean; digits?: number }
type DimConfig = { key: string; label: string }
type CategoryConfig = {
  key: string
  title: string
  weightKey: string
  weightLabel: string
  dims: DimConfig[]
  defaultGroupBy: string[]
  cols: ColConfig[]
}

const CATEGORY_CONFIGS: CategoryConfig[] = [
  {
    key: 'bat_tracking', title: 'Bat Tracking', weightKey: 'swings_competitive', weightLabel: 'Swings',
    dims: [
      { key: 'api_pitch_type', label: 'Pitch Type' },
      { key: 'pitch_hand', label: 'Pitch Hand' },
      { key: 'bat_side', label: 'Bat Side' },
      { key: 'bat_contact_code', label: 'Contact Type' },
    ],
    defaultGroupBy: ['api_pitch_type'],
    cols: [
      { key: 'avg_bat_speed', label: 'Bat Speed', dir: 'hi', digits: 1 },
      { key: 'hard_swing_rate', label: 'Hard Swing %', dir: 'hi', isFrac: true },
      { key: 'squared_up_per_swing', label: 'Squared-Up %', dir: 'hi', isFrac: true },
      { key: 'blast_per_swing', label: 'Blast %', dir: 'hi', isFrac: true },
      { key: 'whiff_per_swing', label: 'Whiff %', dir: 'lo', isFrac: true },
      { key: 'swing_length', label: 'Swing Length', dir: 'lo', digits: 2 },
    ],
  },
  {
    key: 'batted_ball_splits', title: 'Batted Ball', weightKey: 'bbe', weightLabel: 'BBE',
    dims: [
      { key: 'api_pitch_type', label: 'Pitch Type' },
      { key: 'pitch_hand', label: 'Pitch Hand' },
      { key: 'bat_side', label: 'Bat Side' },
    ],
    defaultGroupBy: ['api_pitch_type'],
    cols: [
      { key: 'gb_rate', label: 'GB %', dir: 'lo', isFrac: true },
      { key: 'fb_rate', label: 'FB %', dir: 'hi', isFrac: true },
      { key: 'ld_rate', label: 'LD %', dir: 'hi', isFrac: true },
      { key: 'pu_rate', label: 'PU %', dir: 'lo', isFrac: true },
      { key: 'pull_rate', label: 'Pull %', dir: 'hi', isFrac: true },
      { key: 'straight_rate', label: 'Straight %', dir: 'hi', isFrac: true },
      { key: 'oppo_rate', label: 'Oppo %', dir: 'hi', isFrac: true },
    ],
  },
  {
    key: 'swing_timing_miss_distance', title: 'Swing Timing', weightKey: 'n_swings', weightLabel: 'Swings',
    dims: [
      { key: 'api_pitch_type', label: 'Pitch Type' },
      { key: 'pitch_hand', label: 'Pitch Hand' },
      { key: 'bat_side', label: 'Bat Side' },
      { key: 'bat_contact_code', label: 'Contact Type' },
    ],
    defaultGroupBy: ['api_pitch_type'],
    cols: [
      { key: 'perfect_percent', label: 'Perfect %', dir: 'hi', isFrac: true },
      { key: 'centered_percent', label: 'Centered %', dir: 'hi', isFrac: true },
      { key: 'on_time_percent', label: 'On-Time %', dir: 'hi', isFrac: true },
      { key: 'whiff_rate', label: 'Whiff %', dir: 'lo', isFrac: true },
      { key: 'miss_distance', label: 'Miss Dist', dir: 'lo', digits: 2 },
    ],
  },
  {
    key: 'swing_path_attack_angle', title: 'Swing Path', weightKey: 'competitive_swings', weightLabel: 'Swings',
    dims: [
      { key: 'api_pitch_type', label: 'Pitch Type' },
      { key: 'pitch_hand', label: 'Pitch Hand' },
      { key: 'bat_side', label: 'Bat Side' },
    ],
    defaultGroupBy: ['api_pitch_type'],
    cols: [
      { key: 'avg_bat_speed', label: 'Bat Speed', dir: 'hi', digits: 1 },
      { key: 'attack_angle', label: 'Attack Angle', dir: 'hi', digits: 1 },
      { key: 'ideal_attack_angle_rate', label: 'Ideal AA %', dir: 'hi', isFrac: true },
      { key: 'swing_tilt', label: 'Swing Tilt', dir: 'hi', digits: 1 },
    ],
  },
]

function aggregateByDims(rows: SplitRow[], groupBy: string[], weightKey: string, metricKeys: string[]): Record<string, any>[] {
  const groups = new Map<string, { dims: Record<string, string>; weight: number; sums: Record<string, number> }>()
  for (const r of rows) {
    const dims: Record<string, string> = {}
    for (const k of groupBy) dims[k] = r.dims?.[k] ?? '—'
    const key = groupBy.map(k => dims[k]).join('|') || 'all'
    const w = Number(r.metrics?.[weightKey]) || 0
    let g = groups.get(key)
    if (!g) { g = { dims, weight: 0, sums: Object.fromEntries(metricKeys.map(k => [k, 0])) }; groups.set(key, g) }
    g.weight += w
    for (const k of metricKeys) {
      const v = r.metrics?.[k]
      if (typeof v === 'number' && Number.isFinite(v)) g.sums[k] += v * w
    }
  }
  return Array.from(groups.values()).map(g => ({
    ...g.dims, weight: g.weight,
    ...Object.fromEntries(metricKeys.map(k => [k, g.weight > 0 ? g.sums[k] / g.weight : null])),
  }))
}

function SplitExplorer({ config, splitWindow }: { config: CategoryConfig; splitWindow: SplitWindow }) {
  const hasRecency = splitWindow.recency.length > 0
  const [windowSel, setWindowSel] = useState<'season' | 'recency'>(hasRecency ? 'recency' : 'season')
  const [groupBy, setGroupBy] = useState<string[]>(config.defaultGroupBy)
  const [sort, setSort] = useState<SortState>({ col: 'weight', dir: 'desc' })

  const rows = windowSel === 'recency' ? splitWindow.recency : splitWindow.season
  const metricKeys = config.cols.map(c => c.key)
  const aggregated = useMemo(() => aggregateByDims(rows, groupBy, config.weightKey, metricKeys), [rows, groupBy])

  if (!splitWindow.season.length && !splitWindow.recency.length) return null

  const onSort = (col: string) => setSort(prev => toggleSortState(prev, col))
  const sorted = [...aggregated].sort((a, b) => cmpNullsLast(a[sort!.col], b[sort!.col], sort!.dir))
  const allByCol = Object.fromEntries(config.cols.map(c => [c.key, aggregated.map(r => r[c.key])]))

  function toggleDim(key: string) {
    setGroupBy(prev => (prev.includes(key) ? (prev.length > 1 ? prev.filter(k => k !== key) : prev) : [...prev, key]))
  }

  return (
    <div style={cardStyle}>
      <div style={sectionTitleStyle}>
        {config.title}
        {hasRecency && (
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            <ToggleBtn active={windowSel === 'season'} onClick={() => setWindowSel('season')}>Season</ToggleBtn>
            <ToggleBtn active={windowSel === 'recency'} onClick={() => setWindowSel('recency')}>Last 6 Days</ToggleBtn>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'none', letterSpacing: 0, marginRight: 2 }}>Group by:</span>
        {config.dims.map(d => (
          <DimChip key={d.key} label={d.label} active={groupBy.includes(d.key)} onClick={() => toggleDim(d.key)} />
        ))}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {groupBy.map(dk => (
                <th key={dk} style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-3)', fontWeight: 700 }}>
                  {config.dims.find(d => d.key === dk)?.label}
                </th>
              ))}
              <SortableTH label={config.weightLabel} colKey="weight" sort={sort} onSort={onSort} />
              {config.cols.map(c => (
                <SortableTH key={c.key} label={c.label} colKey={c.key} sort={sort} onSort={onSort} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                {groupBy.map(dk => (
                  <td key={dk} style={{ padding: '6px 8px', color: 'var(--text-1)', fontWeight: 700 }}>
                    <DimCell dimKey={dk} value={row[dk]} />
                  </td>
                ))}
                <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-2)' }}>{i0(row.weight)}</td>
                {config.cols.map(c => {
                  const v = row[c.key]
                  const display = v == null ? '—' : c.isFrac ? frac1(v) : v.toFixed(c.digits ?? 1)
                  return (
                    <td key={c.key} style={{ padding: '6px 8px', textAlign: 'right', ...(v != null ? heat(v, allByCol[c.key], c.dir) : {}) }}>
                      {display}
                    </td>
                  )
                })}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={groupBy.length + 1 + config.cols.length} style={{ padding: '12px 8px', color: 'var(--text-3)', textAlign: 'center' }}>No data for this window.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Swing/Take (Batting Run Value) — a different dim shape (group_type +
// sub_type, no recency window on this leaderboard) than the pitch/hand
// categories above, so it gets its own explorer matching the real
// Savant page's own Group Type + Sub Type pickers.
function SwingTakeExplorer({ rows, title }: { rows: SplitRow[]; title: string }) {
  const groupTypes = useMemo(() => Array.from(new Set(rows.map(r => r.dims.group_type))), [rows])
  const [groupType, setGroupType] = useState(groupTypes[0])
  const subTypes = useMemo(() => rows.filter(r => r.dims.group_type === groupType).map(r => r.dims.sub_type), [rows, groupType])
  const [subType, setSubType] = useState(subTypes[0])

  useEffect(() => {
    if (!subTypes.includes(subType)) setSubType(subTypes[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupType])

  if (!rows.length) return null

  const row = rows.find(r => r.dims.group_type === groupType && r.dims.sub_type === subType)
  const m = row?.metrics ?? {}
  const isRegionBreakdown = 'runs_heart' in m

  return (
    <div style={cardStyle}>
      <div style={sectionTitleStyle}>{title}<span style={windowTag}>Season · Context-Neutral</span></div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {groupTypes.map(gt => (
          <ToggleBtn key={gt} active={gt === groupType} onClick={() => setGroupType(gt)}>{gt}</ToggleBtn>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {subTypes.map(st => (
          <DimChip key={st} label={st} active={st === subType} onClick={() => setSubType(st)} />
        ))}
      </div>
      {row ? (
        <StatGrid pairs={(isRegionBreakdown ? [
          ['Runs (All)', d1(m.runs_all)], ['Heart', d1(m.runs_heart)], ['Shadow', d1(m.runs_shadow)],
          ['Chase', d1(m.runs_chase)], ['Waste', d1(m.runs_waste)],
        ] : [
          ['Runs (All)', d1(m.runs_all)], ['vs 4-Seam', d1(m.runs_ff)], ['vs Sinker', d1(m.runs_si)],
          ['vs Change', d1(m.runs_ch)], ['vs Slider', d1(m.runs_sl)], ['vs Curve', d1(m.runs_cu)],
          ['vs Cutter', d1(m.runs_fc)], ['vs Splitter', d1(m.runs_fs)], ['vs Sweeper', d1(m.runs_st)], ['vs Slurve', d1(m.runs_sv)],
        ]) as [string, string][]} />
      ) : <div style={{ color: 'var(--text-3)', fontSize: 13 }}>No data for this combination.</div>}
    </div>
  )
}

// Batting Stance — batter-only, dims are just {pitch_hand: 'All'|'L'|'R'}.
function BattingStanceCard({ splitWindow }: { splitWindow: SplitWindow }) {
  const hasRecency = splitWindow.recency.length > 0
  const [windowSel, setWindowSel] = useState<'season' | 'recency'>(hasRecency ? 'recency' : 'season')
  const rows = windowSel === 'recency' ? splitWindow.recency : splitWindow.season
  const availableHands = useMemo(() => rows.map(r => r.dims.pitch_hand), [rows])
  const [handSel, setHandSel] = useState('All')

  if (!splitWindow.season.length && !splitWindow.recency.length) return null

  const row = rows.find(r => r.dims.pitch_hand === handSel) ?? rows.find(r => r.dims.pitch_hand === 'All')
  const m = row?.metrics ?? {}

  return (
    <div style={cardStyle}>
      <div style={sectionTitleStyle}>
        Batting Stance
        {hasRecency && (
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            <ToggleBtn active={windowSel === 'season'} onClick={() => setWindowSel('season')}>Season</ToggleBtn>
            <ToggleBtn active={windowSel === 'recency'} onClick={() => setWindowSel('recency')}>Last 6 Days</ToggleBtn>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {['All', 'L', 'R'].filter(h => availableHands.includes(h)).map(h => (
          <DimChip key={h} label={h === 'All' ? 'vs All' : `vs ${h}HP`} active={h === handSel} onClick={() => setHandSel(h)} />
        ))}
      </div>
      {row ? (
        <StatGrid pairs={[
          ['Stance Angle', d1(m.avg_stance_angle)],
          ['Foot Separation', d1(m.avg_foot_sep)],
          ['Batter Y Pos', d1(m.avg_batter_y_position)],
          ['Batter X Pos', d1(m.avg_batter_x_position)],
          ['Intercept vs Plate', d1(m.avg_intercept_y_vs_plate)],
          ['Intercept vs Batter', d1(m.avg_intercept_y_vs_batter)],
        ]} />
      ) : <div style={{ color: 'var(--text-3)', fontSize: 13 }}>No data.</div>}
    </div>
  )
}

export function PlayerPageClient({ mlbId }: { mlbId: string }) {
  const [data, setData] = useState<PlayerData | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Loaded separately from the rest of the page — this payload (every pitch
  // thrown/seen this season) is far heavier than everything else combined,
  // so it shouldn't block the initial render.
  const [pitchLog, setPitchLog] = useState<{ pitcherRows: PitcherPitchRow[]; batterRows: BatterPitchRow[] } | null>(null)

  useEffect(() => {
    fetch(`/api/players/${mlbId}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d) })
      .catch(() => setError('Failed to load player data'))
  }, [mlbId])

  useEffect(() => {
    fetch(`/api/players/${mlbId}/pitch-log`)
      .then(r => r.json())
      .then(d => setPitchLog({ pitcherRows: d.pitcherRows ?? [], batterRows: d.batterRows ?? [] }))
      .catch(() => setPitchLog({ pitcherRows: [], batterRows: [] }))
  }, [mlbId])

  if (error) return <div style={{ padding: 24, color: 'var(--red)' }}>{error}</div>
  if (!data) return <div style={{ padding: 24, color: 'var(--text-3)' }}>Loading…</div>

  const { player, seasonStats, careerStats, statcastSeason, pitchArsenal, form, splits, swingTake, battingStance, homeRuns, isBatter, isPitcher } = data

  const evb = statcastSeason.hitting.exit_velocity_barrels
  const xs = statcastSeason.hitting.expected_stats
  const bbp = statcastSeason.hitting.batted_ball_profile
  const hitHr = statcastSeason.hitting.home_runs
  const qoc = statcastSeason.hitting.statcast_quality_of_contact
  const pitEvb = statcastSeason.pitching.exit_velocity_barrels
  const pitXs = statcastSeason.pitching.expected_stats
  const pitHr = statcastSeason.pitching.home_runs
  const pitQoc = statcastSeason.pitching.statcast_quality_of_contact

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 16px 64px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <PlayerAvatar
          headshot={mlbHeadshot(player.mlb_id)}
          teamLogo={player.current_team_id ? mlbTeamLogo(player.current_team_id) : undefined}
          teamAbbr={player.current_team_abbr}
          name={player.full_name ?? ''}
          size={72}
        />
        <div>
          <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
            {player.full_name ?? `Player ${player.mlb_id}`}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {player.current_team_abbr && <span>{getTeamName(player.current_team_abbr)}</span>}
            {player.primary_position && <span>{player.primary_position}</span>}
            {player.bat_side && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Bats <HandBadge hand={player.bat_side} /></span>}
            {player.pitch_hand && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Throws <HandBadge hand={player.pitch_hand} /></span>}
            {player.height && <span>{player.height}</span>}
            {player.weight && <span>{player.weight} lb</span>}
            {player.mlb_debut && <span>Debut {player.mlb_debut}</span>}
          </div>
        </div>
      </div>

      {/* Season / career stats */}
      {isBatter && (
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Hitting<span style={windowTag}>{data.season} Season</span></div>
          {seasonStats.batting ? (
            <StatGrid pairs={[
              ['AVG', r3(seasonStats.batting.avg)], ['OBP', r3(seasonStats.batting.obp)],
              ['SLG', r3(seasonStats.batting.slg)], ['OPS', r3(seasonStats.batting.ops)],
              ['HR', i0(seasonStats.batting.home_runs)], ['RBI', i0(seasonStats.batting.rbi)],
              ['R', i0(seasonStats.batting.runs)], ['SB', i0(seasonStats.batting.stolen_bases)],
              ['BB', i0(seasonStats.batting.walks)], ['K', i0(seasonStats.batting.strikeouts)],
              ['G', i0(seasonStats.batting.games_played)],
            ]} />
          ) : <div style={{ color: 'var(--text-3)', fontSize: 13 }}>No {data.season} batting stats synced yet.</div>}
        </div>
      )}
      {isPitcher && (
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Pitching<span style={windowTag}>{data.season} Season</span></div>
          {seasonStats.pitching ? (
            <StatGrid pairs={[
              ['ERA', d1(seasonStats.pitching.era)], ['WHIP', r3(seasonStats.pitching.whip)],
              ['W', i0(seasonStats.pitching.wins)], ['L', i0(seasonStats.pitching.losses)],
              ['SV', i0(seasonStats.pitching.saves)], ['IP', d1(seasonStats.pitching.innings_pitched)],
              ['K', i0(seasonStats.pitching.strikeouts)], ['BB', i0(seasonStats.pitching.walks)],
              ['HR', i0(seasonStats.pitching.home_runs_allowed)], ['G', i0(seasonStats.pitching.games_played)],
              ['GS', i0(seasonStats.pitching.games_started)],
            ]} />
          ) : <div style={{ color: 'var(--text-3)', fontSize: 13 }}>No {data.season} pitching stats synced yet.</div>}
        </div>
      )}

      {/* Current form vs season */}
      {isBatter && form.batter && <FormComparisonCard role="batter" form={form.batter} />}
      {isPitcher && form.pitcher && <FormComparisonCard role="pitcher" form={form.pitcher} />}

      {/* Quality of contact snapshot */}
      {isBatter && (evb || xs || bbp || hitHr || qoc) && (
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Quality of Contact<span style={windowTag}>{data.season} Season</span></div>
          <StatGrid pairs={([
            evb && ['Exit Velo', d1(evb.exit_velocity_avg)],
            evb && ['Barrel %', p1(evb.barrel_batted_rate)],
            evb && ['Hard Hit %', p1(evb.hard_hit_percent)],
            xs && ['xBA', r3(xs.xba)], xs && ['xSLG', r3(xs.xslg)], xs && ['xwOBA', r3(xs.xwoba)],
            hitHr && ['HR', i0(hitHr.hr_total)], hitHr && ['xHR', d1(hitHr.xhr)],
            qoc && ['Max EV', d1(qoc.max_hit_speed)], qoc && ['Max Dist', i0(qoc.max_distance)],
            bbp && ['Pull %', p1(bbp.pull_percent)], bbp && ['FB %', p1(bbp.flyballs_percent)],
          ].filter(Boolean)) as [string, string][]} />
        </div>
      )}
      {isPitcher && (pitEvb || pitXs || pitHr || pitQoc) && (
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Quality of Contact Allowed<span style={windowTag}>{data.season} Season</span></div>
          <StatGrid pairs={([
            pitEvb && ['Exit Velo', d1(pitEvb.exit_velocity_avg)],
            pitEvb && ['Barrel %', p1(pitEvb.barrel_batted_rate)],
            pitEvb && ['Hard Hit %', p1(pitEvb.hard_hit_percent)],
            pitXs && ['xBA', r3(pitXs.xba)], pitXs && ['xSLG', r3(pitXs.xslg)], pitXs && ['xwOBA', r3(pitXs.xwoba)],
            pitHr && ['HR', i0(pitHr.hr_total)], pitHr && ['xHR', d1(pitHr.xhr)],
            pitQoc && ['Max EV', d1(pitQoc.max_hit_speed)],
          ].filter(Boolean)) as [string, string][]} />
        </div>
      )}

      {/* Zone profile heatmap (pitcher) + full custom matchup explorer
          (batter) — built directly off the raw pitch log, loaded
          separately from the rest of this page (see pitchLog state) */}
      {isPitcher && pitchLog && pitchLog.pitcherRows.length > 0 && <PitchZoneHeatmap rows={pitchLog.pitcherRows} />}
      {isBatter && pitchLog && pitchLog.batterRows.length > 0 && <BatterMatchupExplorer rows={pitchLog.batterRows} />}

      {/* Fully customizable split explorers — pitch type / hand / contact
          type breakdowns, season or recency, user-picked grouping */}
      {isBatter && splits.batter && CATEGORY_CONFIGS.map(cfg => (
        splits.batter[cfg.key] ? <SplitExplorer key={`bat-${cfg.key}`} config={cfg} splitWindow={splits.batter[cfg.key]} /> : null
      ))}
      {isPitcher && splits.pitcher && CATEGORY_CONFIGS.map(cfg => (
        splits.pitcher[cfg.key] ? <SplitExplorer key={`pit-${cfg.key}`} config={cfg} splitWindow={splits.pitcher[cfg.key]} /> : null
      ))}

      {/* Swing/Take run-value explorer */}
      {isBatter && swingTake.batter && <SwingTakeExplorer rows={swingTake.batter} title="Swing/Take Run Value" />}
      {isPitcher && swingTake.pitcher && <SwingTakeExplorer rows={swingTake.pitcher} title="Swing/Take Run Value (Pitching)" />}

      {/* Batting stance */}
      {isBatter && battingStance && <BattingStanceCard splitWindow={battingStance} />}

      {/* Season pitch-arsenal-stats summary table */}
      {isBatter && pitchArsenal.batter.length > 0 && (
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Batted Ball — vs. Pitch Type<span style={windowTag}>{data.season} Season</span></div>
          <PitchArsenalTable rows={pitchArsenal.batter} />
        </div>
      )}
      {isPitcher && pitchArsenal.pitcher.length > 0 && (
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Pitch Arsenal<span style={windowTag}>{data.season} Season</span></div>
          <PitchArsenalTable rows={pitchArsenal.pitcher} />
        </div>
      )}

      {/* Home run logs */}
      {homeRuns.hit.length > 0 && (
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Recent Home Runs</div>
          <HrTable rows={homeRuns.hit} opponentIdKey="pitcher_id" opponentNameKey="pitcher_name" />
        </div>
      )}
      {homeRuns.allowed.length > 0 && (
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Recent Home Runs Allowed</div>
          <HrTable rows={homeRuns.allowed} opponentIdKey="batter_id" opponentNameKey="batter_name" />
        </div>
      )}
    </div>
  )
}

function PitchArsenalTable({ rows }: { rows: Record<string, any>[] }) {
  const [sort, setSort] = useState<SortState>({ col: 'pitches', dir: 'desc' })
  const onSort = (col: string) => setSort(prev => toggleSortState(prev, col))
  const sorted = [...rows].sort((a, b) => cmpNullsLast(a[sort!.col], b[sort!.col], sort!.dir))

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-3)', fontWeight: 700 }}>Pitch</th>
            <SortableTH label="Pitches" colKey="pitches" sort={sort} onSort={onSort} />
            <SortableTH label="Usage %" colKey="pitch_usage" sort={sort} onSort={onSort} />
            <SortableTH label="PA" colKey="pa" sort={sort} onSort={onSort} />
            <SortableTH label="BA" colKey="ba" sort={sort} onSort={onSort} />
            <SortableTH label="xwOBA" colKey="est_woba" sort={sort} onSort={onSort} />
            <SortableTH label="Whiff %" colKey="whiff_percent" sort={sort} onSort={onSort} />
            <SortableTH label="RV/100" colKey="run_value_per_100" sort={sort} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 10px', color: 'var(--text-1)', fontWeight: 700 }}><PitchBadge code={r.pitchType} /></td>
              <td style={{ padding: '6px 10px', textAlign: 'right' }}>{i0(r.pitches)}</td>
              <td style={{ padding: '6px 10px', textAlign: 'right' }}>{p1(r.pitch_usage)}</td>
              <td style={{ padding: '6px 10px', textAlign: 'right' }}>{i0(r.pa)}</td>
              <td style={{ padding: '6px 10px', textAlign: 'right' }}>{r3(r.ba)}</td>
              <td style={{ padding: '6px 10px', textAlign: 'right' }}>{r3(r.est_woba)}</td>
              <td style={{ padding: '6px 10px', textAlign: 'right' }}>{p1(r.whiff_percent)}</td>
              <td style={{ padding: '6px 10px', textAlign: 'right', color: (r.run_value_per_100 ?? 0) >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                {d1(r.run_value_per_100)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HrTable({ rows, opponentIdKey, opponentNameKey }: { rows: Record<string, any>[]; opponentIdKey: 'pitcher_id' | 'batter_id'; opponentNameKey: 'pitcher_name' | 'batter_name' }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ color: 'var(--text-3)', textAlign: 'left' }}>
            <th style={{ padding: '6px 10px' }}>Date</th>
            <th style={{ padding: '6px 10px' }}>{opponentIdKey === 'pitcher_id' ? 'Pitcher' : 'Batter'}</th>
            <th style={{ padding: '6px 10px' }}>Result</th>
            <th style={{ padding: '6px 10px' }}>EV</th>
            <th style={{ padding: '6px 10px' }}>LA</th>
            <th style={{ padding: '6px 10px' }}>Dist</th>
            <th style={{ padding: '6px 10px' }}>Category</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 10px', color: 'var(--text-2)' }}>{r.game_date}</td>
              <td style={{ padding: '6px 10px' }}>
                <PlayerLink mlbId={r[opponentIdKey]} name={r[opponentNameKey]} teamAbbr={r.opponent_team} size={22} />
              </td>
              <td style={{ padding: '6px 10px', textTransform: 'capitalize', color: resultColor(r.result), fontWeight: 700 }}>
                {String(r.result ?? '').replace(/_/g, ' ')}
              </td>
              <td style={{ padding: '6px 10px' }}>{d1(r.exit_velocity)}</td>
              <td style={{ padding: '6px 10px' }}>{i0(r.launch_angle)}</td>
              <td style={{ padding: '6px 10px' }}>{i0(r.hr_distance)}</td>
              <td style={{ padding: '6px 10px', color: HR_CAT_COLORS[r.hr_cat] ?? 'var(--text-3)', fontWeight: 700 }}>{r.hr_cat ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

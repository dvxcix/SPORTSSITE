'use client'

import { useEffect, useMemo, useState } from 'react'
import { pitchLabel } from '@/lib/mlb-api'
import { heat } from '@/components/pitcher-report/MatchupTables'
import { cardStyle, sectionTitleStyle, windowTag, ToggleBtn, DimChip } from './PlayerPageClient'
import { PlayerPicker, type PickerOption } from './PlayerPicker'

export type PitcherPitchRow = {
  game_pk: string; game_date: string; pitcher_id: number; batter_id: number
  pitch_type: string | null; zone: number | null
  is_in_play: boolean; is_swing: boolean; is_whiff: boolean
  launch_speed: number | null; run_value: number | null
  stand: string | null
  opponent_id: number; opponent_name: string; opponent_team: string | null
}

// Savant's own 1-9 zone codes, laid out as the standard broadcast strike-
// zone-plot grid (catcher's-eye view of the plate): row-major top-left to
// bottom-right. 11-14 are the four outside "chase" corners.
const CORE_ZONES = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const CHASE_ZONES = [11, 12, 13, 14]

type MetricKey = 'run_value' | 'whiff_pct' | 'hard_hit_pct'
// dir: which end of the raw value counts as "green/good for the pitcher" —
// a very negative run value, a high whiff%, or a low hard-hit% are all good.
const METRICS: { key: MetricKey; label: string; dir: 'hi' | 'lo' }[] = [
  { key: 'run_value', label: 'Run Value', dir: 'lo' },
  { key: 'whiff_pct', label: 'Whiff %', dir: 'hi' },
  { key: 'hard_hit_pct', label: 'Hard-Hit %', dir: 'lo' },
]

function cellStats(rows: PitcherPitchRow[]) {
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
  } as Record<MetricKey | 'count', number | null>
}

function fmt(v: number | null, key: MetricKey): string {
  if (v == null) return '—'
  return key === 'run_value' ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}` : `${v.toFixed(1)}%`
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, minWidth: 84 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

const dateInputStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)',
}

export type TodayOpponentTeam = { teamAbbr: string; teamName: string; lineupIds: number[]; confirmed: boolean }

// Aggregate + zone-bin a pitcher's own pitch log — green = favorable to the
// pitcher, red = vulnerable, using the same min/max heat() scale the split
// tables already use, just fed zone cells instead of table columns.
export function PitchZoneHeatmap({ rows, todayOpponent }: { rows: PitcherPitchRow[]; todayOpponent?: TodayOpponentTeam | null }) {
  const pitchTypes = useMemo(() => Array.from(new Set(rows.map(r => r.pitch_type).filter((v): v is string => !!v))), [rows])
  const batters = useMemo(() => {
    const counts = new Map<number, PickerOption>()
    for (const r of rows) {
      const e = counts.get(r.batter_id)
      if (e) e.count++
      else counts.set(r.batter_id, { id: r.batter_id, name: r.opponent_name, teamAbbr: r.opponent_team, count: 1 })
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count)
  }, [rows])

  const [pitchTypeSel, setPitchTypeSel] = useState('all')
  const [handSel, setHandSel] = useState<'all' | 'L' | 'R'>('all')
  const [batterSel, setBatterSel] = useState<number | 'all'>('all')
  const [useTodayLineup, setUseTodayLineup] = useState(false)
  const [autoAppliedToday, setAutoAppliedToday] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [metric, setMetric] = useState<MetricKey>('run_value')

  // Defaults to today's actual opposing lineup the moment that context
  // loads — fires once, same pattern as BatterMatchupExplorer's opponent
  // default; a manual pick afterward is never overwritten.
  useEffect(() => {
    if (todayOpponent && todayOpponent.lineupIds.length && !autoAppliedToday) {
      setUseTodayLineup(true)
      setAutoAppliedToday(true)
    }
  }, [todayOpponent, autoAppliedToday])

  const todayLineupIds = useMemo(() => new Set(todayOpponent?.lineupIds ?? []), [todayOpponent])

  function selectBatter(v: number | 'all') {
    setBatterSel(v)
    setUseTodayLineup(false)
  }
  function selectTodayLineup() {
    setUseTodayLineup(true)
    setBatterSel('all')
  }

  const filtered = useMemo(() => rows.filter(r =>
    (pitchTypeSel === 'all' || r.pitch_type === pitchTypeSel) &&
    (handSel === 'all' || r.stand === handSel) &&
    (useTodayLineup ? todayLineupIds.has(r.batter_id) : (batterSel === 'all' || r.batter_id === batterSel)) &&
    (!dateFrom || r.game_date >= dateFrom) &&
    (!dateTo || r.game_date <= dateTo)
  ), [rows, pitchTypeSel, handSel, useTodayLineup, todayLineupIds, batterSel, dateFrom, dateTo])

  if (!rows.length) return null

  const byZone = new Map<number, PitcherPitchRow[]>()
  for (const r of filtered) {
    if (r.zone == null) continue
    const list = byZone.get(r.zone)
    if (list) list.push(r); else byZone.set(r.zone, [r])
  }
  const cellByZone = new Map<number, ReturnType<typeof cellStats>>()
  for (const z of [...CORE_ZONES, ...CHASE_ZONES]) cellByZone.set(z, cellStats(byZone.get(z) ?? []))
  const activeMetric = METRICS.find(m => m.key === metric)!
  const coreValues = CORE_ZONES.map(z => cellByZone.get(z)![metric])

  const chaseRows = CHASE_ZONES.flatMap(z => byZone.get(z) ?? [])
  const chaseStats = cellStats(chaseRows)
  const chaseSwingPct = chaseRows.length ? (chaseRows.filter(r => r.is_swing).length / chaseRows.length) * 100 : null

  return (
    <div style={cardStyle}>
      <div style={sectionTitleStyle}>
        Zone Profile
        <span style={windowTag}>{filtered.length.toLocaleString()} pitches</span>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Color by:</span>
        {METRICS.map(m => <ToggleBtn key={m.key} active={metric === m.key} onClick={() => setMetric(m.key)}>{m.label}</ToggleBtn>)}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Date range:</span>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={dateInputStyle} />
        <span style={{ color: 'var(--text-3)', fontSize: 11 }}>–</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={dateInputStyle} />
        {(dateFrom || dateTo) && <ToggleBtn active={false} onClick={() => { setDateFrom(''); setDateTo('') }}>Clear</ToggleBtn>}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Batter hand:</span>
        <DimChip label="All" active={handSel === 'all'} onClick={() => setHandSel('all')} />
        <DimChip label="vs LHB" active={handSel === 'L'} onClick={() => setHandSel('L')} />
        <DimChip label="vs RHB" active={handSel === 'R'} onClick={() => setHandSel('R')} />
        <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6 }}>Vs. batter:</span>
        {todayOpponent && todayOpponent.lineupIds.length > 0 && (
          <DimChip
            label={`Today vs ${todayOpponent.teamAbbr}${todayOpponent.confirmed ? '' : ' (Projected)'}`}
            active={useTodayLineup}
            onClick={selectTodayLineup}
          />
        )}
        <PlayerPicker options={batters} value={useTodayLineup ? 'all' : batterSel} onChange={selectBatter} placeholder="All batters" />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Pitch:</span>
        <DimChip label="All" active={pitchTypeSel === 'all'} onClick={() => setPitchTypeSel('all')} />
        {pitchTypes.map(pt => (
          <DimChip key={pt} label={pitchLabel(pt)} active={pitchTypeSel === pt} onClick={() => setPitchTypeSel(pt)} />
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ color: 'var(--text-3)', fontSize: 13 }}>No pitches match this combination of filters.</div>
      ) : (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 68px)', gridTemplateRows: 'repeat(3, 68px)', gap: 3 }}>
            {CORE_ZONES.map(z => {
              const c = cellByZone.get(z)!
              const v = c[metric]
              return (
                <div
                  key={z}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)',
                    ...heat(v, coreValues, activeMetric.dir),
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>{fmt(v, metric)}</span>
                  <span style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}>{c.count} pitch{c.count === 1 ? '' : 'es'}</span>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.04em' }}>CHASE ZONE (OUT OF ZONE)</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <MiniStat label="Pitches" value={String(chaseStats.count)} />
              <MiniStat label="Chase Swing%" value={chaseSwingPct == null ? '—' : `${chaseSwingPct.toFixed(1)}%`} />
              <MiniStat label="Whiff%" value={chaseStats.whiff_pct == null ? '—' : `${chaseStats.whiff_pct.toFixed(1)}%`} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

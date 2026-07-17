'use client'

import { useEffect, useMemo, useState } from 'react'
import { pitchLabel } from '@/lib/mlb-api'
import { cardStyle, sectionTitleStyle, windowTag, ToggleBtn, DimChip } from './PlayerPageClient'
import { PlayerPicker, type PickerOption } from './PlayerPicker'
import { ZoneScoreCard } from './ZoneScoreCard'
import { ZoneGrid, ChaseZoneStats, ZONE_METRICS, type ZoneMetricKey } from './ZoneGrid'
import { type PitcherPitchRow } from '@/lib/batterStatsEngine'

export type { PitcherPitchRow }

const dateInputStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)',
}

export type TodayOpponentTeam = { teamAbbr: string; teamName: string; lineupIds: number[]; confirmed: boolean }

// Aggregate + zone-bin a pitcher's own pitch log — green = favorable to the
// pitcher, red = vulnerable, using the same min/max heat() scale the split
// tables already use, just fed zone cells instead of table columns.
export function PitchZoneHeatmap({ rows, myName, todayOpponent }: { rows: PitcherPitchRow[]; myName: string; todayOpponent?: TodayOpponentTeam | null }) {
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
  const [metric, setMetric] = useState<ZoneMetricKey>('run_value')

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

  const activeMetric = ZONE_METRICS.find(m => m.key === metric)!
  // Zone Score only makes sense against one specific batter, not a whole
  // lineup — "today's opposing lineup" mode blends 9 different batters'
  // tendencies, which isn't a real single zone profile to compare against.
  const selectedBatter = !useTodayLineup && batterSel !== 'all' ? batters.find(b => b.id === batterSel) ?? null : null

  return (
    <>
    <div style={cardStyle}>
      <div style={sectionTitleStyle}>
        Zone Profile
        <span style={windowTag}>{filtered.length.toLocaleString()} pitches</span>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Color by:</span>
        {ZONE_METRICS.map(m => <ToggleBtn key={m.key} active={metric === m.key} onClick={() => setMetric(m.key)}>{m.label}</ToggleBtn>)}
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
          <ZoneGrid rows={filtered} metric={metric} dir={activeMetric.dir} />
          <ChaseZoneStats rows={filtered} />
        </div>
      )}
    </div>
    {selectedBatter && (
      <ZoneScoreCard pageRole="pitcher" myName={myName} myRows={rows} opponentId={selectedBatter.id} opponentName={selectedBatter.name} />
    )}
    </>
  )
}
